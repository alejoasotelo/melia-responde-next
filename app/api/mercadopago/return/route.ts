import { NextRequest, NextResponse } from 'next/server';
import { syncPreapproval } from '@/lib/payments/mercadopago';

// MercadoPago sends the user back here after the subscription checkout.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('preapproval_id');

  if (id) {
    try {
      await syncPreapproval(id);
    } catch (error) {
      // The webhook will retry; don't block the user.
      console.error('Error syncing MercadoPago subscription:', error);
    }
  }

  return NextResponse.redirect(new URL('/dashboard', process.env.BASE_URL));
}
