/**
 * POST /api/pinhoops — WhatsApp webhook → PinhoOps LangGraph
 * GET  /api/pinhoops — Health check
 *
 * This is the Next.js App Router entry point.
 * Uses dynamic imports to avoid build-time crashes when
 * ANTHROPIC_API_KEY is not available during static analysis.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro function timeout

// ─── POST /api/pinhoops ─────────────────────────────────

export async function POST(request: NextRequest) {
  // Dynamic imports — avoids ChatAnthropic API key validation at build time
  const { runPinhoOps } = await import('@/lib/ops/pinhoops/graph');
  const { logRequest, opsLog } = await import('@/lib/ops/pinhoops/logger');

  const endLog = logRequest('POST', '/api/pinhoops');

  try {
    const body = await request.json();
    const { sender_phone, sender_name, message_text, context_matter_id } = body;

    if (!sender_phone || !message_text) {
      endLog(400, { error: 'missing_required_fields' });
      return NextResponse.json(
        { error: 'sender_phone and message_text are required' },
        { status: 400 },
      );
    }

    opsLog.info('Incoming WhatsApp message', {
      sender: sender_name || sender_phone,
      phone: sender_phone,
      message_preview: message_text.substring(0, 100),
      context_matter_id: context_matter_id || null,
    });

    const result = await runPinhoOps({
      sender_phone,
      sender_name: sender_name || 'Unknown',
      message_text,
      context_matter_id,
    });

    const agent = result.agent_results?.[0]?.agent || 'unknown';
    const durationMs = result.agent_results?.[0]?.audit?.duration_ms || 0;

    endLog(200, {
      agent,
      duration_ms: durationMs,
      human_approval: result.human_approval?.required || false,
      error: result.error || null,
    });

    return NextResponse.json({
      reply: result.reply,
      agent: result.agent_results?.[0]?.agent || null,
      state_updated: result.agent_results?.some((r: any) => r.state_updated) || false,
      human_approval_required: result.human_approval?.required || false,
      error: result.error,
      audit: result.agent_results?.map((r: any) => ({
        agent: r.agent,
        duration_ms: r.audit?.duration_ms,
        steps: r.audit?.steps?.length,
      })),
    });
  } catch (err: any) {
    const { opsLog: log } = await import('@/lib/ops/pinhoops/logger');
    log.logError('Fatal error in POST /api/pinhoops', err);
    endLog(500, { error: err.message });
    return NextResponse.json(
      { error: err.message, reply: 'System error. Please try again.' },
      { status: 500 },
    );
  }
}

// ─── GET /api/pinhoops (health check) ───────────────────

export async function GET() {
  return NextResponse.json({
    service: 'PinhoOps AI v1.0',
    sop_version: 'PinhoLaw SOP v1.0',
    agents: [
      'MasterOperationsAgent',
      'ScheduleProtectionAgent',
      'TaskDelegationAgent',
      'BillingCaptureAgent',
      'SalesPipelineAgent',
    ],
    tools: [
      'read_state',
      'write_state',
      'create_clio_task',
      'create_clio_time_entry',
      'read_calendar',
      'create_execution_block',
      'sync_billing_to_clio',
      'get_billing_sync_status',
    ],
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
}
