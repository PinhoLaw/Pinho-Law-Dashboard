/**
 * PinhoOps AI v1.0 — LangGraph State Schema
 *
 * Maps 1:1 to GitHub JSON state files:
 *   tasks.json, billing_ledger.json, sales_pipeline.json,
 *   promises.json, kpi_dashboard.json
 */

import { Annotation } from '@langchain/langgraph';
import type { TasksDocument } from '@/lib/ops/schemas/tasks.schema';
import type { BillingLedgerDocument } from '@/lib/ops/schemas/billing_ledger.schema';
import type { SalesPipelineDocument } from '@/lib/ops/schemas/sales_pipeline.schema';
import type { PromisesDocument } from '@/lib/ops/schemas/promises.schema';
import type { KPIDashboardDocument } from '@/lib/ops/schemas/kpi_dashboard.schema';

// ─── WhatsApp Input ──────────────────────────────────────

export interface WhatsAppMessage {
  sender_phone: string;
  sender_name: string;
  message_text: string;
  timestamp: string;
  context_matter_id?: string;
}

// ─── Agent Result ────────────────────────────────────────

export interface AgentResult {
  agent: string;
  reply: string;
  state_updated: boolean;
  files_changed: string[];
  audit: {
    started_at: string;
    duration_ms: number;
    steps: Array<{ ts: string; msg: string }>;
  };
}

// ─── Human-in-the-Loop ──────────────────────────────────

export interface HumanApproval {
  required: boolean;
  reason: string;
  action_description: string;
  approved?: boolean;
  approved_by?: string;
}

// ─── Graph State Annotation ──────────────────────────────

export const PinhoOpsState = Annotation.Root({
  // Input
  input: Annotation<WhatsAppMessage>,

  // Routing
  next_agent: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'supervisor',
  }),

  // State files (1:1 with GitHub JSON)
  tasks: Annotation<TasksDocument | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  billing: Annotation<BillingLedgerDocument | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  sales: Annotation<SalesPipelineDocument | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  promises: Annotation<PromisesDocument | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  kpi: Annotation<KPIDashboardDocument | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Agent results (appended)
  agent_results: Annotation<AgentResult[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Final output
  reply: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  // Human-in-the-loop
  human_approval: Annotation<HumanApproval | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Error tracking
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type PinhoOpsStateType = typeof PinhoOpsState.State;
