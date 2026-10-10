import 'server-only';
import { cookies } from 'next/headers';

export const MELI_ACCOUNT_COOKIE = 'meli_account';
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

// Resolves the selected account: ?account=<id>, else the last one chosen in
// the selector (cookie), else the first. Ids that don't belong to the team are
// ignored, so data from other teams' accounts can never be shown.
export async function selectMeliAccount(teamId: number, accountParam?: string) {
  const accounts = await getMeliAccountsForTeam(teamId);
  const remembered = (await cookies()).get(MELI_ACCOUNT_COOKIE)?.value;
  const find = (id?: string) => accounts.find((a) => a.id === Number(id));
  const current = find(accountParam) ?? find(remembered) ?? accounts[0] ?? null;
  return { accounts, current };
}
