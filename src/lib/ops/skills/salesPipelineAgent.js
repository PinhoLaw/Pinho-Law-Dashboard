/**
 * salesPipelineAgent — OpenClaw/Kimi Claw Custom Skill
 *
 * SOP v1.0 §2 Client Intake & Onboarding
 * SOP v1.0 §6.2 Bi-weekly Pipeline Prep
 *
 * Responsibilities:
 * - Parse WhatsApp messages about new leads and pipeline management
 * - Track leads through intake stages
 * - Generate bi-weekly pipeline prep summaries
 * - Enforce conflict check before engagement (§2.4)
 * - Read/write sales_pipeline.json via GitHub helpers
 * - Return structured WhatsApp reply
 */

import { readState, commitWithAudit, STATE_FILES } from '@/lib/ops/github';

// ─── SOP Rules ───────────────────────────────────────────

const SOP_RULES = {
  ref: '§2, §6.2',
  name: 'Sales Pipeline',
  pipelineStages: [
    'New Lead', 'Contacted', 'Consultation Scheduled', 'Consultation Completed',
    'Proposal Sent', 'Engagement Signed', 'Conflict Check', 'Opened in Clio',
    'Lost', 'Disqualified',
  ],
  leadSources: ['Website', 'Referral', 'Walk-in', 'Phone Call', 'WhatsApp', 'Social Media', 'Google Ads', 'Other'],
  biweeklyPrepDay: 'Monday', // Every other Monday
  maxDaysInStage: {
    'New Lead': 2,
    'Contacted': 5,
    'Consultation Scheduled': 7,
    'Consultation Completed': 3,
    'Proposal Sent': 7,
    'Engagement Signed': 2,
    'Conflict Check': 3,
  },
};

// ─── Tool Definition ─────────────────────────────────────

