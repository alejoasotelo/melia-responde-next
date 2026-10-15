import 'server-only';
import { randomUUID } from 'crypto';
import { and, asc, eq, inArray, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  ActivityType,
  answerSubmissions,
  meliQuestions,
  questionDrafts,
  type MeliAccount
} from '@/lib/db/schema';
import { getMeliQuestion, MeliApiError, postMeliAnswer } from './api';
import { upsertQuestions } from './sync';
import { getMeliAccessToken } from './tokens';

export type SendDetail = {
  questionId: number;
  status: 'sent' | 'skipped' | 'failed';
  message?: string;
};
export type SendState = {
  error?: string;
  sent?: number;
  skipped?: number;
  failed?: number;
  details?: SendDetail[];
};

export const MAX_SEND_PER_CLICK = 50;
const CONCURRENCY = 5;
const MAX_ANSWER_LENGTH = 2000;
const PENDING_TIMEOUT_MS = 5 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postWithRetry(token: string, questionId: number, text: string) {
  try {
    return await postMeliAnswer(token, questionId, text);
  } catch (error) {
    if (
      error instanceof MeliApiError &&
      (error.status === 429 || error.status >= 500)
    ) {
      await sleep(1500);
      return postMeliAnswer(token, questionId, text);
    }
    throw error;
  }
}

function describeError(error: unknown) {
  if (error instanceof MeliApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'MercadoLibre rechazó el acceso: reconectá la cuenta con permisos de escritura.';
    }
    return `MercadoLibre respondió ${error.status}${error.message ? `: ${error.message.slice(0, 200)}` : ''}`;
  }
  return 'Error inesperado al enviar.';
}

// Publishes the saved drafts of one account to MercadoLibre, in small parallel
// batches. Safe to call concurrently: each question is claimed first.
export async function sendDraftsForAccount({
  account,
  userId,
  questionIds
}: {
  account: MeliAccount;
  userId: number;
  questionIds: number[];
}): Promise<SendState> {
  const drafts = await db
    .select()
    .from(questionDrafts)
    .where(
      and(
        eq(questionDrafts.meliAccountId, account.id),
        questionIds.length
          ? inArray(questionDrafts.meliQuestionId, questionIds)
          : undefined
      )
    )
    .orderBy(asc(questionDrafts.createdAt))
    .limit(MAX_SEND_PER_CLICK);
  if (drafts.length === 0) return { error: 'No hay borradores para enviar.' };

  let token: string;
  try {
    token = await getMeliAccessToken(account);
  } catch (error) {
    console.error('Token error while sending answers:', error);
    return { error: describeError(error) };
  }

  const batchId = randomUUID();

  const setSubmission = (
    questionId: number,
    status: 'sent' | 'failed' | 'skipped',
    error: string | null
  ) =>
    db
      .update(answerSubmissions)
      .set({ status, error, sentAt: new Date() })
      .where(
        and(
          eq(answerSubmissions.meliAccountId, account.id),
          eq(answerSubmissions.meliQuestionId, questionId)
        )
      );

  const removeDraft = (questionId: number) =>
    db
      .delete(questionDrafts)
      .where(
        and(
          eq(questionDrafts.meliAccountId, account.id),
          eq(questionDrafts.meliQuestionId, questionId)
        )
      );

  async function sendOne(draft: (typeof drafts)[number]): Promise<SendDetail> {
    const questionId = draft.meliQuestionId;
    const text = draft.draft.trim();

    // Claim the question so a double click / second tab can't send it twice.
    const claimed = await db
      .insert(answerSubmissions)
      .values({
        meliAccountId: account.id,
        meliQuestionId: questionId,
        text,
        sentBy: userId,
        batchId,
        status: 'pending'
      })
      .onConflictDoUpdate({
        target: [answerSubmissions.meliAccountId, answerSubmissions.meliQuestionId],
        set: {
          text,
          sentBy: userId,
          batchId,
          status: 'pending',
          error: null,
          sentAt: new Date()
        },
        setWhere: or(
          eq(answerSubmissions.status, 'failed'),
          and(
            eq(answerSubmissions.status, 'pending'),
            lt(answerSubmissions.sentAt, new Date(Date.now() - PENDING_TIMEOUT_MS))
          )
        )
      })
      .returning({ id: answerSubmissions.id });
    if (claimed.length === 0) {
      return {
        questionId,
        status: 'skipped',
        message: 'Ya fue enviada o se está enviando.'
      };
    }

    if (text.length === 0 || text.length > MAX_ANSWER_LENGTH) {
      const message = `La respuesta debe tener entre 1 y ${MAX_ANSWER_LENGTH} caracteres.`;
      await setSubmission(questionId, 'failed', message);
      return { questionId, status: 'failed', message };
    }

    try {
      // Re-read: it may have been answered or closed since we last synced.
      const current = await getMeliQuestion(token, questionId);
      if (current.seller_id !== account.meliUserId) {
        const message = 'La pregunta no pertenece a esta cuenta.';
        await setSubmission(questionId, 'failed', message);
        return { questionId, status: 'failed', message };
      }
      if (current.status !== 'UNANSWERED') {
        await upsertQuestions(account.id, [current]);
        await setSubmission(questionId, 'skipped', 'Ya no estaba sin responder.');
        await removeDraft(questionId);
        return {
          questionId,
          status: 'skipped',
          message: 'Ya no estaba sin responder.'
        };
      }

      await postWithRetry(token, questionId, text);
    } catch (error) {
      if (
        error instanceof MeliApiError &&
        error.status === 400 &&
        /answered/i.test(error.message)
      ) {
        await setSubmission(questionId, 'skipped', 'Ya estaba respondida.');
        await removeDraft(questionId);
        return { questionId, status: 'skipped', message: 'Ya estaba respondida.' };
      }
      console.error('Error sending answer:', error);
      const message = describeError(error);
      await setSubmission(questionId, 'failed', message.slice(0, 500));
      return { questionId, status: 'failed', message };
    }

    // Published. Bookkeeping errors must not look like a failed send.
    try {
      await setSubmission(questionId, 'sent', null);
      await db
        .update(meliQuestions)
        .set({
          status: 'ANSWERED',
          answerText: text,
          answerDate: new Date(),
          syncedAt: new Date()
        })
        .where(
          and(
            eq(meliQuestions.meliAccountId, account.id),
            eq(meliQuestions.meliQuestionId, questionId)
          )
        );
      await removeDraft(questionId);
    } catch (error) {
      console.error('Answer sent but local bookkeeping failed:', error);
    }
    return { questionId, status: 'sent' };
  }

  const details: SendDetail[] = [];
  for (let i = 0; i < drafts.length; i += CONCURRENCY) {
    const chunk = drafts.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(sendOne));
    results.forEach((r, j) =>
      details.push(
        r.status === 'fulfilled'
          ? r.value
          : {
              questionId: chunk[j].meliQuestionId,
              status: 'failed',
              message: 'Error inesperado al enviar.'
            }
      )
    );
    if (i + CONCURRENCY < drafts.length) await sleep(300);
  }

  const count = (status: SendDetail['status']) =>
    details.filter((d) => d.status === status).length;
  const sent = count('sent');

  if (sent > 0) {
    await db.insert(activityLogs).values({
      teamId: account.teamId,
      userId: userId,
      action: ActivityType.SEND_MELI_ANSWERS
    });
  }

  return { sent, skipped: count('skipped'), failed: count('failed'), details };
}
