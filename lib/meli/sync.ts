import 'server-only';
import { after } from 'next/server';
import { and, eq, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  meliAccounts,
  meliItems,
  meliQuestions,
  type MeliAccount
} from '@/lib/db/schema';
import {
  fetchMeliItems,
  getMeliQuestion,
  MeliApiError,
  searchMeliItemIds,
  searchMeliQuestions,
  type MeliItemStatus,
  type MeliItemSummary,
  type MeliQuestion,
  type MeliQuestionStatus
} from './api';
import { getMeliAccessToken } from './tokens';

export type SyncKind = 'questions' | 'items';

const PAGE = 50;
const MAX_UNANSWERED = 1000;
const MAX_ANSWERED_PAGES = 10; // backfill cap on the first sync (500 questions)
const MAX_ITEMS = 1000;
const LOCK_TIMEOUT_MS = 2 * 60_000;
const ITEM_ATTRIBUTES =
  'id,title,thumbnail,permalink,price,currency_id,available_quantity,status';

export const syncTtlMs = () =>
  (Number(process.env.MELI_SYNC_TTL_SECONDS) || 300) * 1000;

// ---------------------------------------------------------------- upserts

export async function upsertQuestions(accountId: number, questions: MeliQuestion[]) {
  for (let i = 0; i < questions.length; i += 100) {
    const chunk = questions.slice(i, i + 100);
    await db
      .insert(meliQuestions)
      .values(
        chunk.map((q) => ({
          meliAccountId: accountId,
          meliQuestionId: q.id,
          itemId: q.item_id,
          text: q.text,
          status: q.status,
          fromUserId: q.from?.id ?? null,
          dateCreated: new Date(q.date_created),
          answerText: q.answer?.text ?? null,
          answerDate: q.answer ? new Date(q.answer.date_created) : null,
          syncedAt: new Date()
        }))
      )
      .onConflictDoUpdate({
        target: [meliQuestions.meliAccountId, meliQuestions.meliQuestionId],
        set: {
          itemId: sql`excluded.item_id`,
          text: sql`excluded.text`,
          status: sql`excluded.status`,
          answerText: sql`excluded.answer_text`,
          answerDate: sql`excluded.answer_date`,
          syncedAt: sql`excluded.synced_at`
        }
      });
  }
}

export async function upsertItems(accountId: number, items: MeliItemSummary[]) {
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    await db
      .insert(meliItems)
      .values(
        chunk.map((item) => ({
          meliAccountId: accountId,
          itemId: item.id,
          title: item.title,
          thumbnail: item.thumbnail ?? null,
          permalink: item.permalink ?? null,
          price: item.price != null ? String(item.price) : null,
          currencyId: item.currency_id ?? null,
          availableQuantity: item.available_quantity ?? null,
          status: item.status ?? 'active',
          syncedAt: new Date()
        }))
      )
      .onConflictDoUpdate({
        target: [meliItems.meliAccountId, meliItems.itemId],
        set: {
          title: sql`excluded.title`,
          thumbnail: sql`excluded.thumbnail`,
          permalink: sql`excluded.permalink`,
          price: sql`excluded.price`,
          currencyId: sql`excluded.currency_id`,
          availableQuantity: sql`excluded.available_quantity`,
          status: sql`excluded.status`,
          syncedAt: sql`excluded.synced_at`
        }
      });
  }
}

// Questions can reference listings we never stored (closed, other pages...).
async function ensureItems(accountId: number, token: string, itemIds: string[]) {
  const unique = [...new Set(itemIds)];
  if (unique.length === 0) return;

  const known = await db
    .select({ itemId: meliItems.itemId })
    .from(meliItems)
    .where(and(eq(meliItems.meliAccountId, accountId), inArray(meliItems.itemId, unique)));
  const knownIds = new Set(known.map((k) => k.itemId));
  const missing = unique.filter((id) => !knownIds.has(id));
  if (missing.length === 0) return;

  const fetched = await fetchMeliItems(token, missing, ITEM_ATTRIBUTES);
  // Items MercadoLibre won't return still get a placeholder so joins work.
  await upsertItems(
    accountId,
    missing.map((id) => fetched[id] ?? { id, title: id, status: 'unknown' })
  );
}

