'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { activityLogs, ActivityType, meliAccounts } from '@/lib/db/schema';
import { getMeliContext } from '@/lib/meli/context';

const disconnectSchema = z.object({ accountId: z.coerce.number().int() });

export async function disconnectMeliAccount(formData: FormData) {
  const ctx = await getMeliContext();
  if (!ctx?.isOwner) {
    throw new Error('Only team owners can disconnect MercadoLibre accounts');
  }

  const { accountId } = disconnectSchema.parse(Object.fromEntries(formData));

  const deleted = await db
    .delete(meliAccounts)
    .where(
      and(eq(meliAccounts.id, accountId), eq(meliAccounts.teamId, ctx.team.id))
    )
    .returning({ id: meliAccounts.id });

  if (deleted.length > 0) {
    await db.insert(activityLogs).values({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      action: ActivityType.DISCONNECT_MELI_ACCOUNT
    });
  }

  revalidatePath('/dashboard/meli');
}
