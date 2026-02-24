/**
 * PinhoOps AI v1.0 — LangGraph Definition
 *
 * Supervisor + 5 specialized agents with:
 *   - Custom GitHub checkpoint saver
 *   - Human-in-the-loop for billing + escalations
 *   - Full audit logging
 */

import { StateGraph, END } from '@langchain/langgraph';
import { PinhoOpsState } from '@/lib/ops/pinhoops/state';
import { GitHubCheckpointSaver } from '@/lib/ops/pinhoops/checkpoint-saver';
import {
  supervisorNode,
  masterOperationsNode,
  scheduleProtectionNode,
  taskDelegationNode,
  billingCaptureNode,
  salesPipelineNode,
} from '@/lib/ops/pinhoops/agents';

// ─── Router Function ─────────────────────────────────────

function routeAfterSupervisor(state: typeof PinhoOpsState.State): string {
  const agent = state.next_agent?.toLowerCase() || 'masteroperations';

  const routeMap: Record<string, string> = {
    masteroperations: 'masterOperations',
    scheduleprotection: 'scheduleProtection',
    taskdelegation: 'taskDelegation',
    billingcapture: 'billingCapture',
    salespipeline: 'salesPipeline',
  };

  return routeMap[agent] || 'masterOperations';
}

function routeAfterAgent(state: typeof PinhoOpsState.State): string {
  // Check if human approval is needed
  if (state.human_approval?.required && state.human_approval.approved === undefined) {
    return 'humanReview';
  }
  return END;
}

// ─── Human Review Node ───────────────────────────────────

async function humanReviewNode(state: typeof PinhoOpsState.State) {
  // In production, this would pause and wait for human input.
  // For now, we append the approval requirement to the reply.
  const approval = state.human_approval;
  if (!approval) return {};

  const updatedReply =
    state.reply +
    `\n\n---\n` +
    `*Requires Approval*\n` +
    `Reason: ${approval.reason}\n` +
    `Action: ${approval.action_description}\n\n` +
    `Reply "APPROVE" or "DENY" to proceed.`;

  return { reply: updatedReply };
}

// ─── Build Graph ─────────────────────────────────────────

export function buildPinhoOpsGraph() {
  const checkpointer = new GitHubCheckpointSaver();

  const graph = new StateGraph(PinhoOpsState)
    // Add nodes
    .addNode('supervisor', supervisorNode)
    .addNode('masterOperations', masterOperationsNode)
    .addNode('scheduleProtection', scheduleProtectionNode)
    .addNode('taskDelegation', taskDelegationNode)
    .addNode('billingCapture', billingCaptureNode)
    .addNode('salesPipeline', salesPipelineNode)
    .addNode('humanReview', humanReviewNode)

    // Entry point
    .addEdge('__start__', 'supervisor')

    // Supervisor routes to specialist
    .addConditionalEdges('supervisor', routeAfterSupervisor, {
      masterOperations: 'masterOperations',
      scheduleProtection: 'scheduleProtection',
      taskDelegation: 'taskDelegation',
      billingCapture: 'billingCapture',
      salesPipeline: 'salesPipeline',
    })

    // Each agent can go to humanReview or END
    .addConditionalEdges('masterOperations', routeAfterAgent, { humanReview: 'humanReview', [END]: END })
    .addConditionalEdges('scheduleProtection', routeAfterAgent, { humanReview: 'humanReview', [END]: END })
    .addConditionalEdges('taskDelegation', routeAfterAgent, { humanReview: 'humanReview', [END]: END })
    .addConditionalEdges('billingCapture', routeAfterAgent, { humanReview: 'humanReview', [END]: END })
    .addConditionalEdges('salesPipeline', routeAfterAgent, { humanReview: 'humanReview', [END]: END })

    // Human review always ends
    .addEdge('humanReview', END);

  return graph.compile({ checkpointer });
}

// ─── Convenience Runner ──────────────────────────────────

export async function runPinhoOps(input: {
  sender_phone: string;
  sender_name: string;
  message_text: string;
  timestamp?: string;
  context_matter_id?: string;
}): Promise<{
  reply: string;
  agent_results: any[];
  human_approval: any;
  error: string | null;
}> {
  const graph = buildPinhoOpsGraph();

  const result = await graph.invoke(
    {
      input: {
        sender_phone: input.sender_phone,
        sender_name: input.sender_name,
        message_text: input.message_text,
        timestamp: input.timestamp || new Date().toISOString(),
        context_matter_id: input.context_matter_id,
      },
    },
    {
      configurable: {
        thread_id: `wa-${input.sender_phone}-${Date.now()}`,
      },
    },
  );

  return {
    reply: result.reply || 'No response generated.',
    agent_results: result.agent_results || [],
    human_approval: result.human_approval,
    error: result.error,
  };
}
