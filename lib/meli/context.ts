import 'server-only';
import {
  getMeliAccountsForTeam,
  getTeamForUser,
  getUser
} from '@/lib/db/queries';

export async function getMeliContext() {
  const user = await getUser();
  if (!user) return null;
  const team = await getTeamForUser();
  if (!team) return null;
  const member = team.teamMembers.find((m) => m.userId === user.id);
  return { user, team, isOwner: member?.role === 'owner' };
}

// Resolves the account selected with ?account=<id>. Falls back to the first
// account when the param is missing or doesn't belong to the team.
export async function selectMeliAccount(teamId: number, accountParam?: string) {
  const accounts = await getMeliAccountsForTeam(teamId);
  const current =
    accounts.find((a) => a.id === Number(accountParam)) ?? accounts[0] ?? null;
  return { accounts, current };
}