// ------------------------------------------------------------------ syncs

async function syncQuestions(account: MeliAccount, token: string) {
  const collected = new Map<number, MeliQuestion>();
  const unansweredIds = new Set<number>();

  // 1. Every unanswered question.
  for (let offset = 0; offset < MAX_UNANSWERED; offset += PAGE) {
    const page = await searchMeliQuestions(token, {
      sellerId: account.meliUserId,
      status: 'UNANSWERED' as MeliQuestionStatus,
      offset,
      limit: PAGE
    });
    for (const q of page.questions) {
      collected.set(q.id, q);
      unansweredIds.add(q.id);
    }
    if (offset + PAGE >= page.total || page.questions.length === 0) break;
  }

  // 2. Answered ones, newest first, until we hit a page we already have.
  for (let pageNo = 0; pageNo < MAX_ANSWERED_PAGES; pageNo++) {
    const page = await searchMeliQuestions(token, {
      sellerId: account.meliUserId,
      status: 'ANSWERED',
      offset: pageNo * PAGE,
      limit: PAGE
    });
    if (page.questions.length === 0) break;
    page.questions.forEach((q) => collected.set(q.id, q));

    const known = await db
      .select({ id: meliQuestions.meliQuestionId })
      .from(meliQuestions)
      .where(
        and(
          eq(meliQuestions.meliAccountId, account.id),
          eq(meliQuestions.status, 'ANSWERED'),
          inArray(
            meliQuestions.meliQuestionId,
            page.questions.map((q) => q.id)
          )
        )
      );
    if (known.length === page.questions.length) break;
    if ((pageNo + 1) * PAGE >= page.total) break;
  }

  await ensureItems(
    account.id,
    token,
    [...collected.values()].map((q) => q.item_id)
  );
  await upsertQuestions(account.id, [...collected.values()]);

  // 3. Local "unanswered" rows MercadoLibre no longer lists: answered
  //    elsewhere, closed or deleted. Re-read them to learn what happened.
  const stale = await db
    .select({ id: meliQuestions.meliQuestionId })
    .from(meliQuestions)
    .where(
      and(
        eq(meliQuestions.meliAccountId, account.id),
        eq(meliQuestions.status, 'UNANSWERED'),
        unansweredIds.size
          ? notInArray(meliQuestions.meliQuestionId, [...unansweredIds])
          : sql`true`
      )
    )
    .limit(50);

  const reread = await Promise.allSettled(
    stale.map((s) => getMeliQuestion(token, s.id))
  );
  const updated: MeliQuestion[] = [];
  const gone: number[] = [];
  reread.forEach((r, i) => {
    if (r.status === 'fulfilled') updated.push(r.value);
    else if (r.reason instanceof MeliApiError && r.reason.status === 404) {
      gone.push(stale[i].id);
    }
  });
  await upsertQuestions(account.id, updated);
  if (gone.length) {
    await db
      .update(meliQuestions)
      .set({ status: 'DELETED', syncedAt: new Date() })
      .where(
        and(
          eq(meliQuestions.meliAccountId, account.id),
          inArray(meliQuestions.meliQuestionId, gone)
        )
      );
  }

  await db
    .update(meliAccounts)
    .set({ questionsSyncedAt: new Date() })
    .where(eq(meliAccounts.id, account.id));
}

