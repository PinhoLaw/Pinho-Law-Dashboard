/**
 * sales_pipeline.json Schema — Maps to Pinho Law SOP v1.0
 *
 * §2 Client Intake & Onboarding
 * §2.1 Lead Capture
 * §2.2 Consultation Scheduling
 * §2.3 Engagement Letter / Retainer
 * §2.4 Conflict Check
 * §2.5 Matter Opening in Clio
 */

// ─── Types ───────────────────────────────────────────────

export interface Lead {
  /** Unique lead ID */
  id: string;
  /** Full name */
  name: string;
  /** Email address */
  email: string;
  /** Phone (E.164 format) */
  phone: string;
  /** WhatsApp phone if different */
  whatsapp_phone: string;
  /** SOP §2.1: How they found us */
  source: LeadSource;
  /** SOP §2.1: Immigration | Litigation | Corporate | Family | Real Estate | Other */
  practice_area: string;
  /** SOP §2.2: Pipeline stage */
  stage: PipelineStage;
  /** SOP §2.4: Pending | Cleared | Conflict Found */
  conflict_check: ConflictStatus;
  /** Attorney assigned to intake */
  assigned_attorney: string;
  /** Paralegal handling intake */
  assigned_paralegal: string;
  /** REQUIRED: next action to advance the lead */
  next_action: string;
  /** REQUIRED: ISO 8601 deadline for next_action */
  deadline: string;
  /** ISO 8601: Consultation date/time (null if not yet scheduled) */
  consultation_date: string | null;
  /** Consultation type: In-Person | Video | Phone */
  consultation_type: ConsultationType | null;
  /** Estimated matter value */
  estimated_value: number;
  /** SOP §2.3: Retainer amount if applicable */
  retainer_amount: number;
  /** Whether engagement letter has been signed */
  engagement_signed: boolean;
  /** Clio matter ID once created (null during intake) */
  clio_matter_id: string | null;
  /** SOP reference */
  sop_ref: string;
  /** Free-text notes */
  notes: string;
  /** ISO 8601 first contact */
  created_at: string;
  /** ISO 8601 last update */
  updated_at: string;
  /** Referral source name (if applicable) */
  referred_by: string;
}

export type LeadSource =
  | 'Website'
  | 'Referral'
  | 'Walk-in'
  | 'Phone Call'
  | 'WhatsApp'
  | 'Social Media'
  | 'Google Ads'
  | 'Other';

export type PipelineStage =
  | 'New Lead'
  | 'Contacted'
  | 'Consultation Scheduled'
  | 'Consultation Completed'
  | 'Proposal Sent'
  | 'Engagement Signed'
  | 'Conflict Check'
  | 'Opened in Clio'
  | 'Lost'
  | 'Disqualified';

export type ConflictStatus =
  | 'Pending'
  | 'Cleared'
  | 'Conflict Found';

export type ConsultationType =
  | 'In-Person'
  | 'Video'
  | 'Phone';

// ─── Full JSON Document ──────────────────────────────────

export interface SalesPipelineDocument {
  last_updated: string;
  version: '1.0';
  sop_version: 'PinhoLaw SOP v1.0';
  summary: {
    total_leads: number;
    leads_by_stage: Record<PipelineStage, number>;
    total_estimated_value: number;
    conversion_rate: number;
  };
  leads: Lead[];
}

// ─── JSON Schema ─────────────────────────────────────────

export const SALES_PIPELINE_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'PinhoLaw Sales Pipeline',
  description: 'Maps to SOP v1.0 §2 Client Intake & Onboarding',
  type: 'object',
  required: ['last_updated', 'version', 'sop_version', 'summary', 'leads'],
  properties: {
    last_updated: { type: 'string', format: 'date-time' },
    version: { type: 'string', const: '1.0' },
    sop_version: { type: 'string', const: 'PinhoLaw SOP v1.0' },
    summary: {
      type: 'object',
      required: ['total_leads', 'leads_by_stage', 'total_estimated_value', 'conversion_rate'],
      properties: {
        total_leads: { type: 'integer', minimum: 0 },
        leads_by_stage: { type: 'object' },
        total_estimated_value: { type: 'number', minimum: 0 },
        conversion_rate: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    leads: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id', 'name', 'phone', 'source', 'practice_area', 'stage',
          'conflict_check', 'assigned_attorney', 'next_action', 'deadline',
          'created_at', 'updated_at',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          email: { type: 'string' },
          phone: { type: 'string' },
          whatsapp_phone: { type: 'string' },
          source: {
            type: 'string',
            enum: ['Website', 'Referral', 'Walk-in', 'Phone Call', 'WhatsApp', 'Social Media', 'Google Ads', 'Other'],
          },
          practice_area: { type: 'string' },
          stage: {
            type: 'string',
            enum: [
              'New Lead', 'Contacted', 'Consultation Scheduled', 'Consultation Completed',
              'Proposal Sent', 'Engagement Signed', 'Conflict Check', 'Opened in Clio',
              'Lost', 'Disqualified',
            ],
          },
          conflict_check: { type: 'string', enum: ['Pending', 'Cleared', 'Conflict Found'] },
          assigned_attorney: { type: 'string' },
          assigned_paralegal: { type: 'string' },
          next_action: { type: 'string', minLength: 1 },
          deadline: { type: 'string', format: 'date' },
          consultation_date: { type: ['string', 'null'] },
          consultation_type: { type: ['string', 'null'], enum: ['In-Person', 'Video', 'Phone', null] },
          estimated_value: { type: 'number', minimum: 0 },
          retainer_amount: { type: 'number', minimum: 0 },
          engagement_signed: { type: 'boolean' },
          clio_matter_id: { type: ['string', 'null'] },
          sop_ref: { type: 'string' },
          notes: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          referred_by: { type: 'string' },
        },
      },
    },
  },
} as const;

export function createEmptySalesPipeline(): SalesPipelineDocument {
  return {
    last_updated: new Date().toISOString(),
    version: '1.0',
    sop_version: 'PinhoLaw SOP v1.0',
    summary: {
      total_leads: 0,
      leads_by_stage: {
        'New Lead': 0, 'Contacted': 0, 'Consultation Scheduled': 0,
        'Consultation Completed': 0, 'Proposal Sent': 0, 'Engagement Signed': 0,
        'Conflict Check': 0, 'Opened in Clio': 0, 'Lost': 0, 'Disqualified': 0,
      },
      total_estimated_value: 0,
      conversion_rate: 0,
    },
    leads: [],
  };
}
