/**
 * PinhoOps — WhatsApp Message Handler
 *
 * Parses incoming WhatsApp messages, routes @PinhoOps commands
 * through the LangGraph supervisor, and sends replies back.
 *
 * Flow:
 *   1. Parse incoming webhook payload
 *   2. Check if message should be processed (@PinhoOps trigger or monitored group)
 *   3. Mark as read (read receipt)
 *   4. Strip trigger, extract context (matter ID, etc.)
 *   5. Run through LangGraph supervisor
 *   6. Send reply via WhatsApp
 *   7. Log to audit trail
 */

import {
  parseIncomingMessage,
  shouldProcessMessage,
  sendWhatsAppMessage,
  markMessageAsRead,
  type WhatsAppIncomingMessage,
} from '@/lib/ops/pinhoops/tools/whatsapp';
import { opsLog } from '@/lib/ops/pinhoops/logger';

const log = opsLog.child('wa-handler');

// ─── Types ──────────────────────────────────────────────

interface HandlerResult {
  processed: boolean;
  reply?: string;
  agent?: string;
  error?: string;
  durationMs?: number;
}

// ─── Main Handler ───────────────────────────────────────

/**
 * Handle an incoming WhatsApp webhook payload.
 * This is the main entry point called by the webhook route.
 */
export async function handleWhatsAppWebhook(body: any): Promise<HandlerResult> {
  const start = Date.now();

  // 1. Parse the message
  const message = parseIncomingMessage(body);
  if (!message) {
    return { processed: false };
  }

  // 2. Check if we should process this message
  if (!shouldProcessMessage(message)) {
    log.debug('Message skipped — no trigger', { from: message.from });
    return { processed: false };
  }

  log.info('Processing WhatsApp message', {
    from: message.from,
    sender: message.senderName,
    is_group: message.isGroup,
    group_id: message.groupId,
    has_trigger: /@PinhoOps/i.test(message.text),
  });

  // 3. Mark as read
  await markMessageAsRead(message.messageId);

  // 4. Clean the message and extract context
  const cleanMessage = message.text
    .replace(/@PinhoOps\s*/i, '')
    .trim();

  if (!cleanMessage) {
    // Send help message if just "@PinhoOps" with nothing else
    const helpText = [
      '*PinhoOps AI* está pronto! 🤖',
      '',
      'Comandos disponíveis:',
      '• _@PinhoOps daily briefing_ — Resumo do dia',
      '• _@PinhoOps status [caso]_ — Status de um caso',
      '• _@PinhoOps log 2h on [caso]: descrição_ — Registrar horas',
      '• _@PinhoOps who owes money_ — Cobranças pendentes',
      '• _@PinhoOps new lead: [nome], [tipo]_ — Novo lead',
      '• _@PinhoOps schedule meeting [data/hora]_ — Agendar reunião',
      '• _@PinhoOps workload report_ — Carga de trabalho',
      '',
      '_Equipe PinhoLaw_',
    ].join('\n');

    await sendWhatsAppMessage(message.from, helpText, message.messageId);
    return {
      processed: true,
      reply: helpText,
      agent: 'help',
      durationMs: Date.now() - start,
    };
  }

  // Extract matter ID from message (patterns: #1001, matter 1001, on 1001)
  const matterMatch = cleanMessage.match(/#(\d+)|matter\s+(\d+)|on\s+(\d+)/i);
  const contextMatterId = matterMatch?.[1] || matterMatch?.[2] || matterMatch?.[3];

  // 5. Run through LangGraph
  try {
    log.startTimer('langgraph');

    // Dynamic import to avoid build-time issues
    const { runPinhoOps } = await import('@/lib/ops/pinhoops/graph');

    const result = await runPinhoOps({
      sender_phone: message.from,
      sender_name: message.senderName,
      message_text: cleanMessage,
      context_matter_id: contextMatterId,
    });

    const lgMs = log.endTimer('langgraph');
    const agent = result.agent_results?.[0]?.agent || 'unknown';

    log.info('LangGraph completed', {
      agent,
      duration_ms: lgMs,
      has_error: !!result.error,
      human_approval: result.human_approval?.required || false,
    });

    // 6. Build and send reply
    let replyText = result.reply || 'Sistema processou sua solicitação.';

    // Add human approval notice if needed
    if (result.human_approval?.required) {
      replyText += '\n\n---\n⚠️ _Esta ação requer aprovação._\n';
      replyText += `Motivo: ${result.human_approval.reason}\n`;
      replyText += '_Responda APROVAR ou NEGAR._';
    }

    // Add error notice
    if (result.error) {
      replyText += `\n\n⚠️ _Aviso: ${result.error}_`;
    }

    await sendWhatsAppMessage(message.from, replyText, message.messageId);

    // 7. Log to audit (non-blocking)
    logAudit(message, replyText, agent, Date.now() - start).catch(() => {});

    return {
      processed: true,
      reply: replyText,
      agent,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    log.logError('LangGraph processing failed', err);

    // Send graceful error reply
    const errorReply =
      '⚠️ *PinhoOps — Erro Temporário*\n\n' +
      'Sistema encontrou um erro ao processar sua mensagem. ' +
      'Por favor, tente novamente em alguns minutos.\n\n' +
      '_Equipe PinhoLaw_';

    await sendWhatsAppMessage(message.from, errorReply, message.messageId);

    return {
      processed: true,
      reply: errorReply,
      agent: 'error',
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Audit Logging ──────────────────────────────────────

/**
 * Log WhatsApp interaction to GitHub audit trail.
 * Non-critical — failures are logged but don't affect the response.
 */
async function logAudit(
  message: WhatsAppIncomingMessage,
  reply: string,
  agent: string,
  durationMs: number,
): Promise<void> {
  try {
    const { commitWithAudit } = await import('@/lib/ops/github');

    // Build audit entry — NO client data in the log for privacy
    const auditEntry = {
      timestamp: new Date().toISOString(),
      type: 'whatsapp_interaction',
      sender_phone_hash: hashPhone(message.from),
      sender_name: message.senderName.split(' ')[0], // First name only
      is_group: message.isGroup,
      agent,
      message_length: message.text.length,
      reply_length: reply.length,
      duration_ms: durationMs,
      sop_ref: getSopRef(agent),
    };

    // Read existing audit log, append, write back
    let auditLog: any[] = [];
    try {
      const { readState } = await import('@/lib/ops/github');
      const { data } = await readState('audit_log.json' as any);
      auditLog = Array.isArray(data) ? data : (data as any)?.entries || [];
    } catch {
      // First entry — start fresh
    }

    // Keep last 500 entries to prevent file from growing too large
    auditLog.push(auditEntry);
    if (auditLog.length > 500) {
      auditLog = auditLog.slice(-500);
    }

    await commitWithAudit(
      { 'audit_log.json': { entries: auditLog, last_updated: new Date().toISOString() } } as any,
      `WhatsApp: ${message.senderName.split(' ')[0]} → ${agent} (${durationMs}ms)`,
      'whatsapp-handler',
    );
  } catch (err: any) {
    log.warn('Audit log write failed (non-critical)', { error: err.message });
  }
}

/**
 * Hash phone number for privacy-safe logging.
 */
function hashPhone(phone: string): string {
  // Simple hash for logging — not cryptographic
  let hash = 0;
  for (let i = 0; i < phone.length; i++) {
    hash = ((hash << 5) - hash + phone.charCodeAt(i)) | 0;
  }
  return `ph_${Math.abs(hash).toString(36)}`;
}

/**
 * Map agent name to SOP reference.
 */
function getSopRef(agent: string): string {
  const refs: Record<string, string> = {
    MasterOperationsAgent: '§4.1, §9.2',
    ScheduleProtectionAgent: '§6, §10.5',
    TaskDelegationAgent: '§3, §5, §9.5',
    BillingCaptureAgent: '§8, §9.1',
    SalesPipelineAgent: '§2, §6.2',
  };
  return refs[agent] || 'N/A';
}