export const salesPipelineAgentTool = {
  name: 'salesPipelineAgent',
  description:
    'Manages client intake pipeline (SOP §2) and bi-weekly pipeline prep (§6.2). ' +
    'Adds/advances leads, generates pipeline reports, enforces conflict checks.',
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

export async function salesPipelineAgent(input) {
  const { whatsapp_input } = input;
  const log = createAuditLog('salesPipelineAgent', whatsapp_input);

  try {
    log.step('Loading sales pipeline from GitHub');
    const { data: salesDoc } = await readState(STATE_FILES.sales);

    const intent = parseSalesIntent(whatsapp_input.message_text);
    log.step(`Parsed intent: ${intent.type}`);

    let reply = '';
    let stateUpdated = false;

    switch (intent.type) {
      case 'add_lead': {
        if (!intent.name || !intent.phone) {
          reply =
            `*New Lead Format:*\n` +
            `new lead NAME, phone: +1XXXXXXXXXX, area: Immigration, source: Referral\n\n` +
            `Required: name, phone\n` +
            `Optional: area, source, email, referred_by`;
          break;
        }

        const newLead = {
          id: `LEAD-${Date.now()}`,
          name: intent.name,
          email: intent.email || '',
          phone: intent.phone,
          whatsapp_phone: intent.phone,
          source: intent.source || 'WhatsApp',
          practice_area: intent.area || 'Other',
          stage: 'New Lead',
          conflict_check: 'Pending',
          assigned_attorney: intent.attorney || '',
          assigned_paralegal: '',
          next_action: 'Initial contact and consultation scheduling',
          deadline: getDeadlineFromNow(SOP_RULES.maxDaysInStage['New Lead']),
          consultation_date: null,
          consultation_type: null,
          estimated_value: 0,
          retainer_amount: 0,
          engagement_signed: false,
          clio_matter_id: null,
          sop_ref: '§2.1',
          notes: `Added via WhatsApp by ${whatsapp_input.sender_name || whatsapp_input.sender_phone}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          referred_by: intent.referred_by || '',
        };

        salesDoc.leads.push(newLead);
        recalculateSummary(salesDoc);
        salesDoc.last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.sales]: salesDoc },
          `New lead added: ${newLead.name} (${newLead.practice_area})`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );
        stateUpdated = true;

        reply =
          `*New Lead Added*\n` +
          `Name: ${newLead.name}\n` +
          `Phone: ${newLead.phone}\n` +
          `Area: ${newLead.practice_area}\n` +
          `Source: ${newLead.source}\n` +
          `Stage: New Lead\n` +
          `Next action: ${newLead.next_action}\n` +
          `Deadline: ${newLead.deadline}\n` +
          `ID: ${newLead.id}`;
        break;
      }

      case 'advance_lead': {
        const lead = salesDoc.leads.find(l =>
          l.id === intent.lead_id ||
          l.name.toLowerCase().includes((intent.lead_id || '').toLowerCase())
        );
        if (!lead) {
          reply = `Lead "${intent.lead_id}" not found.`;
          break;
        }

        const currentIdx = SOP_RULES.pipelineStages.indexOf(lead.stage);
        const nextStage = intent.new_stage || SOP_RULES.pipelineStages[currentIdx + 1];

        if (!SOP_RULES.pipelineStages.includes(nextStage)) {
          reply = `Invalid stage "${nextStage}".\nStages: ${SOP_RULES.pipelineStages.join(' → ')}`;
          break;
        }

        // §2.4: Block engagement without conflict clearance
        if (nextStage === 'Engagement Signed' && lead.conflict_check !== 'Cleared') {
          reply =
            `*BLOCKED — SOP §2.4*\n` +
            `Cannot move to "Engagement Signed" without conflict check clearance.\n` +
            `Current status: ${lead.conflict_check}\n\n` +
            `Run conflict check first, then:\n` +
            `"clear conflict LEAD-ID"`;
          break;
        }

        // §9.2: Require next_action + deadline
        if (!intent.next_action) {
          const maxDays = SOP_RULES.maxDaysInStage[nextStage] || 7;
          intent.next_action = `Complete ${nextStage} phase`;
          intent.deadline = getDeadlineFromNow(maxDays);
        }

        const idx = salesDoc.leads.indexOf(lead);
        salesDoc.leads[idx].stage = nextStage;
        salesDoc.leads[idx].next_action = intent.next_action;
        salesDoc.leads[idx].deadline = intent.deadline || getDeadlineFromNow(7);
        salesDoc.leads[idx].updated_at = new Date().toISOString();
        recalculateSummary(salesDoc);
        salesDoc.last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.sales]: salesDoc },
          `Lead ${lead.name} advanced to ${nextStage}`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );
        stateUpdated = true;

        reply =
          `*Lead Advanced*\n` +
          `Name: ${lead.name}\n` +
          `Stage: ${lead.stage} → ${nextStage}\n` +
          `Next action: ${salesDoc.leads[idx].next_action}\n` +
          `Deadline: ${salesDoc.leads[idx].deadline}`;
        break;
      }

      case 'clear_conflict': {
        const lead = salesDoc.leads.find(l =>
          l.id === intent.lead_id || l.name.toLowerCase().includes((intent.lead_id || '').toLowerCase())
        );
        if (!lead) {
          reply = `Lead "${intent.lead_id}" not found.`;
          break;
        }

        const idx = salesDoc.leads.indexOf(lead);
        salesDoc.leads[idx].conflict_check = 'Cleared';
        salesDoc.leads[idx].updated_at = new Date().toISOString();
        salesDoc.last_updated = new Date().toISOString();

        await commitWithAudit(
          { [STATE_FILES.sales]: salesDoc },
          `Conflict check cleared for ${lead.name}`,
          whatsapp_input.sender_name || whatsapp_input.sender_phone,
        );
        stateUpdated = true;

        reply = `*Conflict Cleared* for ${lead.name}. Can now proceed to Engagement Signed.`;
        break;
      }

      case 'pipeline_report': {
        const active = salesDoc.leads.filter(l => !['Lost', 'Disqualified', 'Opened in Clio'].includes(l.stage));
        const stageCounts = {};
        for (const stage of SOP_RULES.pipelineStages) {
          const count = salesDoc.leads.filter(l => l.stage === stage).length;
          if (count > 0) stageCounts[stage] = count;
        }

        const stale = active.filter(l => {
          const maxDays = SOP_RULES.maxDaysInStage[l.stage] || 7;
          const daysInStage = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / 86_400_000);
          return daysInStage > maxDays;
        });

        const totalValue = active.reduce((s, l) => s + (l.estimated_value || 0), 0);

        reply =
          `*Pipeline Report*\n\n` +
          `Active leads: ${active.length}\n` +
          `Estimated value: $${totalValue.toFixed(2)}\n` +
          `Conversion rate: ${(salesDoc.summary.conversion_rate * 100).toFixed(0)}%\n\n` +
          `*By Stage:*\n` +
          Object.entries(stageCounts).map(([stage, count]) => `• ${stage}: ${count}`).join('\n') +
          (stale.length > 0
            ? `\n\n*Stale Leads (${stale.length}):*\n` +
              stale.map(l => `• ${l.name} — stuck at "${l.stage}"`).join('\n')
            : '\n\nNo stale leads.');
        break;
      }

      case 'biweekly_prep': {
        // §6.2: Bi-weekly pipeline prep summary
        const active = salesDoc.leads.filter(l => !['Lost', 'Disqualified', 'Opened in Clio'].includes(l.stage));
        const needsAction = active.filter(l => l.deadline <= new Date().toISOString().split('T')[0]);
        const pendingConflict = active.filter(l => l.conflict_check === 'Pending');
        const consultations = active.filter(l => l.stage === 'Consultation Scheduled');

        reply =
          `*Bi-Weekly Pipeline Prep (§6.2)*\n\n` +
          `Active pipeline: ${active.length} leads\n` +
          `Overdue actions: ${needsAction.length}\n` +
          `Pending conflicts: ${pendingConflict.length}\n` +
          `Upcoming consultations: ${consultations.length}\n\n` +
          (needsAction.length > 0
            ? `*Needs Action Now:*\n` +
              needsAction.map(l => `• ${l.name}: ${l.next_action} (due ${l.deadline})`).join('\n') + '\n\n'
            : '') +
          (consultations.length > 0
            ? `*Consultations:*\n` +
              consultations.map(l => `• ${l.name}: ${l.consultation_date || 'Date TBD'} (${l.consultation_type || 'TBD'})`).join('\n')
            : '');
        break;
      }

      default:
        reply =
          `Sales pipeline commands:\n` +
          `• "new lead NAME, phone: +1XXX, area: Immigration"\n` +
          `• "advance LEAD-ID to Consultation Scheduled"\n` +
          `• "clear conflict LEAD-ID"\n` +
          `• "pipeline report"\n` +
          `• "biweekly prep"`;
    }

    log.step('Complete');
    return { reply, state_updated: stateUpdated, audit: log.finalize() };
  } catch (err) {
    log.error(err.message);
    return {
      reply: `Sales agent error: ${err.message}`,
      state_updated: false,
      audit: log.finalize(),
    };
  }
}

// ─── Intent Parser ───────────────────────────────────────

function parseSalesIntent(text) {
  const lower = text.toLowerCase().trim();

  // New lead
  const leadMatch = text.match(/new lead\s+(.+?)(?:,\s*phone[:\s]+(\+?\d[\d\s-]+))?(?:,\s*area[:\s]+(\w+))?(?:,\s*source[:\s]+(\w+))?/i);
  if (leadMatch) {
    return {
      type: 'add_lead',
      name: leadMatch[1].split(',')[0].trim(),
      phone: leadMatch[2]?.replace(/[\s-]/g, '') || '',
      area: leadMatch[3],
      source: leadMatch[4],
    };
  }

  // Advance lead
  const advanceMatch = text.match(/advance\s+(\S+)(?:\s+to\s+(.+))?/i);
  if (advanceMatch) {
    return {
      type: 'advance_lead',
      lead_id: advanceMatch[1],
      new_stage: advanceMatch[2]?.trim(),
    };
  }

  // Clear conflict
  const clearMatch = text.match(/clear\s+conflict\s+(\S+)/i);
  if (clearMatch) {
    return { type: 'clear_conflict', lead_id: clearMatch[1] };
  }

  if (/^(pipeline|report|relat[óo]rio)/i.test(lower)) {
    return { type: 'pipeline_report' };
  }

  if (/^(biweekly|bi-weekly|quinzenal|prep)/i.test(lower)) {
    return { type: 'biweekly_prep' };
  }

  return { type: 'unknown' };
}

// ─── Helpers ─────────────────────────────────────────────

function getDeadlineFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function recalculateSummary(salesDoc) {
  const leads = salesDoc.leads;
  salesDoc.summary.total_leads = leads.length;

  const stageCounts = {};
  for (const stage of SOP_RULES.pipelineStages) {
    stageCounts[stage] = leads.filter(l => l.stage === stage).length;
  }
  salesDoc.summary.leads_by_stage = stageCounts;
  salesDoc.summary.total_estimated_value = leads.reduce((s, l) => s + (l.estimated_value || 0), 0);

  const opened = leads.filter(l => l.stage === 'Opened in Clio').length;
  const total = leads.filter(l => l.stage !== 'New Lead').length;
  salesDoc.summary.conversion_rate = total > 0 ? opened / total : 0;
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

export default salesPipelineAgent;
