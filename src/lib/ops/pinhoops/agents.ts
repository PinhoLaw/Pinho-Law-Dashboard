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
import { SUPERVISOR_PROMPT, AGENT_PROMPTS } from '@/lib/ops/pinhoops/prompts/supervisor';
import { opsLog } from '@/lib/ops/pinhoops/logger';

// ─── LLM ─────────────────────────────────────────────────

const llm = new ChatAnthropic({
  model: 'claude-sonnet-4-20250514',
  temperature: 0,
  maxTokens: 4096,
  topP: undefined,          // Don't send top_p to avoid -1 default
  clientOptions: {},
});

// ─── Supervisor Node ─────────────────────────────────────

export async function supervisorNode(state: PinhoOpsStateType) {
  const msg = state.input;
  const log = opsLog.child('supervisor');

  try {
    log.startTimer('routing');
    log.info('Routing message', {
      sender: msg.sender_name,
      phone: msg.sender_phone,
      message_preview: msg.message_text.substring(0, 80),
    });

    const response = await llm.invoke([
      new SystemMessage(SUPERVISOR_PROMPT),
      new HumanMessage(
        `Route this WhatsApp message:\n\n` +
        `From: ${msg.sender_name} (${msg.sender_phone})\n` +
        `Message: ${msg.message_text}\n` +
        `${msg.context_matter_id ? `Context matter: ${msg.context_matter_id}` : ''}`,
      ),
    ]);

    const content = typeof response.content === 'string' ? response.content : '';
    const agentName = content.trim().toLowerCase();

    const validAgents = ['masteroperations', 'scheduleprotection', 'taskdelegation', 'billingcapture', 'salespipeline'];
    const matched = validAgents.find(a => agentName.includes(a.toLowerCase()));

    const durationMs = log.endTimer('routing');
    log.info('Routed to agent', {
      agent: matched || 'masteroperations',
      raw_response: agentName,
      duration_ms: durationMs,
    });

    return { next_agent: matched || 'masteroperations' };
  } catch (err: any) {
    log.logError('Supervisor routing failed', err);
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
    const step = (msg: string) => steps.push({ ts: new Date().toISOString(), msg });
    const log = opsLog.child(config.name);

    try {
      step(`${config.name} activated`);
      log.info('Agent activated', { sop_ref: config.sopRef });

      // Load required state
      const stateData: Record<string, any> = {};
      for (const file of config.stateFiles) {
        try {
          log.startTimer(`load:${file}`);
          const { data } = await readState(file as any);
          stateData[file] = data;
          const ms = log.endTimer(`load:${file}`);
          step(`Loaded ${file}`);
          log.debug('State loaded', { file, duration_ms: ms });
        } catch (err: any) {
          step(`Failed to load ${file}: ${err.message}`);
          log.warn('State load failed', { file, error: err.message });
        }
      }

      // Build context for the LLM
      const stateContext = Object.entries(stateData)
        .map(([file, data]) => `--- ${file} ---\n${JSON.stringify(data, null, 2)}`)
        .join('\n\n');

      log.startTimer('llm');
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
      const llmMs = log.endTimer('llm');

      const reply = typeof response.content === 'string' ? response.content : '';
      step('Generated response');
      log.info('LLM response generated', { duration_ms: llmMs, reply_length: reply.length });

      // Check for human-in-the-loop triggers
      let humanApproval = null;

      // Billing sync requires approval
      if (config.name === 'BillingCaptureAgent' && /approv|sync.*clio/i.test(state.input.message_text)) {
        humanApproval = {
          required: true,
          reason: 'Billing approval required before syncing to Clio',
          action_description: `Sync billing entries for matter to Clio`,
          approved: undefined,
        };
        step('Human-in-the-loop: billing approval required');
        log.info('Human approval triggered', { trigger: 'billing_sync' });
      }

      // High-risk escalation
      if (/critical|emergency|urgent/i.test(reply)) {
        humanApproval = {
          required: true,
          reason: 'High-risk escalation detected',
          action_description: reply.substring(0, 200),
          approved: undefined,
        };
        step('Human-in-the-loop: high-risk escalation');
        log.info('Human approval triggered', { trigger: 'escalation' });
      }

      // Matter closure requires approval
      if (config.name === 'MasterOperationsAgent' && /clos|archiv|encerr/i.test(state.input.message_text)) {
        humanApproval = {
          required: true,
          reason: 'Matter closure requires managing partner review',
          action_description: reply.substring(0, 200),
          approved: undefined,
        };
        step('Human-in-the-loop: matter closure');
        log.info('Human approval triggered', { trigger: 'matter_closure' });
      }

      // Escalation Level 3+
      if (config.name === 'TaskDelegationAgent' && /missed|level\s*[34]|past\s*deadline/i.test(reply)) {
        humanApproval = {
          required: true,
          reason: 'Escalation Level 3+: missed deadline requires partner review',
          action_description: reply.substring(0, 200),
          approved: undefined,
        };
        step('Human-in-the-loop: escalation Level 3+');
        log.info('Human approval triggered', { trigger: 'escalation_level3' });
      }

      const totalMs = Date.now() - start;
      log.info('Agent completed', { duration_ms: totalMs, human_approval: !!humanApproval });

      return {
        reply,
        agent_results: [{
          agent: config.name,
          reply,
          state_updated: false,
          files_changed: [],
          audit: {
            started_at: new Date(start).toISOString(),
            duration_ms: totalMs,
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
      step(`ERROR: ${err.message}`);
      log.logError('Agent failed', err);
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

// ─── Agent Nodes (using hardened prompts from prompts/supervisor.ts) ──

export const masterOperationsNode = createAgentNode({
  name: 'MasterOperationsAgent',
  sopRef: '§4.1, §9.2',
  stateFiles: [STATE_FILES.tasks, STATE_FILES.promises],
  systemPrompt: AGENT_PROMPTS.masterOperations,
});

export const scheduleProtectionNode = createAgentNode({
  name: 'ScheduleProtectionAgent',
  sopRef: '§6, §10.5',
  stateFiles: [STATE_FILES.kpi, STATE_FILES.tasks],
  systemPrompt: AGENT_PROMPTS.scheduleProtection,
});

export const taskDelegationNode = createAgentNode({
  name: 'TaskDelegationAgent',
  sopRef: '§3, §5, §9.5',
  stateFiles: [STATE_FILES.tasks],
  systemPrompt: AGENT_PROMPTS.taskDelegation,
});

export const billingCaptureNode = createAgentNode({
  name: 'BillingCaptureAgent',
  sopRef: '§8, §9.1',
  stateFiles: [STATE_FILES.billing, STATE_FILES.tasks],
  systemPrompt: AGENT_PROMPTS.billingCapture,
});

export const salesPipelineNode = createAgentNode({
  name: 'SalesPipelineAgent',
  sopRef: '§2, §6.2',
  stateFiles: [STATE_FILES.sales],
  systemPrompt: AGENT_PROMPTS.salesPipeline,
});
