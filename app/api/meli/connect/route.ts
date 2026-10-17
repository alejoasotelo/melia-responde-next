import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { meliAccounts } from '@/lib/db/schema';
import { buildMeliAuthUrl, MELI_STATE_COOKIE } from '@/lib/meli/api';
import { getMeliContext } from '@/lib/meli/context';
import { getMeliAccountLimit } from '@/lib/meli/plans';

function back(error: string) {
  return NextResponse.redirect(
    new URL(`/dashboard/meli?error=${error}`, process.env.BASE_URL)
  );
}

export async function GET() {
  const ctx = await getMeliContext();
  if (!ctx) {
    return NextResponse.redirect(new URL('/sign-in', process.env.BASE_URL));
  }
  if (!ctx.isOwner) return back('not_owner');
  if (!process.env.MELI_CLIENT_ID || !process.env.MELI_CLIENT_SECRET) {
    return back('not_configured');
  }

  const limit = getMeliAccountLimit(ctx.team);
  if (limit === 0) return back('no_plan');

  const [{ total }] = await db
    .select({ total: count() })
    .from(meliAccounts)
    .where(eq(meliAccounts.teamId, ctx.team.id));
  if (total >= limit) return back('limit_reached');

  const state = randomBytes(24).toString('hex');
  const res = NextResponse.redirect(buildMeliAuthUrl(state));
  res.cookies.set(MELI_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/meli',
    maxAge: 10 * 60
  });
  return res;
}
