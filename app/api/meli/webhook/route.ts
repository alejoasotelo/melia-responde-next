import { after, NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { meliAccounts } from '@/lib/db/schema';
import { syncResource, type SyncKind } from '@/lib/meli/sync';

const RESOURCE = /^\/(questions\/\d+|items\/[A-Z]{3}\d+)$/;

// MercadoLibre notifications are unsigned, so the payload is only a hint: we
// re-read the resource from the API with each team's own token and never store
// anything taken from the body.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const topic = body?.topic;
  const resource = body?.resource;
  const userId = Number(body?.user_id);

  if (
    (topic !== 'questions' && topic !== 'items') ||
    typeof resource !== 'string' ||
    !RESOURCE.test(resource) ||
    !Number.isSafeInteger(userId) ||
    String(body?.application_id) !== process.env.MELI_CLIENT_ID
  ) {
    // 200 so MercadoLibre doesn't keep retrying things we'll never handle.
    return NextResponse.json({ received: true });
  }

  after(async () => {
    // The same MercadoLibre account can be linked to several teams.
    const accounts = await db
      .select()
      .from(meliAccounts)
      .where(eq(meliAccounts.meliUserId, userId));

    await Promise.allSettled(
      accounts.map((account) =>
        syncResource(account, topic as SyncKind, resource).catch((error) =>
          console.error('MercadoLibre webhook sync failed:', error)
        )
      )
    );
  });

  return NextResponse.json({ received: true });
}
