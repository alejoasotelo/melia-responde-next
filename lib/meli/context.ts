import 'server-only';
import { getTeamForUser, getUser } from '@/lib/db/queries';

export async function getMeliContext() {
  const user = await getUser();
  if (!user) return null;
  const team = await getTeamForUser();
  if (!team) return null;
  const member = team.teamMembers.find((m) => m.userId === user.id);
  return { user, team, isOwner: member?.role === 'owner' };
}
