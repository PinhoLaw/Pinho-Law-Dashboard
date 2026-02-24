/**
 * PinhoOps AI v1.0 — Agent Node Functions
 *
 * 5 specialized agent nodes + 1 supervisor:
 *   1. MasterOperationsAgent (§4.1, §9.2)
 *   2. ScheduleProtectionAgent (§6, §10.5)
 *   3. TaskDelegationAgent (§9.5, §3)
 *   4. BillingCaptureAgent (§9.1, §8)
 *   5. SalesPipelineAgent (§2, §6.2)
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { readState, STATE_FILES } from '@/lib/ops/github';
import type { PinhoOpsStateType } from '@/lib/ops/pinhoops/state';

// ─── LLM ─────────────────────────────────────────────────

const llm = new ChatAnthropic({
  model: 'claude-sonnet-4-6',
  temperature: 0,
  maxTokens: 4096,
});

// ─── Supervisor Node ─────────────────────────────────────

const SUPERVISOR_SYSTEM = `You are the PinhoOps AI Supervisor for Pinho Law (Orlando, FL).
You receive WhatsApp messages and route them to the correct specialist agent.

ROUTING RULES:
- Task/matter status, lifecycle, daily briefing → masterOperations
- Calendar, scheduling, availability, execution blocks → scheduleProtection
- Assignment, workload, escalation → taskDelegation
- Time entry, billing, who owes, follow-up → billingCapture
- New leads, intake, pipeline, consultation → salesPipeline

Respond with ONLY the agent name. Nothing else.
Valid agents: masterOperations, scheduleProtection, taskDelegation, billingCapture, salesPipeline`;

export async function supervisorNode(state: PinhoOpsStateType) {
  const msg = state.input;

  try {
    const response = await llm.invoke([
      new SystemMessage(SUPERVISOR_SYSTEM),
      new HumanMessage(`Route this WhatsApp message:\n\nFrom: ${msg.sender_name} (${msg.sender_phone})\nMessage: ${msg.message_text}`),
    ]);

    const content = typeof response.content === 'string' ? response.content : '';
    const agentName = content.trim().toLowerCase();

    const validAgents = ['masteroperations', 'scheduleprotection', 'taskdelegation', 'billingcapture', 'salespipeline'];
    const matched = validAgents.find(a => agentName.includes(a.toLowerCase()));

    return { next_agent: matched || 'masteroperations' };
  } catch (err: any) {
    console.error('[Supervisor] Error:', err.message);
    return { next_agent: 'masteroperations', error: err.message };
  }
}

// ─── Agent Node Factory ──────────────────────────────────

function createAgentNode(config: {
  name: string;
  sopRef: string;
  systemPrompt: string;
  stateFiles: string[];
}) {
  return async function agentNode(state: PinhoOpsStateType) {
    const start = Date.now();
    const steps: Array<{ ts: string; msg: string }> = [];
    const log = (msg: string) => steps.push({ ts: new Date().toISOString(), msg });

    try {
      log(`${config.name} activated`);

      // Load required state
      const stateData: Record<string, any> = {};
      for (const file of config.stateFiles) {
        try {
          const { data } = await readState(file as any);
          stateData[file] = data;
          log(`Loaded ${file}`);
        } catch (err: any) {
          log(`Failed to load ${file}: ${err.message}`);
        }
      }

      // Build context for the LLM
      const stateContext = Object.entries(stateData)
        .map(([file, data]) => `--- ${file} ---\n${JSON.stringify(data, null, 2)}`)
        .join('\n\n');

      const response = await llm.invoke([
        new SystemMessage(config.systemPrompt),
        new HumanMessage(
          `Current state:\n${stateContext}\n\n` +
          `WhatsApp message from ${state.input.sender_name} (${state.input.sender_phone}):\n` +
          `${state.input.message_text}\n\n` +
          `${state.input.context_matter_id ? `Context matter: ${state.input.context_matter_id}` : ''}\n\n` +
          `Provide your response as a WhatsApp-formatted message. If state changes are needed, describe them.`
        ),
      ]);

      const reply = typeof response.content === 'string' ? response.content : '';
      log('Generated response');

      // Check for human-in-the-loop triggers
      let humanApproval = null;
      if (config.name === 'BillingCaptureAgent' && /approv|sync.*clio/i.test(state.input.message_text)) {
        humanApproval = {
          required: true,
          reason: 'Billing approval required before syncing to Clio',
          action_description: `Sync billing entries for matter to Clio`,
          approved: undefined,
        };
        log('Human-in-the-loop: billing approval required');
      }
      if (/critical|emergency|urgent/i.test(reply)) {
        humanApproval = {
          required: true,
          reason: 'High-risk escalation detected',
          action_description: reply.substring(0, 200),
          approved: undefined,
        };
        log('Human-in-the-loop: high-risk escalation');
      }

      return {
        reply,
        agent_results: [{
          agent: config.name,
          reply,
          state_updated: false,
          files_changed: [],
          audit: {
            started_at: new Date(start).toISOString(),
            duration_ms: Date.now() - start,
            steps,
          },
        }],
        human_approval: humanApproval,
        // Pass through loaded state
        ...(stateData[STATE_FILES.tasks] ? { tasks: stateData[STATE_FILES.tasks] } : {}),
        ...(stateData[STATE_FILES.billing] ? { billing: stateData[STATE_FILES.billing] } : {}),
        ...(stateData[STATE_FILES.sales] ? { sales: stateData[STATE_FILES.sales] } : {}),
        ...(stateData[STATE_FILES.promises] ? { promises: stateData[STATE_FILES.promises] } : {}),
        ...(stateData[STATE_FILES.kpi] ? { kpi: stateData[STATE_FILES.kpi] } : {}),
      };
    } catch (err: any) {
      log(`ERROR: ${err.message}`);
      return {
        reply: `${config.name} error: ${err.message}. Please try again.`,
        error: err.message,
        agent_results: [{
          agent: config.name,
          reply: '',
          state_updated: false,
          files_changed: [],
          audit: { started_at: new Date(start).toISOString(), duration_ms: Date.now() - start, steps },
        }],
      };
    }
  };
}

// ─── Agent Nodes ─────────────────────────────────────────

export const masterOperationsNode = createAgentNode({
  name: 'MasterOperationsAgent',
  sopRef: '§4.1, §9.2',
  stateFiles: [STATE_FILES.tasks, STATE_FILES.promises],
  systemPrompt: `You are the Master Operations Agent for Pinho Law (SOP §4.1, §9.2).
You manage matter lifecycle: Open → Active → Pending Client → Pending Court → Closing → Archived.

CRITICAL RULE: Every matter MUST have a next_action AND a deadline. Never allow a matter without both.

You handle:
- Matter status queries and updates
- Daily briefings and operational summaries
- Risk assessment (Normal/Elevated/Critical)
- 7-day communication SLA enforcement (§6.1)

Respond in WhatsApp format. Use *bold* for headers. Keep responses concise.
If updating status, always confirm: new status, next_action, and deadline.
If next_action or deadline is missing, REFUSE the update and ask for both.`,
});

export const scheduleProtectionNode = createAgentNode({
  name: 'ScheduleProtectionAgent',
  sopRef: '§6, §10.5',
  stateFiles: [STATE_FILES.kpi, STATE_FILES.tasks],
  systemPrompt: `You are the Schedule Protection Agent for Pinho Law (SOP §6, §10.5).
You protect execution blocks (9 AM - 12 PM daily) and manage calendar compliance.

CRITICAL RULE: Execution blocks (9:00-12:00) are SACRED. Never allow scheduling over them.

You handle:
- Availability checks
- Meeting scheduling (only outside protected hours)
- Calendar health reports
- Upcoming deadline summaries
- Execution block tracking (min 5/week)

Respond in WhatsApp format. Always warn if someone tries to schedule during execution hours.
Suggest alternative times when blocking a request.`,
});

export const taskDelegationNode = createAgentNode({
  name: 'TaskDelegationAgent',
  sopRef: '§3, §5, §9.5',
  stateFiles: [STATE_FILES.tasks],
  systemPrompt: `You are the Task Delegation Agent for Pinho Law (SOP §3, §5, §9.5).
You manage task assignment, workload balancing, and the escalation ladder.

TEAM ROSTER:
- Guillerme (Attorney, max 25 matters, Litigation/Corporate)
- Inez (Paralegal, max 30 matters, Immigration/Family)
- Daniel (Attorney, max 25 matters, Immigration/Real Estate)
- Mariana (Paralegal, max 30 matters, Litigation/Criminal)

ESCALATION LADDER (§9.5):
- Level 1: 48h before deadline → notify assigned person
- Level 2: 24h before deadline → notify lead attorney
- Level 3: Deadline missed → notify managing partner (Guillerme)
- Level 4: 72h past deadline → emergency all-partner alert

You handle:
- Task assignment/reassignment
- Workload reports
- Escalation checks and triggers
- Capacity management

Respond in WhatsApp format. Always check capacity before assigning.`,
});

export const billingCaptureNode = createAgentNode({
  name: 'BillingCaptureAgent',
  sopRef: '§8, §9.1',
  stateFiles: [STATE_FILES.billing, STATE_FILES.tasks],
  systemPrompt: `You are the Billing Capture Agent for Pinho Law (SOP §8, §9.1).
You handle time entries, billing inquiries, and payment follow-ups.

CRITICAL RULE: Time entries must be logged within 24 hours (§9.1).

You handle:
- Time entry logging (format: "log Xh on MATTER-ID: description")
- Who owes money queries
- Billing follow-up prompt generation (in Brazilian Portuguese per wa-update.txt)
- Billing summaries
- 24h compliance checks

For billing follow-ups, generate the EXACT WhatsApp prompt text in Brazilian Portuguese:
- Professional but warm tone
- Address by first name
- Diplomatic mention of balance
- Sign off as "Equipe PinhoLaw"
- Under 500 characters

HUMAN-IN-THE-LOOP: Flag for approval before syncing entries to Clio.
Respond in WhatsApp format.`,
});

export const salesPipelineNode = createAgentNode({
  name: 'SalesPipelineAgent',
  sopRef: '§2, §6.2',
  stateFiles: [STATE_FILES.sales],
  systemPrompt: `You are the Sales Pipeline Agent for Pinho Law (SOP §2, §6.2).
You manage client intake from lead capture through matter opening.

PIPELINE STAGES: New Lead → Contacted → Consultation Scheduled → Consultation Completed →
Proposal Sent → Engagement Signed → Conflict Check → Opened in Clio

CRITICAL RULES:
- §2.4: Conflict check MUST be cleared before engagement signing
- §9.2: Every lead must have next_action + deadline
- §6.2: Bi-weekly pipeline prep summaries

You handle:
- Adding new leads
- Advancing leads through stages
- Conflict check management
- Pipeline reports
- Bi-weekly prep summaries

Respond in WhatsApp format. Block engagement without cleared conflicts.`,
});
