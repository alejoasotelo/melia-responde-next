'use server';

import { redirect } from 'next/navigation';
import { createCheckoutSession, cancelPreapproval, syncPreapproval } from './mercadopago';
import { withTeam } from '@/lib/auth/middleware';
import { getMeliContext } from '@/lib/meli/context';

export const checkoutAction = withTeam(async (formData, team) => {
  const plan = String(formData.get('plan') ?? '');
  await createCheckoutSession({ team, plan });
});

export async function cancelSubscriptionAction() {
  const ctx = await getMeliContext();
  if (!ctx) redirect('/sign-in');
  if (!ctx.isOwner) {
    throw new Error('Only team owners can cancel the subscription');
  }

  const subscriptionId = ctx.team.mpSubscriptionId;
  if (subscriptionId) {
    await cancelPreapproval(subscriptionId);
    await syncPreapproval(subscriptionId);
  }
  redirect('/dashboard');
}
