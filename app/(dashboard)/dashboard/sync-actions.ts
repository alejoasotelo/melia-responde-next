'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getMeliAccountForTeam } from '@/lib/db/queries';
import { getMeliContext } from '@/lib/meli/context';
import { runSync } from '@/lib/meli/sync';

export type SyncState = { error?: string; success?: string };

const schema = z.object({
  accountId: z.coerce.number().int(),
  kind: z.enum(['questions', 'items'])
});

const MIN_INTERVAL_MS = 30_000;

export async function syncNow(
  _prev: SyncState,
  formData: FormData
): Promise<SyncState> {
  const ctx = await getMeliContext();
  if (!ctx) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Solicitud inválida.' };
  const { accountId, kind } = parsed.data;

  const account = await getMeliAccountForTeam(accountId, ctx.team.id);
  if (!account) return { error: 'Cuenta no encontrada.' };

  const last =
    kind === 'questions' ? account.questionsSyncedAt : account.itemsSyncedAt;
  if (last && Date.now() - last.getTime() < MIN_INTERVAL_MS) {
    return { error: 'Ya sincronizaste hace instantes. Esperá unos segundos.' };
  }

  const result = await runSync(account.id, kind);
  revalidatePath('/dashboard/questions');
  revalidatePath('/dashboard/items');

  if (result.skipped) return { success: 'Ya hay una sincronización en curso.' };
  return result.ok
    ? { success: 'Sincronizado.' }
    : { error: result.error ?? 'No pudimos sincronizar.' };
}
