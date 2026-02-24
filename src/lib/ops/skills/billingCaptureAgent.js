/**
 * billingCaptureAgent — OpenClaw/Kimi Claw Custom Skill
 *
 * SOP v1.0 §9.1 24h Time Entry Requirement
 * SOP v1.0 §8 Billing & Collections
 *
 * Responsibilities:
 * - Parse WhatsApp billing/time entry messages
 * - Enforce 24h time entry compliance
 * - Generate billing follow-up prompt text for WA
 * - Read/write billing_ledger.json via GitHub helpers
 * - Return structured WhatsApp reply with exact prompt text
 */

import { readState, commitWithAudit, STATE_FILES } from '@/lib/ops/github';

// ─── SOP Rules ───────────────────────────────────────────

const SOP_RULES = {
  ref: '§8, §9.1',
  name: 'Billing Capture',
  maxHoursBeforeEntry: 24, // hours
  billingTypes: ['Hourly', 'Flat Fee', 'Contingency', 'Hybrid'],
  entryTypes: ['Billable', 'Non-Billable', 'Flat Fee'],
  followupThresholdDays: 30,
  defaultRate: 350, // $/hr default attorney rate
};

// ─── Tool Definition ─────────────────────────────────────

export const billingCaptureAgentTool = {
  name: 'billingCaptureAgent',
  description:
    'Captures time entries via WhatsApp, enforces 24h billing compliance (SOP §9.1), ' +
    'generates billing follow-up prompt text, and manages the billing ledger.',
  parameters: {
    type: 'object',
    required: ['whatsapp_input'],
    properties: {
      whatsapp_input: {
        type: 'object',
        required: ['sender_phone', 'message_text', 'timestamp'],
        properties: {
          sender_phone: { type: 'string' },
          sender_name: { type: 'string' },
          message_text: { type: 'string' },
          timestamp: { type: 'string' },
        },
      },
    },
  },
};

// ─── Main Handler ────────────────────────────────────────

