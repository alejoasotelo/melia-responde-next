import 'server-only';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, type Team } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { CURRENCY, isPlanKey, PLANS, TRIAL_DAYS } from './plans';

const MP_API = 'https://api.mercadopago.com';

export type Preapproval = {
  id: string;
  status: 'pending' | 'authorized' | 'paused' | 'cancelled';
  external_reference?: string;
  init_point?: string;
};

async function mpRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'content-type': 'application/json',
      ...init?.headers
    },
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new Error(`MercadoPago ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export const getPreapproval = (id: string) =>
  mpRequest<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);

export const cancelPreapproval = (id: string) =>
  mpRequest<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' })
  });

// The preapproval carries "<teamId>:<planKey>" so the webhook can tell which
// team and plan it belongs to.
export async function createCheckoutSession({
  team,
  plan
}: {
  team: Team | null;
  plan: string;
}) {
  const user = await getUser();

  if (!isPlanKey(plan)) redirect('/pricing');
  if (!team || !user) {
    redirect(`/sign-up?redirect=checkout&plan=${plan}`);
  }

  const selected = PLANS[plan];
  const preapproval = await mpRequest<Preapproval>('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Plan ${selected.name}`,
      external_reference: `${team.id}:${selected.key}`,
      payer_email: user.email,
      back_url: `${process.env.BASE_URL}/api/mercadopago/return`,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: selected.price,
        currency_id: CURRENCY,
        free_trial: { frequency: TRIAL_DAYS, frequency_type: 'days' }
      }
    })
  });

  if (!preapproval.init_point) {
    throw new Error('MercadoPago did not return an init_point');
  }
  redirect(preapproval.init_point);
}

// Fetches the subscription from MercadoPago (the source of truth) and applies
// its state to the team. Safe to call repeatedly and with unverified ids.
export async function syncPreapproval(preapprovalId: string) {
  const preapproval = await getPreapproval(preapprovalId);

  const [teamId, planKey] = (preapproval.external_reference ?? '').split(':');
  if (!isPlanKey(planKey) || !Number(teamId)) return;

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, Number(teamId))
  });
  if (!team) return;

  if (preapproval.status === 'authorized') {
    const previous = team.mpSubscriptionId;
    await db
      .update(teams)
      .set({
        mpSubscriptionId: preapproval.id,
        planName: PLANS[planKey].name,
        subscriptionStatus: 'active',
        updatedAt: new Date()
      })
      .where(eq(teams.id, team.id));

    // The team switched plans: stop billing the old subscription.
    if (previous && previous !== preapproval.id) {
      await cancelPreapproval(previous).catch((error) =>
        console.error('Could not cancel previous subscription:', error)
      );
    }
    return;
  }

  // Ignore events for subscriptions that are no longer the team's current one.
  if (team.mpSubscriptionId !== preapproval.id) return;

  if (preapproval.status === 'paused') {
    await db
      .update(teams)
      .set({ subscriptionStatus: 'paused', updatedAt: new Date() })
      .where(eq(teams.id, team.id));
  } else if (preapproval.status === 'cancelled') {
    await db
      .update(teams)
      .set({
        mpSubscriptionId: null,
        planName: null,
        subscriptionStatus: 'canceled',
        updatedAt: new Date()
      })
      .where(eq(teams.id, team.id));
  }
}
