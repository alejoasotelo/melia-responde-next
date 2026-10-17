import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, count, desc, eq, gte, ilike, lt, or } from 'drizzle-orm';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/db/drizzle';
import {
  answerSubmissions,
  meliItems,
  meliQuestions,
  questionDrafts,
  users
} from '@/lib/db/schema';
import { getMeliAccountForTeam } from '@/lib/db/queries';
import { getMeliContext, selectMeliAccount } from '@/lib/meli/context';
import { ensureFresh } from '@/lib/meli/sync';
import { AccountSelector } from '../account-selector';
import { SyncBar } from '../sync-bar';
import { QuestionsBoard, type QuestionView } from './questions-board';

const PAGE_SIZE = 20;

type Status = 'UNANSWERED' | 'ANSWERED';

const TABS: { status: Status; label: string }[] = [
  { status: 'UNANSWERED', label: 'Sin responder' },
  { status: 'ANSWERED', label: 'Respondidas (histórico)' }
];

const formatDate = (date: Date) =>
  date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function QuestionsPage({
  searchParams
}: {
  searchParams: Promise<{
    account?: string;
    status?: string;
    page?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const ctx = await getMeliContext();
  if (!ctx) redirect('/sign-in');

  const params = await searchParams;
  const { accounts, current } = await selectMeliAccount(
    ctx.team.id,
    params.account
  );

  if (!current) {
    return (
      <section className="flex-1 p-4 lg:p-8">
        <h1 className="text-lg lg:text-2xl font-medium mb-6">Preguntas</h1>
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <p className="text-muted-foreground">
              Conectá una cuenta de MercadoLibre para ver sus preguntas.
            </p>
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
              <Link href="/dashboard/meli">Conectar cuenta</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const status: Status = params.status === 'ANSWERED' ? 'ANSWERED' : 'UNANSWERED';
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const q = params.q?.trim().slice(0, 100) || '';
  const from = params.from && DATE.test(params.from) ? params.from : '';
  const to = params.to && DATE.test(params.to) ? params.to : '';

  // Data comes from our database; MercadoLibre is only hit when it is stale.
  const account = await getMeliAccountForTeam(current.id, ctx.team.id);
  if (!account) redirect('/dashboard/meli');
  await ensureFresh(account, 'questions');
  const fresh = (await getMeliAccountForTeam(current.id, ctx.team.id)) ?? account;

  const href = (overrides: { status?: string; page?: number }) => {
    const query = new URLSearchParams({
      account: String(current.id),
      status: overrides.status ?? status,
      page: String(overrides.page ?? 1)
    });
    if (q) query.set('q', q);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    return `/dashboard/questions?${query}`;
  };

  const dateColumn =
    status === 'ANSWERED' ? meliQuestions.answerDate : meliQuestions.dateCreated;
  const where = and(
    eq(meliQuestions.meliAccountId, current.id),
    eq(meliQuestions.status, status),
    q
      ? or(
          ilike(meliQuestions.text, `%${q}%`),
          ilike(meliQuestions.answerText, `%${q}%`)
        )
      : undefined,
    from ? gte(dateColumn, new Date(`${from}T00:00:00`)) : undefined,
    to
      ? lt(dateColumn, new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000))
      : undefined
  );

  const [[{ total }], [{ draftCount }], rows] = await Promise.all([
    db.select({ total: count() }).from(meliQuestions).where(where),
    db
      .select({ draftCount: count() })
      .from(questionDrafts)
      .where(eq(questionDrafts.meliAccountId, current.id)),
    db
      .select({
        question: meliQuestions,
        itemTitle: meliItems.title,
        itemThumbnail: meliItems.thumbnail,
        itemPermalink: meliItems.permalink,
        draft: questionDrafts.draft,
        sentByName: users.name,
        sentByEmail: users.email,
        submissionStatus: answerSubmissions.status
      })
      .from(meliQuestions)
      .leftJoin(
        meliItems,
        and(
          eq(meliItems.meliAccountId, meliQuestions.meliAccountId),
          eq(meliItems.itemId, meliQuestions.itemId)
        )
      )
      .leftJoin(
        questionDrafts,
        and(
          eq(questionDrafts.meliAccountId, meliQuestions.meliAccountId),
          eq(questionDrafts.meliQuestionId, meliQuestions.meliQuestionId)
        )
      )
      .leftJoin(
        answerSubmissions,
        and(
          eq(answerSubmissions.meliAccountId, meliQuestions.meliAccountId),
          eq(answerSubmissions.meliQuestionId, meliQuestions.meliQuestionId),
          eq(answerSubmissions.status, 'sent')
        )
      )
      .leftJoin(users, eq(users.id, answerSubmissions.sentBy))
      .where(where)
      .orderBy(desc(dateColumn))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
  ]);

  const views: QuestionView[] = rows.map((r) => ({
    id: r.question.meliQuestionId,
    text: r.question.text,
    dateLabel: formatDate(r.question.dateCreated),
    itemId: r.question.itemId,
    itemTitle: r.itemTitle,
    itemThumbnail: r.itemThumbnail,
    itemPermalink: r.itemPermalink,
    answer: r.question.answerText
      ? {
          text: r.question.answerText,
          dateLabel: r.question.answerDate ? formatDate(r.question.answerDate) : '',
          sentBy:
            r.submissionStatus === 'sent'
              ? (r.sentByName ?? r.sentByEmail ?? 'un usuario del equipo')
              : null
        }
      : null,
    draft: r.draft
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg lg:text-2xl font-medium">Preguntas</h1>
        {accounts.length > 1 || ctx.team.planName === 'Agencia' ? (
          <AccountSelector
            basePath="/dashboard/questions"
            currentId={current.id}
            accounts={accounts.map((a) => ({
              id: a.id,
              label: a.nickname ?? `Cuenta ${a.meliUserId}`
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Cuenta: {current.nickname ?? current.meliUserId}
          </p>
        )}
      </div>

      <SyncBar
        accountId={current.id}
        kind="questions"
        syncedAtLabel={fresh.questionsSyncedAt ? formatDate(fresh.questionsSyncedAt) : null}
        lastError={fresh.lastSyncError}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <Button
              key={tab.status}
              asChild
              size="sm"
              variant={tab.status === status ? 'secondary' : 'ghost'}
            >
              <Link href={href({ status: tab.status })}>{tab.label}</Link>
            </Button>
          ))}
        </div>
        <form action="/dashboard/questions" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="account" value={current.id} />
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar texto"
            aria-label="Buscar en preguntas y respuestas"
            className="h-9 w-40 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <input type="date" name="from" defaultValue={from} aria-label="Desde" className="h-9 rounded-md border bg-background px-2 text-sm" />
          <input type="date" name="to" defaultValue={to} aria-label="Hasta" className="h-9 rounded-md border bg-background px-2 text-sm" />
          <Button type="submit" size="sm" variant="outline">
            <Search />
            Filtrar
          </Button>
        </form>
      </div>

      {views.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">
              {q || from || to
                ? 'No hay preguntas que coincidan con el filtro.'
                : status === 'UNANSWERED'
                  ? 'No tenés preguntas sin responder. ¡Todo al día!'
                  : 'Todavía no hay preguntas respondidas.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <QuestionsBoard
            // Reset selection when switching account/tab/page.
            key={`${current.id}-${status}-${page}-${q}-${from}-${to}`}
            accountId={current.id}
            questions={views}
            accountDraftCount={draftCount}
            selectable={status === 'UNANSWERED'}
          />

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <Button asChild variant="outline" size="sm">
                <Link
                  href={href({ page: page - 1 })}
                  aria-disabled={page <= 1}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                >
                  Anterior
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages} · {total} preguntas
              </span>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={href({ page: page + 1 })}
                  aria-disabled={page >= totalPages}
                  className={page >= totalPages ? 'pointer-events-none opacity-50' : ''}
                >
                  Siguiente
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
