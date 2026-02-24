/**
 * Vercel API Route Handler — /api/pinhoops
 *
 * Receives WhatsApp webhook messages and routes through
 * the PinhoOps LangGraph agent system.
 *
 * Drop this into: app/api/pinhoops/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { runPinhoOps } from '@/lib/ops/pinhoops/graph';

export const maxDuration = 60; // Vercel Pro function timeout

// ─── POST /api/pinhoops ─────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { sender_phone, sender_name, message_text, context_matter_id } = body;

    if (!sender_phone || !message_text) {
      return NextResponse.json(
        { error: 'sender_phone and message_text are required' },
        { status: 400 },
      );
    }

    console.log(`[PinhoOps] Incoming: ${sender_name || sender_phone} — "${message_text.substring(0, 100)}"`);

    // Run the LangGraph
    const result = await runPinhoOps({
      sender_phone,
      sender_name: sender_name || 'Unknown',
      message_text,
      context_matter_id,
    });

    console.log(`[PinhoOps] Agent: ${result.agent_results?.[0]?.agent || 'unknown'} — ${result.error ? 'ERROR' : 'OK'}`);

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
    console.error('[PinhoOps] Fatal error:', err);
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
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
}
