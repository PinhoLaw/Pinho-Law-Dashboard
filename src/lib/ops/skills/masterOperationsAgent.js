/**
 * masterOperationsAgent — OpenClaw/Kimi Claw Custom Skill
 *
 * SOP v1.0 §4.1 Matter Lifecycle + §9.2 Next Action Always Required
 *
 * Responsibilities:
 * - Parse incoming WhatsApp messages about matter status
 * - Enforce next_action + deadline on every update
 * - Read/write tasks.json via GitHub helpers
 * - Return structured WhatsApp reply
 */

import { readState, writeState, commitWithAudit, STATE_FILES } from '@/lib/ops/github';

// ─── SOP Rules (loaded inline for skill portability) ─────

const SOP_RULES = {
  ref: '§4.1, §9.2',
  name: 'Master Operations',
  validStatuses: ['Open', 'Active', 'Pending Client', 'Pending Court', 'Closing', 'Archived'],
  riskLevels: ['Normal', 'Elevated', 'Critical'],
  maxDaysWithoutAction: 7,
  requireNextAction: true,
  requireDeadline: true,
  communicationSLA: 7, // days
};

// ─── Tool Definition (OpenClaw/Kimi format) ──────────────

export const masterOperationsAgentTool = {
  name: 'masterOperationsAgent',
  description:
    'Manages matter lifecycle and enforces SOP §4.1/§9.2. ' +
    'Parses WhatsApp input about case status updates, task changes, or status queries. ' +
    'Returns structured reply with updated state committed to GitHub.',
  parameters: {
    type: 'object',
    required: ['whatsapp_input'],
    properties: {
      whatsapp_input: {
        type: 'object',
        description: 'Parsed WhatsApp message object',
        required: ['sender_phone', 'message_text', 'timestamp'],
        properties: {
          sender_phone: { type: 'string', description: 'E.164 phone number' },
          sender_name: { type: 'string', description: 'Contact name if known' },
          message_text: { type: 'string', description: 'Raw message body' },
          timestamp: { type: 'string', description: 'ISO 8601 message timestamp' },
          context_matter_id: { type: 'string', description: 'Clio matter ID if context is known' },
        },
      },
    },
  },
};

// ─── Main Handler ────────────────────────────────────────

/**
 * @param {object} input - The tool input matching masterOperationsAgentTool.parameters
 * @returns {Promise<{ reply: string, state_updated: boolean, audit: object }>}
 */
export async function masterOperationsAgent(input) {
  const { whatsapp_input } = input;
  const log = createAuditLog('masterOperationsAgent', whatsapp_input);

  try {
    log.step('Loading tasks state from GitHub');
    const { data: tasksDoc, sha } = await readState(STATE_FILES.tasks);

    // Parse intent from message
    const intent = parseOperationsIntent(whatsapp_input.message_text);
    log.step(`Parsed intent: ${intent.type}`);

    let reply = '';
    let stateUpdated = false;

    switch (intent.type) {
      case 'status_query': {
        const matter = findMatter(tasksDoc, intent.matter_id || whatsapp_input.context_matter_id);
        if (!matter) {
          reply = formatReply('matter_not_found', { query: intent.matter_id });
          break;
        }
        reply = formatReply('status_report', {
          client: matter.client,
          matter_name: matter.matter_name,
          status: matter.status,
          next_action: matter.next_action,
          deadline: matter.deadline,
          risk_level: matter.risk_level,
          days_since_contact: matter.days_since_contact,
        });
        break;
      }

      case 'update_status': {
        const matter = findMatter(tasksDoc, intent.matter_id || whatsapp_input.context_matter_id);
        if (!matter) {
          reply = formatReply('matter_not_found', { query: intent.matter_id });
          break;
        }

        // SOP §9.2: Enforce next_action + deadline
        if (!intent.next_action || !intent.deadline) {
          reply = formatReply('missing_next_action', {
            client: matter.client,
            current_next_action: matter.next_action,
          });
          break;
        }

        // Validate status
        if (intent.new_status && !SOP_RULES.validStatuses.includes(intent.new_status)) {
          reply = formatReply('invalid_status', {
            provided: intent.new_status,
            valid: SOP_RULES.validStatuses.join(', '),
          });
          break;
        }

        // Apply update
        const idx = tasksDoc.matters.findIndex(m => m.clio_matter_id === matter.clio_matter_id);
        if (intent.new_status) tasksDoc.matters[idx].status = intent.new_status;
        tasksDoc.matters[idx].next_action = intent.next_action;
        tasksDoc.matters[idx].deadline = intent.deadline;
        tasksDoc.matters[idx].last_action = intent.description || `Updated via WhatsApp by ${whatsapp_input.sender_name || whatsapp_input.sender_phone}`;
        tasksDoc.matters[idx].last_action_date = new Date().toISOString().split('T')[0];
        tasksDoc.matters[idx].updated_at = new Date().toISOString();

        // Risk assessment
        tasksDoc.matters[idx].risk_level = assessRisk(tasksDoc.matters[idx]);

        tasksDoc.last_updated = new Date().toISOString();

        // Commit to GitHub
        log.step('Committing updated state to GitHub');
        const audit = await commitWithAudit(
          { [STATE_FILES.tasks]: tasksDoc },
          `Matter ${matter.clio_matter_id} status updated: ${intent.new_status || matter.status}`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );

        stateUpdated = true;
        reply = formatReply('status_updated', {
          client: matter.client,
          new_status: intent.new_status || matter.status,
          next_action: intent.next_action,
          deadline: intent.deadline,
          commit: audit.commitSha.substring(0, 7),
        });
        break;
      }

      case 'daily_briefing': {
        const active = tasksDoc.matters.filter(m => m.status !== 'Archived');
        const overdue = active.filter(m => m.deadline && m.deadline < new Date().toISOString().split('T')[0]);
        const critical = active.filter(m => m.risk_level === 'Critical');
        const stale = active.filter(m => m.days_since_contact > SOP_RULES.communicationSLA);

        reply = formatReply('daily_briefing', {
          total_active: active.length,
          overdue_count: overdue.length,
          critical_count: critical.length,
          stale_count: stale.length,
          top_overdue: overdue.slice(0, 5).map(m => `• ${m.client}: ${m.next_action} (due ${m.deadline})`).join('\n'),
          top_critical: critical.slice(0, 3).map(m => `• ${m.client}: ${m.next_action}`).join('\n'),
        });
        break;
      }

      default:
        reply = formatReply('unknown_intent', { text: whatsapp_input.message_text });
    }

    log.step('Complete');
    return {
      reply,
      state_updated: stateUpdated,
      audit: log.finalize(),
    };
  } catch (err) {
    log.error(err.message);
    return {
      reply: formatReply('error', { message: err.message }),
      state_updated: false,
      audit: log.finalize(),
    };
  }
}

