/**
 * PinhoOps Orchestrator — Kimi Claw Skill
 *
 * Catches messages containing @PinhoOps, strips the trigger,
 * forwards to the PinhoOps LangGraph API, returns the reply.
 *
 * Usage in Kimi Claw:
 *   1. Import this skill
 *   2. Register the trigger pattern: /@PinhoOps/i
 *   3. The skill handles the rest
 *
 * Copy-paste ready for Kimi Claw skill registration.
 */

// ─── Configuration ──────────────────────────────────────

const PINHOOPS_ENDPOINT = process.env.PINHOOPS_ENDPOINT
  || 'https://pinholaw-ops.vercel.app/api/pinhoops';

const PINHOOPS_TIMEOUT = 60_000; // 60s — LLM processing takes time

// ─── Trigger Pattern ────────────────────────────────────

export const TRIGGER = /@PinhoOps/i;

/**
 * Check if a message should be handled by this skill.
 */
export function shouldHandle(message: string): boolean {
  return TRIGGER.test(message);
}

// ─── Types ──────────────────────────────────────────────

interface PinhoOpsRequest {
  sender_phone: string;
  sender_name: string;
  message_text: string;
  context_matter_id?: string;
}

interface PinhoOpsResponse {
  reply: string;
  agent: string | null;
  state_updated: boolean;
  human_approval_required: boolean;
  error: string | null;
  audit: Array<{
    agent: string;
    duration_ms: number;
    steps: number;
  }>;
}

// ─── Core Handler ───────────────────────────────────────

/**
 * Process a @PinhoOps message.
 *
 * @param senderPhone  - WhatsApp phone number (e.g., "+15551234567")
 * @param senderName   - Display name of the sender
 * @param rawMessage   - Full message text (including @PinhoOps trigger)
 * @param matterId     - Optional Clio matter ID for context
 * @returns Clean WhatsApp-formatted reply text
 */
export async function handlePinhoOps(
  senderPhone: string,
  senderName: string,
  rawMessage: string,
  matterId?: string,
): Promise<{
  reply: string;
  agent: string;
  humanApprovalRequired: boolean;
  error: string | null;
}> {
  // Strip the @PinhoOps trigger from the message
  const cleanMessage = rawMessage
    .replace(/@PinhoOps\s*/i, '')
    .trim();

  if (!cleanMessage) {
    return {
      reply: '*PinhoOps AI* está pronto! 🤖\n\nEnvie um comando como:\n• _daily briefing_\n• _status on [matter]_\n• _log 2h on [matter]: description_\n• _who owes money?_\n• _new lead: [name], [type]_',
      agent: 'help',
      humanApprovalRequired: false,
      error: null,
    };
  }

  // Extract matter ID from message if present (pattern: #1001 or matter 1001)
  const matterMatch = cleanMessage.match(/#(\d+)|matter\s+(\d+)|on\s+(\d+)/i);
  const contextMatterId = matterId || matterMatch?.[1] || matterMatch?.[2] || matterMatch?.[3];

  const payload: PinhoOpsRequest = {
    sender_phone: senderPhone,
    sender_name: senderName,
    message_text: cleanMessage,
    ...(contextMatterId ? { context_matter_id: contextMatterId } : {}),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PINHOOPS_TIMEOUT);

    const response = await fetch(PINHOOPS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PinhoOps Skill] API error ${response.status}:`, errorText);
      return {
        reply: `⚠️ *PinhoOps Error*\n\nSistema temporariamente indisponível (${response.status}). Tente novamente em alguns minutos.`,
        agent: 'error',
        humanApprovalRequired: false,
        error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
      };
    }

    const data: PinhoOpsResponse = await response.json();

    // Add approval notice if needed
    let finalReply = data.reply || 'No response from agent.';
    if (data.human_approval_required) {
      finalReply += '\n\n---\n⚠️ _Esta ação requer aprovação. Responda APROVAR ou NEGAR._';
    }

    return {
      reply: finalReply,
      agent: data.agent || 'unknown',
      humanApprovalRequired: data.human_approval_required,
      error: data.error,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        reply: '⏱️ *PinhoOps Timeout*\n\nA solicitação excedeu o tempo limite de 60 segundos. Tente com um comando mais simples.',
        agent: 'timeout',
        humanApprovalRequired: false,
        error: 'Request timed out after 60s',
      };
    }

    console.error('[PinhoOps Skill] Network error:', err.message);
    return {
      reply: `❌ *PinhoOps Offline*\n\nNão foi possível conectar ao sistema. Erro: ${err.message}`,
      agent: 'error',
      humanApprovalRequired: false,
      error: err.message,
    };
  }
}

// ─── Kimi Claw Integration ──────────────────────────────

/**
 * Full Kimi Claw skill handler.
 *
 * This is the main entry point that Kimi Claw calls.
 * It receives the raw webhook payload and returns the reply.
 *
 * Register this in your Kimi Claw config:
 * ```js
 * const pinhoops = require('./skills/pinhoops-orchestrator');
 *
 * // In your message handler:
 * if (pinhoops.shouldHandle(message.text)) {
 *   const result = await pinhoops.handlePinhoOps(
 *     message.from,
 *     message.senderName,
 *     message.text,
 *   );
 *   await sendWhatsAppReply(message.from, result.reply);
 * }
 * ```
 */
export default {
  name: 'PinhoOps Orchestrator',
  description: 'Routes @PinhoOps messages to PinhoLaw AI operations system',
  version: '1.0.0',
  trigger: TRIGGER,
  shouldHandle,
  handlePinhoOps,
};
