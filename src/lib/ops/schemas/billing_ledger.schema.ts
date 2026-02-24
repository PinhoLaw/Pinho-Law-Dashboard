/**
 * billing_ledger.json Schema — Maps to Pinho Law SOP v1.0
 *
 * §8 Billing & Collections
 * §8.1 Time Entry Requirements
 * §8.2 Invoice Generation & Approval
 * §8.3 Outstanding Balance Follow-up
 * §8.4 Payment Recording
 *
 * Linked to Clio via clio_matter_id.
 */

// ─── Types ───────────────────────────────────────────────

export interface TimeEntry {
  /** Unique entry ID */
  id: string;
  /** ISO 8601 date of work */
  date: string;
  /** Who performed the work */
  attorney: string;
  /** Hours worked (decimal) */
  hours: number;
  /** Billing rate ($/hr) */
  rate: number;
  /** hours × rate */
  amount: number;
  /** SOP §8.1: Billable | Non-Billable | Flat Fee */
  type: 'Billable' | 'Non-Billable' | 'Flat Fee';
  /** Description of work performed */
  description: string;
  /** SOP §8.2: Draft | Pending Approval | Approved | Synced to Clio */
  approval_status: ApprovalStatus;
  /** Who approved (empty if pending) */
  approved_by: string;
  /** ISO 8601 approval timestamp */
  approved_at: string;
  /** Clio time entry ID (null until synced) */
  clio_time_entry_id: string | null;
}

export type ApprovalStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Synced to Clio';

export interface Payment {
  /** Unique payment ID */
  id: string;
  /** ISO 8601 payment date */
  date: string;
  /** Payment amount */
  amount: number;
  /** SOP §8.4: Check | Wire | Credit Card | Cash | Trust */
  method: PaymentMethod;
  /** Reference number */
  reference: string;
  /** Any notes */
  notes: string;
}

export type PaymentMethod =
  | 'Check'
  | 'Wire'
  | 'Credit Card'
  | 'Cash'
  | 'Trust';

export interface BillingMatter {
  /** Clio matter number — foreign key to tasks.json */
  clio_matter_id: string;
  /** Client name */
  client: string;
  /** Matter display name */
  matter_name: string;
  /** Responsible attorney */
  responsible_attorney: string;
  /** SOP §8: Hourly | Flat Fee | Contingency | Hybrid */
  billing_type: BillingType;
  /** Clio contract ID */
  contrato_clio: string;
  /** Total amount paid to date */
  total_paid: number;
  /** Total amount outstanding */
  total_outstanding: number;
  /** Total billable hours */
  total_billable_hours: number;
  /** Total non-billable hours */
  total_nonbillable_hours: number;
  /** SOP §8.3: Days since last payment or follow-up */
  days_since_payment: number;
  /** SOP §8.3: Whether follow-up is needed */
  followup_needed: boolean;
  /** SOP §8.3: Prompt text for billing follow-up WA message */
  followup_prompt: string;
  /** Individual time entries */
  time_entries: TimeEntry[];
  /** Payment history */
  payments: Payment[];
}

export type BillingType =
  | 'Hourly'
  | 'Flat Fee'
  | 'Contingency'
  | 'Hybrid';

// ─── Full JSON Document ──────────────────────────────────

export interface BillingLedgerDocument {
  last_updated: string;
  version: '1.0';
  sop_version: 'PinhoLaw SOP v1.0';
  /** Aggregate totals */
  summary: {
    total_outstanding: number;
    total_paid: number;
    total_billable_hours: number;
    clients_with_balance: number;
    total_matters: number;
  };
  /** Per-matter billing records */
  matters: BillingMatter[];
}

// ─── JSON Schema ─────────────────────────────────────────

export const BILLING_LEDGER_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'PinhoLaw Billing Ledger',
  description: 'Maps to SOP v1.0 §8',
  type: 'object',
  required: ['last_updated', 'version', 'sop_version', 'summary', 'matters'],
  properties: {
    last_updated: { type: 'string', format: 'date-time' },
    version: { type: 'string', const: '1.0' },
    sop_version: { type: 'string', const: 'PinhoLaw SOP v1.0' },
    summary: {
      type: 'object',
      required: ['total_outstanding', 'total_paid', 'total_billable_hours', 'clients_with_balance', 'total_matters'],
      properties: {
        total_outstanding: { type: 'number', minimum: 0 },
        total_paid: { type: 'number', minimum: 0 },
        total_billable_hours: { type: 'number', minimum: 0 },
        clients_with_balance: { type: 'integer', minimum: 0 },
        total_matters: { type: 'integer', minimum: 0 },
      },
    },
    matters: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'clio_matter_id', 'client', 'matter_name', 'responsible_attorney',
          'billing_type', 'total_paid', 'total_outstanding',
          'total_billable_hours', 'total_nonbillable_hours',
          'followup_needed', 'time_entries', 'payments',
        ],
        properties: {
          clio_matter_id: { type: 'string', minLength: 1 },
          client: { type: 'string' },
          matter_name: { type: 'string' },
          responsible_attorney: { type: 'string' },
          billing_type: { type: 'string', enum: ['Hourly', 'Flat Fee', 'Contingency', 'Hybrid'] },
          contrato_clio: { type: 'string' },
          total_paid: { type: 'number' },
          total_outstanding: { type: 'number' },
          total_billable_hours: { type: 'number' },
          total_nonbillable_hours: { type: 'number' },
          days_since_payment: { type: 'integer', minimum: 0 },
          followup_needed: { type: 'boolean' },
          followup_prompt: { type: 'string' },
          time_entries: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'date', 'attorney', 'hours', 'rate', 'amount', 'type', 'description', 'approval_status'],
              properties: {
                id: { type: 'string' },
                date: { type: 'string', format: 'date' },
                attorney: { type: 'string' },
                hours: { type: 'number', minimum: 0 },
                rate: { type: 'number', minimum: 0 },
                amount: { type: 'number', minimum: 0 },
                type: { type: 'string', enum: ['Billable', 'Non-Billable', 'Flat Fee'] },
                description: { type: 'string' },
                approval_status: { type: 'string', enum: ['Draft', 'Pending Approval', 'Approved', 'Synced to Clio'] },
                approved_by: { type: 'string' },
                approved_at: { type: 'string' },
                clio_time_entry_id: { type: ['string', 'null'] },
              },
            },
          },
          payments: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'date', 'amount', 'method'],
              properties: {
                id: { type: 'string' },
                date: { type: 'string', format: 'date' },
                amount: { type: 'number' },
                method: { type: 'string', enum: ['Check', 'Wire', 'Credit Card', 'Cash', 'Trust'] },
                reference: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function createEmptyBillingLedger(): BillingLedgerDocument {
  return {
    last_updated: new Date().toISOString(),
    version: '1.0',
    sop_version: 'PinhoLaw SOP v1.0',
    summary: {
      total_outstanding: 0,
      total_paid: 0,
      total_billable_hours: 0,
      clients_with_balance: 0,
      total_matters: 0,
    },
    matters: [],
  };
}
