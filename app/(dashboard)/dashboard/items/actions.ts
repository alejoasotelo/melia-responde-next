'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { meliItemContexts } from '@/lib/db/schema';
import { getMeliAccountForTeam } from '@/lib/db/queries';
import { getMeliContext } from '@/lib/meli/context';
import { MAX_CONTEXT_LENGTH } from './constants';

export type ContextState = { error?: string; success?: string };

const schema = z.object({
  accountId: z.coerce.number().int(),
  itemId: z.string().regex(/^[A-Z]{3}\d+$/, 'Publicación inválida.'),
  context: z
    .string()
    .trim()
    .max(MAX_CONTEXT_LENGTH, `Máximo ${MAX_CONTEXT_LENGTH} caracteres.`)
});

export async function saveItemContext(
  _prev: ContextState,
  formData: FormData
): Promise<ContextState> {
  const ctx = await getMeliContext();
  if (!ctx) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { accountId, itemId, context } = parsed.data;

  const account = await getMeliAccountForTeam(accountId, ctx.team.id);
  if (!account) return { error: 'Cuenta no encontrada.' };

  if (context === '') {
    await db
      .delete(meliItemContexts)
      .where(
        and(
          eq(meliItemContexts.meliAccountId, account.id),
          eq(meliItemContexts.itemId, itemId)
        )
      );
  } else {
    await db
      .insert(meliItemContexts)
      .values({
        meliAccountId: account.id,
        itemId,
        context,
        updatedBy: ctx.user.id
      })
      .onConflictDoUpdate({
        target: [meliItemContexts.meliAccountId, meliItemContexts.itemId],
        set: { context, updatedBy: ctx.user.id, updatedAt: new Date() }
      });
  }

  revalidatePath('/dashboard/items');
  return { success: 'Guardado' };
}
