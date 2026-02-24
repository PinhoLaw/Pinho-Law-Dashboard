/**
 * WhatsApp Message Handler
 *
 * Receives parsed messages, routes through PinhoOps LangGraph,
 * and sends the response back via WhatsApp.
 */

import {
  parseIncomingMessage,
  shouldProcessMessage,
  sendWhatsAppMessage,
  markMessageAsRead,
} from './service';

// ─── Main Handler ────────────────────────────────────────

export async function handleWhatsAppWebhook(body: any): Promise<void> {
  const parsed = parseIncomingMessage(body);

  if (!parsed) {
    // Status update or non-text message — ignore silently
    return;
  }

  console.log(`[WhatsApp] Message from ${parsed.senderName} (${parsed.from}): "${parsed.text.substring(0, 100)}"`);

  if (!shouldProcessMessage(parsed)) {
    console.log('[WhatsApp] Skipping — not a DM or @PinhoOps mention');
    return;
  }

  // Mark as read immediately
  await markMessageAsRead(parsed.messageId);

  // Strip @PinhoOps trigger if present
  let messageText = parsed.text
    .replace(/@PinhoOps/gi, '')
    .replace(/@pinhoops/gi, '')
    .trim();

  // If empty after stripping trigger, send help
  if (!messageText) {
    await sendWhatsAppMessage(parsed.from, HELP_MESSAGE);
    return;
  }

  // Extract matter ID if present (format: MATTER-123 or #123)
  const matterMatch = messageText.match(/(?:MATTER-|#)(\d+)/i);
  const contextMatterId = matterMatch?.[1];

  try {
    // Dynamic import to avoid build-time crash
    const { runPinhoOps } = await import('../pinhoops/graph');

    const result = await runPinhoOps({
      sender_phone: parsed.from,
      sender_name: parsed.senderName,
      message_text: messageText,
      timestamp: parsed.timestamp,
      context_matter_id: contextMatterId,
    });

    const agentName = result.agent_results?.[0]?.agent || 'PinhoOps';
    console.log(`[WhatsApp] Agent: ${agentName} | Error: ${result.error || 'none'}`);

    // Send the reply
    const replyText = result.reply || 'Hmm, algo deu errado aqui. Tenta de novo?';
    const sendResult = await sendWhatsAppMessage(parsed.from, replyText);

    if (!sendResult.success) {
      console.error('[WhatsApp] Failed to send reply:', sendResult.error);
    }

    // Audit log (privacy-safe)
    console.log(JSON.stringify({
      event: 'pinhoops_wa_message',
      from_hash: hashPhone(parsed.from),
      sender_first_name: parsed.senderName.split(' ')[0],
      agent: agentName,
      duration_ms: result.agent_results?.[0]?.audit?.duration_ms,
      had_error: !!result.error,
      hitl_required: result.human_approval?.required || false,
      timestamp: new Date().toISOString(),
    }));
  } catch (err: any) {
    console.error('[WhatsApp] Handler error:', err);

    // Send friendly error in Portuguese
    await sendWhatsAppMessage(
      parsed.from,
      'Sistema encontrou um erro temporário. Por favor, tente novamente em alguns minutos. Se o problema persistir, entre em contato diretamente com o escritório.',
    );
  }
}

// ─── Help Message ────────────────────────────────────────

const HELP_MESSAGE = `*PinhoOps AI* - Seu assistente operacional

Pode me perguntar qualquer coisa sobre:

*Casos e Operações*
- "daily briefing" ou "o que está acontecendo?"
- "status do caso MATTER-123"
- "quais casos precisam de atenção?"

*Agenda*
- "estou livre amanhã às 14h?"
- "quando é o próximo execution block?"

*Tarefas*
- "qual é o workload da Inez?"
- "quem está cuidando do caso Mendes?"

*Financeiro*
- "quem deve dinheiro?"
- "log 2h on MATTER-123: consulta com cliente"

*Pipeline*
- "novos leads desta semana"
- "status do pipeline"

Pode mandar em inglês ou português!`;

// ─── Helpers ─────────────────────────────────────────────

function hashPhone(phone: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(phone).digest('hex').substring(0, 12);
}
