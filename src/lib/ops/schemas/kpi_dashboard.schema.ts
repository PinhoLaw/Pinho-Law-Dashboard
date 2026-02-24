/**
 * kpi_dashboard.json Schema — Maps to Pinho Law SOP v1.0
 *
 * §10 KPI & Performance Metrics
 * §10.1 Operational Health
 * §10.2 Financial Health
 * §10.3 Client Satisfaction
 * §10.4 Team Performance
 * §10.5 Calendar Compliance
 *
 * Aggregated from tasks.json, billing_ledger.json, promises.json, sales_pipeline.json
 */

// ─── Types ───────────────────────────────────────────────

export interface OperationalKPIs {
  /** §10.1: Total active matters */
  active_matters: number;
  /** §10.1: Matters with overdue deadlines */
  overdue_matters: number;
  /** §10.1: Overdue / Active */
  overdue_rate: number;
  /** §10.1: Matters at Critical risk */
  critical_risk_count: number;
  /** §10.1: Matters at Elevated risk */
  elevated_risk_count: number;
  /** §10.1: Average days since last action across all matters */
  avg_days_since_action: number;
  /** §10.1: Matters with no action in 7+ days */
  stale_matters: number;
  /** §10.1: Matters opened in current period */
  matters_opened_period: number;
  /** §10.1: Matters closed in current period */
  matters_closed_period: number;
}

export interface FinancialKPIs {
  /** §10.2: Total outstanding across all matters */
  total_outstanding: number;
  /** §10.2: Total collected in current period */
  total_collected_period: number;
  /** §10.2: Total billed in current period */
  total_billed_period: number;
  /** §10.2: collected / billed */
  collection_rate: number;
  /** §10.2: Average outstanding per matter */
  avg_outstanding_per_matter: number;
  /** §10.2: Clients with balance > 30 days */
  aging_30_plus: number;
  /** §10.2: Clients with balance > 60 days */
  aging_60_plus: number;
  /** §10.2: Clients with balance > 90 days */
  aging_90_plus: number;
  /** §10.2: Total billable hours in period */
  billable_hours_period: number;
  /** §10.2: billable / (billable + non-billable) */
  utilization_rate: number;
}

export interface ClientKPIs {
  /** §10.3: Average days between client contacts */
  avg_contact_gap_days: number;
  /** §10.3: Clients contacted within 7-day SLA */
  within_sla_count: number;
  /** §10.3: within_sla / total */
  sla_compliance_rate: number;
  /** §10.3: Open promises */
  open_promises: number;
  /** §10.3: Fulfilled / (Fulfilled + Broken) */
  promise_fulfillment_rate: number;
  /** §10.3: At-risk promises */
  at_risk_promises: number;
  /** §10.3: Messages sent in current period */
  wa_messages_sent_period: number;
}

export interface TeamKPIs {
  /** §10.4: Per-person breakdown */
  members: TeamMemberKPI[];
}

export interface TeamMemberKPI {
  /** Team member name */
  name: string;
  /** Role: Attorney | Paralegal */
  role: 'Attorney' | 'Paralegal';
  /** Matters assigned */
  active_matters: number;
  /** Overdue items assigned to them */
  overdue_items: number;
  /** Billable hours in period */
  billable_hours: number;
  /** Non-billable hours in period */
  nonbillable_hours: number;
  /** Outstanding balance on their matters */
  outstanding_balance: number;
  /** Open promises they own */
  open_promises: number;
}

export interface CalendarKPIs {
  /** §10.5: Protected execution blocks this week */
  execution_blocks_scheduled: number;
  /** §10.5: Blocks completed vs scheduled */
  block_completion_rate: number;
  /** §10.5: Court deadlines in next 7 days */
  court_deadlines_7d: number;
  /** §10.5: Filing deadlines in next 7 days */
  filing_deadlines_7d: number;
  /** §10.5: Client meetings in next 7 days */
  client_meetings_7d: number;
  /** §10.5: Calendar conflicts detected */
  conflicts_detected: number;
}

// ─── Full JSON Document ──────────────────────────────────

export interface KPIDashboardDocument {
  last_updated: string;
  version: '1.0';
  sop_version: 'PinhoLaw SOP v1.0';
  /** ISO 8601 period start */
  period_start: string;
  /** ISO 8601 period end */
  period_end: string;
  operational: OperationalKPIs;
  financial: FinancialKPIs;
  client: ClientKPIs;
  team: TeamKPIs;
  calendar: CalendarKPIs;
}

// ─── JSON Schema ─────────────────────────────────────────

