import type { Team } from '@/lib/db/schema';

// Keys are the lowercased Stripe product names.
const MELI_ACCOUNT_LIMITS: Record<string, number> = {
  vendedor: 1,
  agencia: 3
};

export function getMeliAccountLimit(
  team: Pick<Team, 'planName' | 'subscriptionStatus'>
): number {
  const isActive =
    team.subscriptionStatus === 'active' ||
    team.subscriptionStatus === 'trialing';
  if (!isActive || !team.planName) {
    return 0;
  }
  return MELI_ACCOUNT_LIMITS[team.planName.trim().toLowerCase()] ?? 0;
}
