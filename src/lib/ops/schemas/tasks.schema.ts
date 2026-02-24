/**
 * tasks.json Schema — Maps to Pinho Law SOP v1.0
 *
 * §3 Daily Operations / Task Management
 * §4 Matter Lifecycle (Open → Active → Closing → Archived)
 * §5 Delegation & Accountability
 * §9 Deadlines & Calendar Compliance
 *
 * Every task MUST have next_action + deadline (SOP §9.2 enforcement).
 */

// ─── Types ───────────────────────────────────────────────

export interface Task {
  /** Unique task identifier */
  id: string;
  /** Clio matter number (e.g., "TEMP-LIT-001") — links to billing_ledger */
  clio_matter_id: string;
  /** Client full name */
  client: string;
  /** Matter display name */
  matter_name: string;
  /** Legal area: Immigration | Litigation | Corporate | Family | Real Estate */
  matter_type: MatterType;
  /** SOP §4: Open | Active | Pending Client | Pending Court | Closing | Archived */
  status: TaskStatus;
  /** SOP §9.2: REQUIRED — what happens next */
  next_action: string;
  /** SOP §9.2: REQUIRED — ISO 8601 date for next_action */
  deadline: string;
  /** SOP §5.1: Lead attorney responsible */
  lead_attorney: string;
  /** SOP §5.2: Paralegal assigned */
  paralegal: string;
  /** SOP §5.3: Who owns the next_action */
  assigned_to: string;
  /** SOP §9.1: Normal | Elevated | Critical */
  risk_level: RiskLevel;
  /** SOP §3.1: Current phase description */
  current_phase: string;
  /** SOP references (e.g., "§4.1 §9.2") */
  sop_ref: string;
  /** Last action taken (free text) */
  last_action: string;
  /** ISO 8601 date of last action */
  last_action_date: string;
  /** SOP §6: Days since last client communication */
  days_since_contact: number;
  /** SOP §6.2: WhatsApp phone (E.164) */
  whatsapp_phone: string;
  /** SOP §7: Internal notes (never shared with client) */
  internal_notes: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last-modified timestamp */
  updated_at: string;
}

export type MatterType =
  | 'Immigration'
  | 'Litigation'
  | 'Corporate'
  | 'Family'
  | 'Real Estate'
  | 'Criminal'
  | 'Other';

export type TaskStatus =
  | 'Open'
  | 'Active'
  | 'Pending Client'
  | 'Pending Court'
  | 'Closing'
  | 'Archived';

export type RiskLevel = 'Normal' | 'Elevated' | 'Critical';

// ─── Full JSON Document ──────────────────────────────────

export interface TasksDocument {
  /** ISO 8601 timestamp of last update */
  last_updated: string;
  /** Schema version */
  version: '1.0';
  /** SOP reference */
  sop_version: 'PinhoLaw SOP v1.0';
  /** All active tasks/matters */
  matters: Task[];
}

// ─── JSON Schema (for runtime validation) ─────────────────

export const TASKS_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'PinhoLaw Tasks State',
  description: 'Maps to SOP v1.0 §3-§5, §9',
  type: 'object',
  required: ['last_updated', 'version', 'sop_version', 'matters'],
  properties: {
    last_updated: { type: 'string', format: 'date-time' },
    version: { type: 'string', const: '1.0' },
    sop_version: { type: 'string', const: 'PinhoLaw SOP v1.0' },
    matters: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id', 'clio_matter_id', 'client', 'matter_name', 'matter_type',
          'status', 'next_action', 'deadline', 'lead_attorney', 'paralegal',
          'assigned_to', 'risk_level', 'sop_ref', 'last_action_date',
          'days_since_contact', 'created_at', 'updated_at',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          clio_matter_id: { type: 'string', minLength: 1 },
          client: { type: 'string', minLength: 1 },
          matter_name: { type: 'string' },
          matter_type: {
            type: 'string',
            enum: ['Immigration', 'Litigation', 'Corporate', 'Family', 'Real Estate', 'Criminal', 'Other'],
          },
          status: {
            type: 'string',
            enum: ['Open', 'Active', 'Pending Client', 'Pending Court', 'Closing', 'Archived'],
          },
          next_action: { type: 'string', minLength: 1 },
          deadline: { type: 'string', format: 'date' },
          lead_attorney: { type: 'string', minLength: 1 },
          paralegal: { type: 'string' },
          assigned_to: { type: 'string', minLength: 1 },
          risk_level: { type: 'string', enum: ['Normal', 'Elevated', 'Critical'] },
          current_phase: { type: 'string' },
          sop_ref: { type: 'string' },
          last_action: { type: 'string' },
          last_action_date: { type: 'string', format: 'date' },
          days_since_contact: { type: 'integer', minimum: 0 },
          whatsapp_phone: { type: 'string' },
          internal_notes: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
} as const;

/** Empty document factory */
export function createEmptyTasksDocument(): TasksDocument {
  return {
    last_updated: new Date().toISOString(),
    version: '1.0',
    sop_version: 'PinhoLaw SOP v1.0',
    matters: [],
  };
}
