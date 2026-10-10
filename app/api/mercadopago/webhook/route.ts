import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { syncPreapproval } from '@/lib/payments/mercadopago';

// https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks
function isValidSignature(request: NextRequest, dataId: string) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // Optional: the subscription is re-fetched from MercadoPago anyway.

  const header = request.headers.get('x-signature') ?? '';
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=') as [string, string])
  );
  if (!parts.ts || !parts.v1) return false;

  const manifest = `id:${dataId};request-id:${request.headers.get('x-request-id') ?? ''};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const body = await request.json().catch(() => ({}));

  const type = body.type ?? query.get('type') ?? query.get('topic');
  const dataId = String(query.get('data.id') ?? body.data?.id ?? '');

  if (!dataId || !isValidSignature(request, dataId)) {
    return NextResponse.json({ error: 'Invalid notification' }, { status: 400 });
  }

  if (type === 'subscription_preapproval') {
    try {
      await syncPreapproval(dataId);
    } catch (error) {
      console.error('Error handling MercadoPago webhook:', error);
      // Non-2xx makes MercadoPago retry.
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