async function syncItems(account: MeliAccount, token: string) {
  const seen = new Set<string>();
  let complete = true;

  for (const status of ['active', 'paused'] as MeliItemStatus[]) {
    for (let offset = 0; ; offset += PAGE) {
      if (offset >= MAX_ITEMS) {
        complete = false;
        break;
      }
      const page = await searchMeliItemIds(token, {
        sellerId: account.meliUserId,
        status,
        offset,
        limit: PAGE
      });
      if (page.ids.length === 0) break;

      const details = await fetchMeliItems(token, page.ids, ITEM_ATTRIBUTES);
      const rows = page.ids.flatMap((id) => (details[id] ? [details[id]] : []));
      rows.forEach((r) => seen.add(r.id));
      await upsertItems(account.id, rows);

      if (offset + PAGE >= page.total) break;
    }
  }

  // Only mark the rest as unlisted if we saw the whole catalogue.
  if (complete) {
    await db
      .update(meliItems)
      .set({ status: 'unlisted', syncedAt: new Date() })
      .where(
        and(
          eq(meliItems.meliAccountId, account.id),
          inArray(meliItems.status, ['active', 'paused']),
          seen.size ? notInArray(meliItems.itemId, [...seen]) : sql`true`
        )
      );
  }

  await db
    .update(meliAccounts)
    .set({ itemsSyncedAt: new Date() })
    .where(eq(meliAccounts.id, account.id));
}

// ---------------------------------------------------------- orchestration

export type SyncResult = { ok: boolean; skipped?: boolean; error?: string };

// Runs a sync under a per-account lock. Never throws: failures are stored in
// meli_accounts.last_sync_error so the UI can show them.
export async function runSync(accountId: number, kind: SyncKind): Promise<SyncResult> {
  const [locked] = await db
    .update(meliAccounts)
    .set({ syncStartedAt: new Date() })
    .where(
      and(
        eq(meliAccounts.id, accountId),
        or(
          isNull(meliAccounts.syncStartedAt),
          lt(meliAccounts.syncStartedAt, new Date(Date.now() - LOCK_TIMEOUT_MS))
        )
      )
    )
    .returning();
  if (!locked) return { ok: true, skipped: true };

  try {
    const token = await getMeliAccessToken(locked);
    if (kind === 'questions') await syncQuestions(locked, token);
    else await syncItems(locked, token);

    await db
      .update(meliAccounts)
      .set({ syncStartedAt: null, lastSyncError: null })
      .where(eq(meliAccounts.id, accountId));
    return { ok: true };
  } catch (error) {
    console.error(`MercadoLibre ${kind} sync failed:`, error);
    const message =
      error instanceof MeliApiError && [400, 401, 403].includes(error.status)
        ? 'MercadoLibre rechazó el acceso. Reconectá la cuenta.'
        : 'No pudimos sincronizar con MercadoLibre.';
    await db
      .update(meliAccounts)
      .set({ syncStartedAt: null, lastSyncError: message })
      .where(eq(meliAccounts.id, accountId));
    return { ok: false, error: message };
  }
}

// First sync blocks (nothing to show yet); later ones refresh in the
// background once the data is older than the TTL.
export async function ensureFresh(
  account: Pick<MeliAccount, 'id' | 'questionsSyncedAt' | 'itemsSyncedAt'>,
  kind: SyncKind
) {
  const last = kind === 'questions' ? account.questionsSyncedAt : account.itemsSyncedAt;
  if (!last) {
    await runSync(account.id, kind);
  } else if (Date.now() - last.getTime() > syncTtlMs()) {
    after(async () => {
      await runSync(account.id, kind);
    });
  }
}

// Webhook path: re-read one resource and store it. Idempotent, no lock.
export async function syncResource(
  account: MeliAccount,
  topic: SyncKind,
  resource: string
) {
  const token = await getMeliAccessToken(account);
  if (topic === 'questions') {
    const id = Number(resource.split('/').pop());
    const question = await getMeliQuestion(token, id);
    if (question.seller_id !== account.meliUserId) return;
    await ensureItems(account.id, token, [question.item_id]);
    await upsertQuestions(account.id, [question]);
  } else {
    const id = resource.split('/').pop()!;
    const items = await fetchMeliItems(token, [id], ITEM_ATTRIBUTES);
    if (items[id]) await upsertItems(account.id, [items[id]]);
  }
}