// ─── Intent Parser ───────────────────────────────────────

function parseOperationsIntent(text) {
  const lower = text.toLowerCase().trim();

  // Status query patterns
  if (/^(status|como est[áa]|update on|check)\s/i.test(lower) || /\bstatus\b/i.test(lower)) {
    const matterMatch = text.match(/(?:matter|caso|#)\s*(\S+)/i);
    return { type: 'status_query', matter_id: matterMatch?.[1] || null };
  }

  // Daily briefing
  if (/^(briefing|resumo|daily|di[áa]rio)/i.test(lower)) {
    return { type: 'daily_briefing' };
  }

  // Status update: "update MATTER-ID to Active, next: file motion, deadline: 2026-03-15"
  const updateMatch = text.match(
    /update\s+(\S+)\s+(?:to\s+)?(\w[\w\s]*?)(?:,\s*next[:\s]+(.+?))?(?:,\s*deadline[:\s]+(\d{4}-\d{2}-\d{2}))?$/i
  );
  if (updateMatch) {
    return {
      type: 'update_status',
      matter_id: updateMatch[1],
      new_status: updateMatch[2]?.trim(),
      next_action: updateMatch[3]?.trim(),
      deadline: updateMatch[4],
    };
  }

  return { type: 'unknown' };
}

// ─── Helpers ─────────────────────────────────────────────

function findMatter(tasksDoc, matterId) {
  if (!matterId) return null;
  return tasksDoc.matters.find(m =>
    m.clio_matter_id === matterId ||
    m.id === matterId ||
    m.client.toLowerCase().includes(matterId.toLowerCase())
  ) || null;
}

function assessRisk(matter) {
  const today = new Date().toISOString().split('T')[0];
  if (matter.deadline < today) return 'Critical';
  const daysUntil = Math.floor((new Date(matter.deadline) - new Date(today)) / 86_400_000);
  if (daysUntil <= 3 || matter.days_since_contact > 14) return 'Elevated';
  return 'Normal';
}

function formatReply(template, data) {
  const templates = {
    status_report:
      `*${data.client}*\n` +
      `Status: ${data.status}\n` +
      `Next: ${data.next_action}\n` +
      `Deadline: ${data.deadline}\n` +
      `Risk: ${data.risk_level}\n` +
      `Days since contact: ${data.days_since_contact}`,
    status_updated:
      `Updated *${data.client}*\n` +
      `Status: ${data.new_status}\n` +
      `Next action: ${data.next_action}\n` +
      `Deadline: ${data.deadline}\n` +
      `Commit: ${data.commit}`,
    daily_briefing:
      `*Daily Briefing*\n` +
      `Active: ${data.total_active} | Overdue: ${data.overdue_count} | Critical: ${data.critical_count} | Stale: ${data.stale_count}\n\n` +
      (data.top_overdue ? `*Overdue:*\n${data.top_overdue}\n\n` : '') +
      (data.top_critical ? `*Critical:*\n${data.top_critical}` : ''),
    missing_next_action:
      `Cannot update *${data.client}* — SOP §9.2 requires:\n` +
      `• next_action (what happens next)\n` +
      `• deadline (when)\n\n` +
      `Current next action: ${data.current_next_action}\n\n` +
      `Reply: update MATTER-ID to STATUS, next: ACTION, deadline: YYYY-MM-DD`,
    invalid_status:
      `Invalid status "${data.provided}".\nValid: ${data.valid}`,
    matter_not_found:
      `Matter "${data.query}" not found. Check the matter ID or client name.`,
    unknown_intent:
      `I didn't understand that. Try:\n` +
      `• "status MATTER-ID"\n` +
      `• "update MATTER-ID to Active, next: file motion, deadline: 2026-03-15"\n` +
      `• "briefing"`,
    error: `Error: ${data.message}. Please try again or contact support.`,
  };
  return templates[template] || `Unknown template: ${template}`;
}

// ─── Audit Logger ────────────────────────────────────────

function createAuditLog(agent, input) {
  const entries = [];
  const start = Date.now();
  return {
    step(msg) { entries.push({ ts: new Date().toISOString(), msg }); },
    error(msg) { entries.push({ ts: new Date().toISOString(), msg: `ERROR: ${msg}` }); },
    finalize() {
      return {
        agent,
        input_phone: input.sender_phone,
        started_at: new Date(start).toISOString(),
        duration_ms: Date.now() - start,
        steps: entries,
      };
    },
  };
}

export default masterOperationsAgent;
