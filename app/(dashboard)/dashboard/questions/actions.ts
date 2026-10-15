'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  meliAccounts,
  meliItemContexts,
  meliQuestions,
  questionDrafts
} from '@/lib/db/schema';
import { getMeliAccountForTeam } from '@/lib/db/queries';
import { generateAnswerDraft } from '@/lib/ai/openai';
import {
  fetchMeliItemDetail,
  type MeliItemDetail
} from '@/lib/meli/api';
import {
  MAX_SEND_PER_CLICK,
  sendDraftsForAccount,
  type SendState
} from '@/lib/meli/send';
import { getMeliContext } from '@/lib/meli/context';
import { getMeliAccessToken } from '@/lib/meli/tokens';

export type DraftState = { error?: string; success?: string };

const MAX_QUESTIONS_PER_BATCH = 10;

const generateSchema = z.object({
  accountId: z.coerce.number().int(),
  questionIds: z
    .array(z.coerce.number().int())
    .min(1, 'Seleccioná al menos una pregunta.')
    .max(
      MAX_QUESTIONS_PER_BATCH,
      `Podés seleccionar hasta ${MAX_QUESTIONS_PER_BATCH} preguntas por vez.`
    )
});

export async function generateDrafts(
  _prev: DraftState,
  formData: FormData
): Promise<DraftState> {
  const ctx = await getMeliContext();
  if (!ctx) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' };
  if (!process.env.OPENAI_API_KEY) {
    return { error: 'La integración con OpenAI no está configurada.' };
  }

  const parsed = generateSchema.safeParse({
    accountId: formData.get('accountId'),
    questionIds: formData.getAll('questionId')
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { accountId, questionIds } = parsed.data;

  const account = await getMeliAccountForTeam(accountId, ctx.team.id);
  if (!account) return { error: 'Cuenta no encontrada.' };

  try {
    const token = await getMeliAccessToken(account);

    // Read the questions from our own database, scoped to this account, so
    // ids sent by the client can't reach other accounts' data.
    const rows = await db
      .select()
      .from(meliQuestions)
      .where(
        and(
          eq(meliQuestions.meliAccountId, account.id),
          eq(meliQuestions.status, 'UNANSWERED'),
          inArray(meliQuestions.meliQuestionId, questionIds)
        )
      );
    const questions = rows.map((r) => ({
      id: r.meliQuestionId,
      item_id: r.itemId,
      text: r.text
    }));
    if (questions.length === 0) {
      return { error: 'No se encontraron las preguntas seleccionadas. Sincronizá e intentá de nuevo.' };
    }

    const itemIds = [...new Set(questions.map((q) => q.item_id))];
    const [itemResults, contextRows] = await Promise.all([
      Promise.allSettled(itemIds.map((id) => fetchMeliItemDetail(token, id))),
      db
        .select()
        .from(meliItemContexts)
        .where(
          and(
            eq(meliItemContexts.meliAccountId, account.id),
            inArray(meliItemContexts.itemId, itemIds)
          )
        )
    ]);

    const items = new Map<string, MeliItemDetail>();
    itemResults.forEach((r, i) => {
      if (r.status === 'fulfilled') items.set(itemIds[i], r.value);
    });
    const contexts = new Map(contextRows.map((c) => [c.itemId, c.context]));

    const results = await Promise.allSettled(
      questions.map(async (question) => {
        const item = items.get(question.item_id);
        if (!item) throw new Error(`Item ${question.item_id} not available`);

        const draft = await generateAnswerDraft({
          question: question.text,
          item,
          extraContext: contexts.get(question.item_id)
        });

        await db
          .insert(questionDrafts)
          .values({
            meliAccountId: account.id,
            meliQuestionId: question.id,
            itemId: question.item_id,
            draft,
            createdBy: ctx.user.id
          })
          .onConflictDoUpdate({
            target: [questionDrafts.meliAccountId, questionDrafts.meliQuestionId],
            set: { draft, createdBy: ctx.user.id, updatedAt: new Date() }
          });
      })
    );

    results.forEach((r) => {
      if (r.status === 'rejected') console.error('Draft generation failed:', r.reason);
    });
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = questionIds.length - ok;

    revalidatePath('/dashboard/questions');
    if (ok === 0) {
      return { error: 'No pudimos generar los borradores. Intentá de nuevo.' };
    }
    return {
      success:
        `${ok} ${ok === 1 ? 'borrador generado' : 'borradores generados'}` +
        (failed ? ` (${failed} con error)` : '')
    };
  } catch (error) {
    console.error('Error generating drafts:', error);
    return { error: 'No pudimos generar los borradores. Intentá de nuevo.' };
  }
}

const draftRefSchema = z.object({
  accountId: z.coerce.number().int(),
  questionId: z.coerce.number().int()
});

// Resolves the draft only if its account belongs to the user's team.
async function findOwnedDraft(formData: FormData) {
  const ctx = await getMeliContext();
  if (!ctx) throw new Error('Not authenticated');
  const { accountId, questionId } = draftRefSchema.parse(
    Object.fromEntries(formData)
  );

  const owned = await db
    .select({ id: meliAccounts.id })
    .from(meliAccounts)
    .where(and(eq(meliAccounts.id, accountId), eq(meliAccounts.teamId, ctx.team.id)))
    .limit(1);
  if (owned.length === 0) throw new Error('Account not found');

  return and(
    eq(questionDrafts.meliAccountId, accountId),
    eq(questionDrafts.meliQuestionId, questionId)
  );
}

export async function saveDraft(formData: FormData) {
  const where = await findOwnedDraft(formData);
  const draft = z.string().trim().min(1).max(2000).parse(formData.get('draft'));

  await db
    .update(questionDrafts)
    .set({ draft, updatedAt: new Date() })
    .where(where);
  revalidatePath('/dashboard/questions');
}

export async function deleteDraft(formData: FormData) {
  const where = await findOwnedDraft(formData);
  await db.delete(questionDrafts).where(where);
  revalidatePath('/dashboard/questions');
}

// ------------------------------------------------------------ send drafts

const sendSchema = z.object({
  accountId: z.coerce.number().int(),
  questionIds: z.array(z.coerce.number().int()).max(MAX_SEND_PER_CLICK)
});

export async function sendDrafts(
  _prev: SendState,
  formData: FormData
): Promise<SendState> {
  const ctx = await getMeliContext();
  if (!ctx) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' };

  const parsed = sendSchema.safeParse({
    accountId: formData.get('accountId'),
    questionIds: formData.getAll('questionId')
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const account = await getMeliAccountForTeam(parsed.data.accountId, ctx.team.id);
  if (!account) return { error: 'Cuenta no encontrada.' };

  const result = await sendDraftsForAccount({
    account,
    userId: ctx.user.id,
    questionIds: parsed.data.questionIds
  });
  revalidatePath('/dashboard/questions');
  return result;
}
