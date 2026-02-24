/**
 * WhatsApp Business Cloud API — Webhook Handler
 *
 * GET  /api/whatsapp/webhook — Verification challenge (Meta registration)
 * POST /api/whatsapp/webhook — Incoming messages
 *
 * Set this URL in Meta Developer Dashboard:
 *   https://pinholaw-ops.vercel.app/api/whatsapp/webhook
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── GET — Webhook Verification ─────────────────────────

export async function GET(request: NextRequest) {
  // Dynamic import to avoid build-time issues
  const { verifyWebhookChallenge } = await import(
    '@/lib/ops/pinhoops/tools/whatsapp'
  );

  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  const result = verifyWebhookChallenge(mode, token, challenge);

  if (result.valid) {
    // Meta expects just the challenge string as plain text
    return new NextResponse(result.challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ─── POST — Incoming Messages ───────────────────────────

export async function POST(request: NextRequest) {
  const { verifyWebhookSignature } = await import(
    '@/lib/ops/pinhoops/tools/whatsapp'
  );
  const { handleWhatsAppWebhook } = await import(
    '@/lib/ops/pinhoops/whatsapp-handler'
  );
  const { opsLog } = await import('@/lib/ops/pinhoops/logger');

  // Meta requires 200 OK within 20 seconds or it retries
  // We process in the background and return 200 immediately

  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    // Verify signature if app secret is configured
    const signature = request.headers.get('x-hub-signature-256') || '';
    if (process.env.WHATSAPP_APP_SECRET) {
      const valid = await verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        opsLog.warn('WhatsApp webhook signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Return 200 immediately (Meta requirement)
    // Process the message asynchronously
    // Note: On Vercel serverless, the function stays alive until maxDuration
    const result = await handleWhatsAppWebhook(body);

    if (result.processed) {
      opsLog.info('WhatsApp webhook processed', {
        agent: result.agent,
        duration_ms: result.durationMs,
        error: result.error || null,
      });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: any) {
    opsLog.logError('WhatsApp webhook error', err);
    // Always return 200 to Meta to prevent retries
    return NextResponse.json({ status: 'ok' });
  }
}
