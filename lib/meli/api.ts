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

export class MeliApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function refreshMeliToken(
  refreshToken: string
): Promise<MeliTokenResponse> {
  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.MELI_CLIENT_ID!,
      client_secret: process.env.MELI_CLIENT_SECRET!,
      refresh_token: refreshToken
    })
  });
  if (!res.ok) {
    throw new MeliApiError('MercadoLibre token refresh failed', res.status);
  }
  return res.json();
}

export type MeliQuestion = {
  id: number;
  text: string;
  status: string;
  date_created: string;
  item_id: string;
  from?: { id: number };
  answer?: { text: string; date_created: string } | null;
};

export type MeliQuestionStatus = 'UNANSWERED' | 'ANSWERED';

export async function searchMeliQuestions(
  accessToken: string,
  {
    sellerId,
    status,
    offset,
    limit
  }: {
    sellerId: number;
    status: MeliQuestionStatus;
    offset: number;
    limit: number;
  }
): Promise<{ total: number; questions: MeliQuestion[] }> {
  const url = new URL(`${API_URL}/questions/search`);
  url.searchParams.set('seller_id', String(sellerId));
  url.searchParams.set('api_version', '4');
  url.searchParams.set('status', status);
  url.searchParams.set('sort_fields', 'date_created');
  url.searchParams.set('sort_types', 'DESC');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new MeliApiError(
      `MercadoLibre questions request failed (${res.status})`,
      res.status
    );
  }
  const data = await res.json();
  return { total: data.total ?? 0, questions: data.questions ?? [] };
}

export type MeliItemSummary = {
  id: string;
  title: string;
  thumbnail?: string;
  permalink?: string;
};

// Multiget accepts up to 20 ids per call. Failures are non-fatal: the
// questions are still useful without the item title.
export async function fetchMeliItems(
  accessToken: string,
  ids: string[]
): Promise<Record<string, MeliItemSummary>> {
  const result: Record<string, MeliItemSummary> = {};
  const unique = [...new Set(ids)];

  for (let i = 0; i < unique.length; i += 20) {
    const url = new URL(`${API_URL}/items`);
    url.searchParams.set('ids', unique.slice(i, i + 20).join(','));
    url.searchParams.set('attributes', 'id,title,thumbnail,permalink');
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      if (!res.ok) continue;
      const rows: { code: number; body: MeliItemSummary }[] = await res.json();
      for (const row of rows) {
        if (row.code === 200) result[row.body.id] = row.body;
      }
    } catch {
      // ignore, see above
    }
  }
  return result;
}
