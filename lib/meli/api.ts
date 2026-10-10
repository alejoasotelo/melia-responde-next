import 'server-only';

const API_URL = 'https://api.mercadolibre.com';

export const MELI_STATE_COOKIE = 'meli_oauth_state';

export function getMeliRedirectUri() {
  return `${process.env.BASE_URL}/api/meli/callback`;
}

export function buildMeliAuthUrl(state: string) {
  // Authorization lives on a per-country domain (.com.ar, .com.mx, .com.br...)
  const domain = process.env.MELI_AUTH_DOMAIN || 'auth.mercadolibre.com.ar';
  const url = new URL(`https://${domain}/authorization`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.MELI_CLIENT_ID!);
  url.searchParams.set('redirect_uri', getMeliRedirectUri());
  url.searchParams.set('state', state);
  return url.toString();
}

export type MeliTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  user_id: number;
};

export async function exchangeMeliCode(code: string): Promise<MeliTokenResponse> {
  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.MELI_CLIENT_ID!,
      client_secret: process.env.MELI_CLIENT_SECRET!,
      code,
      redirect_uri: getMeliRedirectUri()
    })
  });
  if (!res.ok) {
    throw new Error(`MercadoLibre token exchange failed (${res.status})`);
  }
  return res.json();
}

export async function fetchMeliProfile(accessToken: string): Promise<{
  id: number;
  nickname?: string;
  site_id?: string;
}> {
  const res = await fetch(`${API_URL}/users/me`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`MercadoLibre profile request failed (${res.status})`);
  }
  return res.json();
}
