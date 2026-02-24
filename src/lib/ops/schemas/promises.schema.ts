/**
 * promises.json Schema — Maps to Pinho Law SOP v1.0
 *
 * §6 Client Communication & Promises
 * §6.1 Communication Cadence (7-day max gap)
 * §6.2 WhatsApp Update Protocol
 * §6.3 Promise Tracking (anything told to client = tracked commitment)
 * §6.4 Escalation when promise is at risk
 *
 * A "promise" is any commitment made to a client during communication.
 */

// ─── Types ───────────────────────────────────────────────

export interface Promise {
  /** Unique promise ID */
  id: string;
  /** Clio matter number — FK to tasks.json */
  clio_matter_id: string;
  /** Client name */
  client: string;
  /** SOP §6.3: Exact text of what was promised */
  promise_text: string;
  /** SOP §6.3: Who made the promise */
  promised_by: string;
  /** ISO 8601: When the promise was made */
  promised_on: string;
  /** ISO 8601: When it's due */
  due_date: string;
  /** SOP §6.3: Open | Fulfilled | Broken | Extended */
  status: PromiseStatus;
  /** SOP §6.4: How the promise was fulfilled (empty if not yet) */
  fulfillment_note: string;
  /** ISO 8601: When fulfilled (null if open) */
  fulfilled_at: string | null;
  /** SOP §6.1: Communication channel used */
  channel: CommunicationChannel;
  /** SOP §6.4: Whether this is at risk of being missed */
  at_risk: boolean;
  /** SOP §6.4: Escalation sent? */
  escalation_sent: boolean;
  /** Who was notified about the risk */
  escalated_to: string;
  /** REQUIRED: next action to fulfill/close the promise */
  next_action: string;
  /** REQUIRED: deadline for next_action */
  deadline: string;
  /** Free-text notes */
  notes: string;
}

export type PromiseStatus =
  | 'Open'
  | 'Fulfilled'
  | 'Broken'
  | 'Extended';

export type CommunicationChannel =
  | 'WhatsApp'
  | 'Email'
  | 'Phone'
  | 'In-Person'
  | 'Video Call';

// ─── Full JSON Document ──────────────────────────────────

export interface PromisesDocument {
  last_updated: string;
  version: '1.0';
  sop_version: 'PinhoLaw SOP v1.0';
  summary: {
    total_open: number;
    total_fulfilled: number;
    total_broken: number;
    total_at_risk: number;
    fulfillment_rate: number;
  };
  promises: Promise[];
}

// ─── JSON Schema ─────────────────────────────────────────

export const PROMISES_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'PinhoLaw Promise Tracker',
  description: 'Maps to SOP v1.0 §6 Client Communication & Promises',
  type: 'object',
  required: ['last_updated', 'version', 'sop_version', 'summary', 'promises'],
  properties: {
    last_updated: { type: 'string', format: 'date-time' },
    version: { type: 'string', const: '1.0' },
    sop_version: { type: 'string', const: 'PinhoLaw SOP v1.0' },
    summary: {
      type: 'object',
      required: ['total_open', 'total_fulfilled', 'total_broken', 'total_at_risk', 'fulfillment_rate'],
      properties: {
        total_open: { type: 'integer', minimum: 0 },
        total_fulfilled: { type: 'integer', minimum: 0 },
        total_broken: { type: 'integer', minimum: 0 },
        total_at_risk: { type: 'integer', minimum: 0 },
        fulfillment_rate: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    promises: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id', 'clio_matter_id', 'client', 'promise_text', 'promised_by',
          'promised_on', 'due_date', 'status', 'channel', 'at_risk',
          'next_action', 'deadline',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          clio_matter_id: { type: 'string' },
          client: { type: 'string' },
          promise_text: { type: 'string', minLength: 1 },
          promised_by: { type: 'string' },
          promised_on: { type: 'string', format: 'date' },
          due_date: { type: 'string', format: 'date' },
          status: { type: 'string', enum: ['Open', 'Fulfilled', 'Broken', 'Extended'] },
          fulfillment_note: { type: 'string' },
          fulfilled_at: { type: ['string', 'null'] },
          channel: { type: 'string', enum: ['WhatsApp', 'Email', 'Phone', 'In-Person', 'Video Call'] },
          at_risk: { type: 'boolean' },
          escalation_sent: { type: 'boolean' },
          escalated_to: { type: 'string' },
          next_action: { type: 'string', minLength: 1 },
          deadline: { type: 'string', format: 'date' },
          notes: { type: 'string' },
        },
      },
    },
  },
} as const;

export function createEmptyPromisesDocument(): PromisesDocument {
  return {
    last_updated: new Date().toISOString(),
    version: '1.0',
    sop_version: 'PinhoLaw SOP v1.0',
    summary: {
      total_open: 0,
      total_fulfilled: 0,
      total_broken: 0,
      total_at_risk: 0,
      fulfillment_rate: 1,
    },
    promises: [],
  };
}
