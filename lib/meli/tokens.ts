import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { meliAccounts, type MeliAccount } from '@/lib/db/schema';
import { MeliApiError, refreshMeliToken } from './api';
import { decryptToken, encryptToken } from './crypto';

// Returns a usable access token, refreshing (and persisting) it when it is
// about to expire. MercadoLibre refresh tokens are single use, so the new one
// must be stored every time.
export async function getMeliAccessToken(account: MeliAccount) {
  if (account.tokenExpiresAt.getTime() - Date.now() > 60_000) {
    return decryptToken(account.accessToken);
  }
  if (!account.refreshToken) {
    throw new MeliApiError('No refresh token available', 401);
  }

  const tokens = await refreshMeliToken(decryptToken(account.refreshToken));
  await db
    .update(meliAccounts)
    .set({
      accessToken: encryptToken(tokens.access_token),
      refreshToken: tokens.refresh_token
        ? encryptToken(tokens.refresh_token)
        : account.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      updatedAt: new Date()
    })
    .where(eq(meliAccounts.id, account.id));

  return tokens.access_token;
}
