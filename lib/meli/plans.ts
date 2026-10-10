import type { Team } from '@/lib/db/schema';
import { getPlanByName } from '@/lib/payments/plans';

export function getMeliAccountLimit(
  team: Pick<Team, 'planName' | 'subscriptionStatus'>
): number {
  const isActive =
    team.subscriptionStatus === 'active' ||
    team.subscriptionStatus === 'trialing';
  if (!isActive) return 0;
  return getPlanByName(team.planName)?.maxMeliAccounts ?? 0;
}
