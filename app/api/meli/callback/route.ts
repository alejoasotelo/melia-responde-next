import { NextRequest, NextResponse } from 'next/server';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, ActivityType, meliAccounts, teams } from '@/lib/db/schema';
import {
  exchangeMeliCode,
  fetchMeliProfile,
  MELI_STATE_COOKIE
} from '@/lib/meli/api';
import { encryptToken } from '@/lib/meli/crypto';
import { getMeliContext } from '@/lib/meli/context';
import { getMeliAccountLimit } from '@/lib/meli/plans';

function done(query: string) {
  const res = NextResponse.redirect(
    new URL(`/dashboard/meli?${query}`, process.env.BASE_URL)
  );
  res.cookies.delete({ name: MELI_STATE_COOKIE, path: '/api/meli' });
  return res;
}

export async function GET(request: NextRequest) {
  const ctx = await getMeliContext();
  if (!ctx) {
    return NextResponse.redirect(new URL('/sign-in', process.env.BASE_URL));
  }
  if (!ctx.isOwner) return done('error=not_owner');

  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const expectedState = request.cookies.get(MELI_STATE_COOKIE)?.value;

  if (params.get('error')) return done('error=denied');
  if (!code || !state || !expectedState || state !== expectedState) {
    return done('error=invalid_state');
  }

  let tokens, profile;
  try {
    tokens = await exchangeMeliCode(code);
    profile = await fetchMeliProfile(tokens.access_token);
  } catch (error) {
    console.error('MercadoLibre OAuth error:', error);
    return done('error=oauth_failed');
  }

  const teamId = ctx.team.id;
  const values = {
    connectedBy: ctx.user.id,
    nickname: profile.nickname ?? null,
    siteId: profile.site_id ?? null,
    accessToken: encryptToken(tokens.access_token),
    refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    updatedAt: new Date()
  };

  const result = await db.transaction(async (tx) => {
    // Lock the team row so concurrent callbacks can't exceed the plan limit.
    const [team] = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .for('update');
    const limit = getMeliAccountLimit(team);

    const existing = await tx
      .select()
      .from(meliAccounts)
      .where(
        and(
          eq(meliAccounts.teamId, teamId),
          eq(meliAccounts.meliUserId, profile.id)
        )
      )
      .limit(1);

    if (existing[0]) {
      // Reconnecting an account we already have: refresh its tokens.
      await tx
        .update(meliAccounts)
        .set(values)
        .where(eq(meliAccounts.id, existing[0].id));
      return 'ok' as const;
    }

    const [{ total }] = await tx
      .select({ total: count() })
      .from(meliAccounts)
      .where(eq(meliAccounts.teamId, teamId));
    if (total >= limit) return 'limit_reached' as const;

    await tx
      .insert(meliAccounts)
      .values({ ...values, teamId, meliUserId: profile.id });
    await tx.insert(activityLogs).values({
      teamId,
      userId: ctx.user.id,
      action: ActivityType.CONNECT_MELI_ACCOUNT
    });
    return 'ok' as const;
  });

  return done(result === 'ok' ? 'connected=1' : `error=${result}`);
}
