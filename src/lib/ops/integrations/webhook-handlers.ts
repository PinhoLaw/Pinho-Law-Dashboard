/**
 * Webhook Handlers for Clio + Microsoft Graph Events
 *
 * Next.js API route handlers that process incoming webhooks
 * and update state via GitHub helpers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyClioWebhook, type ClioWebhookPayload } from '@/lib/ops/integrations/clio-v4';
import {
  handleGraphWebhookValidation,
  processCalendarWebhook,
  type GraphWebhookNotification,
} from '@/lib/ops/integrations/microsoft-graph';
import { readState, commitWithAudit, STATE_FILES } from '@/lib/ops/github';

// ─── Clio Webhook Handler ────────────────────────────────

/**
 * POST /api/webhooks/clio
 * Handles Clio webhook notifications for matters, tasks, and activities.
 */
export async function handleClioWebhook(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-clio-signature') || '';

    // Verify webhook signature
    const valid = await verifyClioWebhook(rawBody, signature);
    if (!valid) {
      console.error('[Webhook] Invalid Clio signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: ClioWebhookPayload = JSON.parse(rawBody);
    console.log(`[Webhook] Clio event: ${payload.event} for ${payload.data.type} #${payload.data.id}`);

    switch (payload.data.type) {
      case 'Matter': {
        const { data: tasksDoc } = await readState(STATE_FILES.tasks);
        // Find and update the matching matter
        const idx = (tasksDoc as any).matters?.findIndex(
          (m: any) => m.clio_matter_id === String(payload.data.id)
        );

        if (idx >= 0) {
          (tasksDoc as any).matters[idx].updated_at = new Date().toISOString();
          (tasksDoc as any).last_updated = new Date().toISOString();

          await commitWithAudit(
            { [STATE_FILES.tasks]: tasksDoc },
            `Clio webhook: ${payload.event} for matter ${payload.data.id}`,
            'clio-webhook',
          );
        }
        break;
      }

      case 'Activity': {
        // Time entry created/updated in Clio
        const { data: billingDoc } = await readState(STATE_FILES.billing);
        (billingDoc as any).last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.billing]: billingDoc },
          `Clio webhook: ${payload.event} for activity ${payload.data.id}`,
          'clio-webhook',
        );
        break;
      }

      default:
        console.log(`[Webhook] Unhandled Clio type: ${payload.data.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] Clio handler error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── Graph Calendar Webhook Handler ──────────────────────

/**
 * POST /api/webhooks/graph-calendar
 * Handles Microsoft Graph calendar webhook notifications.
 * Also handles the initial validation handshake.
 */
export async function handleGraphCalendarWebhook(request: NextRequest): Promise<NextResponse> {
  // Validation handshake
  const validationToken = request.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(handleGraphWebhookValidation(validationToken), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    const body = await request.json();
    const notifications: GraphWebhookNotification[] = body.value || [];

    for (const notification of notifications) {
      // Verify client state
      if (notification.clientState !== 'pinholaw-calendar-webhook') {
        console.warn('[Webhook] Invalid clientState, skipping');
        continue;
      }

      console.log(`[Webhook] Graph calendar ${notification.changeType} for ${notification.resourceData.id}`);

      const result = await processCalendarWebhook(notification);

      if (result.event) {
        // Check if this conflicts with execution blocks
        const isExecutionBlock =
          result.event.categories?.includes('PinhoLaw Execution Block') ||
          result.event.subject?.includes('[EXECUTION BLOCK]');

        // Update KPI dashboard calendar metrics
        const { data: kpiDoc } = await readState(STATE_FILES.kpi);
        const kpi = kpiDoc as any;

        if (notification.changeType === 'created') {
          if (isExecutionBlock) {
            kpi.calendar.execution_blocks_scheduled += 1;
          } else {
            // Check if new event conflicts with execution blocks
            const blockKeywords = ['EXECUTION BLOCK', 'Deep Work'];
            const conflictsWithBlock = blockKeywords.some(kw =>
              result.event!.subject?.includes(kw)
            );
            if (!conflictsWithBlock) {
              kpi.calendar.client_meetings_7d += 1;
            }
          }
        }

        kpi.last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.kpi]: kpi },
          `Graph webhook: ${notification.changeType} event "${result.event.subject}"`,
          'graph-webhook',
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] Graph handler error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