export const KPI_DASHBOARD_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'PinhoLaw KPI Dashboard',
  description: 'Maps to SOP v1.0 §10 KPI & Performance Metrics',
  type: 'object',
  required: ['last_updated', 'version', 'sop_version', 'period_start', 'period_end',
    'operational', 'financial', 'client', 'team', 'calendar'],
  properties: {
    last_updated: { type: 'string', format: 'date-time' },
    version: { type: 'string', const: '1.0' },
    sop_version: { type: 'string', const: 'PinhoLaw SOP v1.0' },
    period_start: { type: 'string', format: 'date' },
    period_end: { type: 'string', format: 'date' },
    operational: {
      type: 'object',
      required: ['active_matters', 'overdue_matters', 'overdue_rate', 'critical_risk_count',
        'elevated_risk_count', 'avg_days_since_action', 'stale_matters'],
      properties: {
        active_matters: { type: 'integer', minimum: 0 },
        overdue_matters: { type: 'integer', minimum: 0 },
        overdue_rate: { type: 'number', minimum: 0, maximum: 1 },
        critical_risk_count: { type: 'integer', minimum: 0 },
        elevated_risk_count: { type: 'integer', minimum: 0 },
        avg_days_since_action: { type: 'number', minimum: 0 },
        stale_matters: { type: 'integer', minimum: 0 },
        matters_opened_period: { type: 'integer', minimum: 0 },
        matters_closed_period: { type: 'integer', minimum: 0 },
      },
    },
    financial: {
      type: 'object',
      required: ['total_outstanding', 'total_collected_period', 'total_billed_period',
        'collection_rate', 'billable_hours_period', 'utilization_rate'],
      properties: {
        total_outstanding: { type: 'number', minimum: 0 },
        total_collected_period: { type: 'number', minimum: 0 },
        total_billed_period: { type: 'number', minimum: 0 },
        collection_rate: { type: 'number', minimum: 0, maximum: 1 },
        avg_outstanding_per_matter: { type: 'number', minimum: 0 },
        aging_30_plus: { type: 'integer', minimum: 0 },
        aging_60_plus: { type: 'integer', minimum: 0 },
        aging_90_plus: { type: 'integer', minimum: 0 },
        billable_hours_period: { type: 'number', minimum: 0 },
        utilization_rate: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    client: {
      type: 'object',
      required: ['avg_contact_gap_days', 'sla_compliance_rate', 'open_promises', 'promise_fulfillment_rate'],
      properties: {
        avg_contact_gap_days: { type: 'number', minimum: 0 },
        within_sla_count: { type: 'integer', minimum: 0 },
        sla_compliance_rate: { type: 'number', minimum: 0, maximum: 1 },
        open_promises: { type: 'integer', minimum: 0 },
        promise_fulfillment_rate: { type: 'number', minimum: 0, maximum: 1 },
        at_risk_promises: { type: 'integer', minimum: 0 },
        wa_messages_sent_period: { type: 'integer', minimum: 0 },
      },
    },
    team: {
      type: 'object',
      required: ['members'],
      properties: {
        members: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'role', 'active_matters', 'overdue_items', 'billable_hours'],
            properties: {
              name: { type: 'string' },
              role: { type: 'string', enum: ['Attorney', 'Paralegal'] },
              active_matters: { type: 'integer', minimum: 0 },
              overdue_items: { type: 'integer', minimum: 0 },
              billable_hours: { type: 'number', minimum: 0 },
              nonbillable_hours: { type: 'number', minimum: 0 },
              outstanding_balance: { type: 'number', minimum: 0 },
              open_promises: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    },
    calendar: {
      type: 'object',
      required: ['execution_blocks_scheduled', 'block_completion_rate', 'court_deadlines_7d'],
      properties: {
        execution_blocks_scheduled: { type: 'integer', minimum: 0 },
        block_completion_rate: { type: 'number', minimum: 0, maximum: 1 },
        court_deadlines_7d: { type: 'integer', minimum: 0 },
        filing_deadlines_7d: { type: 'integer', minimum: 0 },
        client_meetings_7d: { type: 'integer', minimum: 0 },
        conflicts_detected: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;

export function createEmptyKPIDashboard(): KPIDashboardDocument {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return {
    last_updated: now.toISOString(),
    version: '1.0',
    sop_version: 'PinhoLaw SOP v1.0',
    period_start: weekStart.toISOString().split('T')[0],
    period_end: weekEnd.toISOString().split('T')[0],
    operational: {
      active_matters: 0, overdue_matters: 0, overdue_rate: 0,
      critical_risk_count: 0, elevated_risk_count: 0,
      avg_days_since_action: 0, stale_matters: 0,
      matters_opened_period: 0, matters_closed_period: 0,
    },
    financial: {
      total_outstanding: 0, total_collected_period: 0, total_billed_period: 0,
      collection_rate: 0, avg_outstanding_per_matter: 0,
      aging_30_plus: 0, aging_60_plus: 0, aging_90_plus: 0,
      billable_hours_period: 0, utilization_rate: 0,
    },
    client: {
      avg_contact_gap_days: 0, within_sla_count: 0, sla_compliance_rate: 1,
      open_promises: 0, promise_fulfillment_rate: 1,
      at_risk_promises: 0, wa_messages_sent_period: 0,
    },
    team: { members: [] },
    calendar: {
      execution_blocks_scheduled: 0, block_completion_rate: 0,
      court_deadlines_7d: 0, filing_deadlines_7d: 0,
      client_meetings_7d: 0, conflicts_detected: 0,
    },
  };
}