export async function billingCaptureAgent(input) {
  const { whatsapp_input } = input;
  const log = createAuditLog('billingCaptureAgent', whatsapp_input);

  try {
    log.step('Loading billing state from GitHub');
    const { data: billingDoc } = await readState(STATE_FILES.billing);

    const intent = parseBillingIntent(whatsapp_input.message_text);
    log.step(`Parsed intent: ${intent.type}`);

    let reply = '';
    let stateUpdated = false;

    switch (intent.type) {
      case 'log_time': {
        // Parse: "log 1.5h on MATTER-ID: Drafted motion for summary judgment"
        if (!intent.matter_id || !intent.hours || !intent.description) {
          reply =
            `*Time Entry Format:*\n` +
            `log [hours]h on [MATTER-ID]: [description]\n\n` +
            `Example:\n` +
            `log 1.5h on TEMP-LIT-001: Drafted motion for summary judgment`;
          break;
        }

        const matter = billingDoc.matters.find(m => m.clio_matter_id === intent.matter_id);
        if (!matter) {
          reply = `Matter "${intent.matter_id}" not found in billing ledger.`;
          break;
        }

        const entry = {
          id: `TE-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          attorney: whatsapp_input.sender_name || 'Unknown',
          hours: intent.hours,
          rate: intent.rate || SOP_RULES.defaultRate,
          amount: intent.hours * (intent.rate || SOP_RULES.defaultRate),
          type: intent.entry_type || 'Billable',
          description: intent.description,
          approval_status: 'Draft',
          approved_by: '',
          approved_at: '',
          clio_time_entry_id: null,
        };

        const idx = billingDoc.matters.indexOf(matter);
        billingDoc.matters[idx].time_entries.push(entry);
        billingDoc.matters[idx].total_billable_hours += entry.type === 'Billable' ? entry.hours : 0;
        billingDoc.matters[idx].total_nonbillable_hours += entry.type === 'Non-Billable' ? entry.hours : 0;
        billingDoc.last_updated = new Date().toISOString();

        // Recalculate summary
        recalculateSummary(billingDoc);

        await commitWithAudit(
          { [STATE_FILES.billing]: billingDoc },
          `Time entry: ${entry.hours}h on ${intent.matter_id} by ${entry.attorney}`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );
        stateUpdated = true;

        reply =
          `*Time Entry Logged*\n` +
          `Matter: ${matter.client} (${matter.clio_matter_id})\n` +
          `Hours: ${entry.hours}h @ $${entry.rate}/hr = $${entry.amount.toFixed(2)}\n` +
          `Type: ${entry.type}\n` +
          `Description: ${entry.description}\n` +
          `Status: Draft (needs approval)\n` +
          `Entry ID: ${entry.id}`;
        break;
      }

      case 'who_owes': {
        const owing = billingDoc.matters
          .filter(m => m.total_outstanding > 0)
          .sort((a, b) => b.total_outstanding - a.total_outstanding);

        if (owing.length === 0) {
          reply = `*No outstanding balances.* All clients are paid up.`;
          break;
        }

        const total = owing.reduce((s, m) => s + m.total_outstanding, 0);
        reply =
          `*Outstanding Balances: $${total.toFixed(2)}*\n` +
          `${owing.length} client(s)\n\n` +
          owing.slice(0, 10).map(m =>
            `• $${m.total_outstanding.toFixed(2)} — ${m.client} (${m.clio_matter_id})${m.days_since_payment > 30 ? ' ⚠️' : ''}`
          ).join('\n') +
          (owing.length > 10 ? `\n... and ${owing.length - 10} more` : '');
        break;
      }

      case 'generate_followup': {
        // §8.3: Generate exact prompt text for billing follow-up WA message
        const matter = billingDoc.matters.find(m => m.clio_matter_id === intent.matter_id);
        if (!matter) {
          reply = `Matter "${intent.matter_id}" not found.`;
          break;
        }

        if (matter.total_outstanding <= 0) {
          reply = `${matter.client} has no outstanding balance.`;
          break;
        }

        // Generate the exact WhatsApp billing prompt text
        const firstName = matter.client.split(' ')[0];
        const promptText = generateBillingPrompt(firstName, matter.total_outstanding, matter.days_since_payment);

        // Store the prompt on the matter
        const idx = billingDoc.matters.indexOf(matter);
        billingDoc.matters[idx].followup_prompt = promptText;
        billingDoc.matters[idx].followup_needed = true;
        billingDoc.last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.billing]: billingDoc },
          `Billing follow-up prompt generated for ${matter.clio_matter_id}`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );
        stateUpdated = true;

        reply =
          `*Billing Follow-up Prompt Generated*\n` +
          `Client: ${matter.client}\n` +
          `Outstanding: $${matter.total_outstanding.toFixed(2)}\n` +
          `Days since payment: ${matter.days_since_payment}\n\n` +
          `--- COPY BELOW FOR WHATSAPP ---\n\n` +
          promptText +
          `\n\n--- END ---`;
        break;
      }

      case 'billing_summary': {
        const s = billingDoc.summary;
        reply =
          `*Billing Summary*\n\n` +
          `Total outstanding: $${s.total_outstanding.toFixed(2)}\n` +
          `Total paid: $${s.total_paid.toFixed(2)}\n` +
          `Total billable hours: ${s.total_billable_hours.toFixed(1)}h\n` +
          `Clients with balance: ${s.clients_with_balance}\n` +
          `Total matters: ${s.total_matters}`;
        break;
      }

      case 'compliance_check': {
        // §9.1: Check 24h time entry compliance
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const todayStr = today.toISOString().split('T')[0];
        const recentEntries = billingDoc.matters.flatMap(m =>
          m.time_entries.filter(te => te.date === todayStr || te.date === yesterdayStr)
        );

        const attorneys = [...new Set(SOP_RULES.roster || ['Guillerme', 'Daniel', 'Inez', 'Mariana'])];
        const loggedToday = [...new Set(recentEntries.filter(te => te.date === todayStr).map(te => te.attorney))];

        reply =
          `*24h Time Entry Compliance (§9.1)*\n\n` +
          `Entries today: ${recentEntries.filter(te => te.date === todayStr).length}\n` +
          `Entries yesterday: ${recentEntries.filter(te => te.date === yesterdayStr).length}\n` +
          `Team members who logged today: ${loggedToday.join(', ') || 'None'}\n\n` +
          (loggedToday.length === 0
            ? `*Warning:* No time entries logged today. SOP §9.1 requires entries within 24h.`
            : `Compliance on track.`);
        break;
      }

      default:
        reply =
          `Billing commands:\n` +
          `• "log 1.5h on MATTER-ID: description"\n` +
          `• "who owes"\n` +
          `• "followup MATTER-ID" (generate WA prompt)\n` +
          `• "billing summary"\n` +
          `• "compliance check"`;
    }

    log.step('Complete');
    return { reply, state_updated: stateUpdated, audit: log.finalize() };
  } catch (err) {
    log.error(err.message);
    return {
      reply: `Billing agent error: ${err.message}`,
      state_updated: false,
      audit: log.finalize(),
    };
  }
}

// ─── Billing Prompt Generator ────────────────────────────

/**
 * Generate the exact WhatsApp billing follow-up prompt text.
 * Written in Brazilian Portuguese per SOP §8.3 + wa-update.txt rules.
 */
function generateBillingPrompt(firstName, outstanding, daysSincePayment) {
  if (daysSincePayment > 60) {
    // Firm but professional
    return (
      `Olá ${firstName}!\n\n` +
      `Gostaríamos de conversar sobre o saldo em aberto no valor de $${outstanding.toFixed(2)}. ` +
      `Entendemos que imprevistos acontecem, mas precisamos regularizar a situação para que possamos continuar ` +
      `acompanhando seu caso da melhor forma possível.\n\n` +
      `Podemos discutir opções de pagamento que funcionem para você. ` +
      `Por favor, entre em contato conosco o mais breve possível.\n\n` +
      `Qualquer dúvida, estamos à disposição!\n\n` +
      `Equipe PinhoLaw`
    );
  }

  if (daysSincePayment > 30) {
    // Gentle reminder
    return (
      `Olá ${firstName}!\n\n` +
      `Esperamos que esteja tudo bem! Passando para lembrar sobre o saldo de $${outstanding.toFixed(2)} ` +
      `referente ao seu caso.\n\n` +
      `Se já realizou o pagamento, por favor desconsidere esta mensagem. ` +
      `Caso contrário, ficaremos felizes em ajudar com qualquer dúvida sobre a fatura.\n\n` +
      `Qualquer dúvida, estamos à disposição!\n\n` +
      `Equipe PinhoLaw`
    );
  }

  // Standard diplomatic mention
  return (
    `Olá ${firstName}!\n\n` +
    `Informamos que há um saldo de $${outstanding.toFixed(2)} em aberto. ` +
    `Caso tenha alguma dúvida sobre a fatura, estamos à disposição para esclarecer.\n\n` +
    `Equipe PinhoLaw`
  );
}

// ─── Intent Parser ───────────────────────────────────────

function parseBillingIntent(text) {
  const lower = text.toLowerCase().trim();

  // Log time: "log 1.5h on MATTER-ID: description"
  const logMatch = text.match(/log\s+([\d.]+)h?\s+on\s+(\S+)[:\s]+(.+)/i);
  if (logMatch) {
    return {
      type: 'log_time',
      hours: parseFloat(logMatch[1]),
      matter_id: logMatch[2],
      description: logMatch[3].trim(),
      entry_type: /non.?bill/i.test(logMatch[3]) ? 'Non-Billable' : 'Billable',
    };
  }

  if (/^(who owes|quem deve|outstanding|balances)/i.test(lower)) {
    return { type: 'who_owes' };
  }

  const followupMatch = text.match(/(?:followup|follow.up|cobran[çc]a)\s+(\S+)/i);
  if (followupMatch) {
    return { type: 'generate_followup', matter_id: followupMatch[1] };
  }

  if (/^(billing summary|resumo|faturamento)/i.test(lower)) {
    return { type: 'billing_summary' };
  }

  if (/^(compliance|24h|time entry check)/i.test(lower)) {
    return { type: 'compliance_check' };
  }

  return { type: 'unknown' };
}

// ─── Helpers ─────────────────────────────────────────────

function recalculateSummary(billingDoc) {
  const matters = billingDoc.matters;
  billingDoc.summary.total_outstanding = matters.reduce((s, m) => s + m.total_outstanding, 0);
  billingDoc.summary.total_paid = matters.reduce((s, m) => s + m.total_paid, 0);
  billingDoc.summary.total_billable_hours = matters.reduce((s, m) => s + m.total_billable_hours, 0);
  billingDoc.summary.clients_with_balance = matters.filter(m => m.total_outstanding > 0).length;
  billingDoc.summary.total_matters = matters.length;
}

function createAuditLog(agent, input) {
  const entries = [];
  const start = Date.now();
  return {
    step(msg) { entries.push({ ts: new Date().toISOString(), msg }); },
    error(msg) { entries.push({ ts: new Date().toISOString(), msg: `ERROR: ${msg}` }); },
    finalize() {
      return {
        agent, input_phone: input.sender_phone,
        started_at: new Date(start).toISOString(),
        duration_ms: Date.now() - start, steps: entries,
      };
    },
  };
}

export default billingCaptureAgent;
