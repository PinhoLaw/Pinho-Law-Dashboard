/**
 * Validation Functions — Pinho Law SOP v1.0 Enforcement
 *
 * Core rule: Every matter/lead/promise MUST have next_action + deadline (§9.2).
 * Additional validators per schema.
 */

import type { TasksDocument, Task } from '@/lib/ops/schemas/tasks.schema';
import type { BillingLedgerDocument, BillingMatter } from '@/lib/ops/schemas/billing_ledger.schema';
import type { SalesPipelineDocument, Lead } from '@/lib/ops/schemas/sales_pipeline.schema';
import type { PromisesDocument, Promise } from '@/lib/ops/schemas/promises.schema';
import type { KPIDashboardDocument } from '@/lib/ops/schemas/kpi_dashboard.schema';

// ─── Validation Result ──────────────────────────────────

export interface ValidationError {
  file: string;
  record_id: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
  sop_ref: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: string;
}

// ─── Helpers ─────────────────────────────────────────────

function isValidDate(s: string): boolean {
  if (!s) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── §9.2 Core Rule: next_action + deadline ──────────────

function validateNextActionDeadline(
  file: string,
  id: string,
  next_action: string | undefined,
  deadline: string | undefined,
): ValidationError[] {
  const errs: ValidationError[] = [];

  if (!next_action || next_action.trim().length === 0) {
    errs.push({
      file, record_id: id, field: 'next_action',
      message: 'Missing next_action — SOP §9.2 requires every record to have a defined next action.',
      severity: 'error', sop_ref: '§9.2',
    });
  }

  if (!deadline || deadline.trim().length === 0) {
    errs.push({
      file, record_id: id, field: 'deadline',
      message: 'Missing deadline — SOP §9.2 requires every record to have a deadline.',
      severity: 'error', sop_ref: '§9.2',
    });
  } else if (!isValidDate(deadline)) {
    errs.push({
      file, record_id: id, field: 'deadline',
      message: `Invalid deadline format: "${deadline}". Must be ISO 8601 date.`,
      severity: 'error', sop_ref: '§9.2',
    });
  } else if (deadline < today()) {
    errs.push({
      file, record_id: id, field: 'deadline',
      message: `Deadline "${deadline}" is in the past. Review immediately.`,
      severity: 'warning', sop_ref: '§9.2',
    });
  }

  return errs;
}

// ─── Tasks Validation ────────────────────────────────────

export function validateTasks(doc: TasksDocument): ValidationResult {
  const all: ValidationError[] = [];

  if (!doc.matters || !Array.isArray(doc.matters)) {
    all.push({
      file: 'tasks.json', record_id: '_root', field: 'matters',
      message: 'Missing or invalid matters array.', severity: 'error', sop_ref: '§3',
    });
    return buildResult(all);
  }

  for (const m of doc.matters) {
    const id = m.clio_matter_id || m.id || 'UNKNOWN';

    // §9.2: next_action + deadline
    all.push(...validateNextActionDeadline('tasks.json', id, m.next_action, m.deadline));

    // §5.1: lead_attorney required
    if (!m.lead_attorney || m.lead_attorney.trim().length === 0) {
      all.push({
        file: 'tasks.json', record_id: id, field: 'lead_attorney',
        message: 'Missing lead_attorney — SOP §5.1 requires assignment.',
        severity: 'error', sop_ref: '§5.1',
      });
    }

    // §5.3: assigned_to required
    if (!m.assigned_to || m.assigned_to.trim().length === 0) {
      all.push({
        file: 'tasks.json', record_id: id, field: 'assigned_to',
        message: 'Missing assigned_to — SOP §5.3 requires ownership.',
        severity: 'error', sop_ref: '§5.3',
      });
    }

    // §6.1: 7-day communication gap
    if (m.days_since_contact > 7) {
      all.push({
        file: 'tasks.json', record_id: id, field: 'days_since_contact',
        message: `${m.days_since_contact} days since last contact — exceeds 7-day SLA (§6.1).`,
        severity: 'warning', sop_ref: '§6.1',
      });
    }

    // §4: Status validation
    const validStatuses = ['Open', 'Active', 'Pending Client', 'Pending Court', 'Closing', 'Archived'];
    if (m.status && !validStatuses.includes(m.status)) {
      all.push({
        file: 'tasks.json', record_id: id, field: 'status',
        message: `Invalid status "${m.status}". Must be one of: ${validStatuses.join(', ')}.`,
        severity: 'error', sop_ref: '§4',
      });
    }

    // §9.1: Risk escalation check
    if (m.risk_level === 'Critical' && m.status !== 'Archived') {
      all.push({
        file: 'tasks.json', record_id: id, field: 'risk_level',
        message: 'Critical risk matter — requires immediate leadership review.',
        severity: 'warning', sop_ref: '§9.1',
      });
    }
  }

  return buildResult(all);
}

// ─── Billing Ledger Validation ───────────────────────────

export function validateBillingLedger(doc: BillingLedgerDocument): ValidationResult {
  const all: ValidationError[] = [];

  if (!doc.matters || !Array.isArray(doc.matters)) {
    all.push({
      file: 'billing_ledger.json', record_id: '_root', field: 'matters',
      message: 'Missing or invalid matters array.', severity: 'error', sop_ref: '§8',
    });
    return buildResult(all);
  }

  for (const m of doc.matters) {
    const id = m.clio_matter_id || 'UNKNOWN';

    // §8.3: Outstanding balance follow-up
    if (m.total_outstanding > 0 && m.days_since_payment > 30) {
      all.push({
        file: 'billing_ledger.json', record_id: id, field: 'days_since_payment',
        message: `$${m.total_outstanding.toFixed(2)} outstanding for ${m.days_since_payment} days — follow-up required (§8.3).`,
        severity: 'warning', sop_ref: '§8.3',
      });
    }

    if (m.total_outstanding > 0 && m.followup_needed && (!m.followup_prompt || m.followup_prompt.trim().length === 0)) {
      all.push({
        file: 'billing_ledger.json', record_id: id, field: 'followup_prompt',
        message: 'Follow-up needed but no prompt text generated.',
        severity: 'warning', sop_ref: '§8.3',
      });
    }

    // §8.1: Time entries must have descriptions
    for (const te of m.time_entries) {
      if (!te.description || te.description.trim().length === 0) {
        all.push({
          file: 'billing_ledger.json', record_id: `${id}/${te.id}`, field: 'description',
          message: 'Time entry missing description — SOP §8.1 requires detail.',
          severity: 'error', sop_ref: '§8.1',
        });
      }

      // §8.1: Hours sanity check
      if (te.hours > 24) {
        all.push({
          file: 'billing_ledger.json', record_id: `${id}/${te.id}`, field: 'hours',
          message: `${te.hours} hours in single entry — likely data error.`,
          severity: 'error', sop_ref: '§8.1',
        });
      }

      // Amount = hours × rate
      const expected = Math.round(te.hours * te.rate * 100) / 100;
      if (Math.abs(te.amount - expected) > 0.01) {
        all.push({
          file: 'billing_ledger.json', record_id: `${id}/${te.id}`, field: 'amount',
          message: `Amount $${te.amount} doesn't match hours(${te.hours}) × rate($${te.rate}) = $${expected}.`,
          severity: 'error', sop_ref: '§8.1',
        });
      }
    }

    // Summary cross-check
    const calcPaid = m.payments.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(m.total_paid - calcPaid) > 0.01) {
      all.push({
        file: 'billing_ledger.json', record_id: id, field: 'total_paid',
        message: `total_paid ($${m.total_paid}) doesn't match sum of payments ($${calcPaid.toFixed(2)}).`,
        severity: 'warning', sop_ref: '§8.4',
      });
    }
  }

  return buildResult(all);
}

// ─── Sales Pipeline Validation ───────────────────────────

export function validateSalesPipeline(doc: SalesPipelineDocument): ValidationResult {
  const all: ValidationError[] = [];

  if (!doc.leads || !Array.isArray(doc.leads)) {
    all.push({
      file: 'sales_pipeline.json', record_id: '_root', field: 'leads',
      message: 'Missing or invalid leads array.', severity: 'error', sop_ref: '§2',
    });
    return buildResult(all);
  }

  for (const l of doc.leads) {
    const id = l.id || 'UNKNOWN';

    // §9.2: next_action + deadline
    all.push(...validateNextActionDeadline('sales_pipeline.json', id, l.next_action, l.deadline));

    // §2.1: Source required
    if (!l.source) {
      all.push({
        file: 'sales_pipeline.json', record_id: id, field: 'source',
        message: 'Missing lead source — SOP §2.1 requires tracking.',
        severity: 'error', sop_ref: '§2.1',
      });
    }

    // §2.4: Conflict check before engagement
    if (l.stage === 'Engagement Signed' && l.conflict_check !== 'Cleared') {
      all.push({
        file: 'sales_pipeline.json', record_id: id, field: 'conflict_check',
        message: 'Engagement signed without conflict check clearance — SOP §2.4 violation.',
        severity: 'error', sop_ref: '§2.4',
      });
    }

    // §2.5: Must have Clio matter ID when opened
    if (l.stage === 'Opened in Clio' && !l.clio_matter_id) {
      all.push({
        file: 'sales_pipeline.json', record_id: id, field: 'clio_matter_id',
        message: 'Stage is "Opened in Clio" but no clio_matter_id set.',
        severity: 'error', sop_ref: '§2.5',
      });
    }

    // §2.2: Consultation date required for scheduled stage
    if (l.stage === 'Consultation Scheduled' && !l.consultation_date) {
      all.push({
        file: 'sales_pipeline.json', record_id: id, field: 'consultation_date',
        message: 'Consultation marked as scheduled but no date set.',
        severity: 'error', sop_ref: '§2.2',
      });
    }
  }

  return buildResult(all);
}

// ─── Promises Validation ─────────────────────────────────

export function validatePromises(doc: PromisesDocument): ValidationResult {
  const all: ValidationError[] = [];

  if (!doc.promises || !Array.isArray(doc.promises)) {
    all.push({
      file: 'promises.json', record_id: '_root', field: 'promises',
      message: 'Missing or invalid promises array.', severity: 'error', sop_ref: '§6',
    });
    return buildResult(all);
  }

  for (const p of doc.promises) {
    const id = p.id || 'UNKNOWN';

    // §9.2: next_action + deadline
    all.push(...validateNextActionDeadline('promises.json', id, p.next_action, p.deadline));

    // §6.3: Promise text required
    if (!p.promise_text || p.promise_text.trim().length === 0) {
      all.push({
        file: 'promises.json', record_id: id, field: 'promise_text',
        message: 'Empty promise_text — SOP §6.3 requires exact commitment text.',
        severity: 'error', sop_ref: '§6.3',
      });
    }

    // §6.4: At-risk but no escalation
    if (p.at_risk && !p.escalation_sent && p.status === 'Open') {
      all.push({
        file: 'promises.json', record_id: id, field: 'escalation_sent',
        message: 'Promise at risk but no escalation sent — SOP §6.4 requires immediate alert.',
        severity: 'warning', sop_ref: '§6.4',
      });
    }

    // Overdue open promise
    if (p.status === 'Open' && p.due_date && p.due_date < today()) {
      all.push({
        file: 'promises.json', record_id: id, field: 'due_date',
        message: `Promise overdue since ${p.due_date} — must fulfill or mark as Broken/Extended.`,
        severity: 'warning', sop_ref: '§6.3',
      });
    }
  }

  return buildResult(all);
}

// ─── KPI Dashboard Validation ────────────────────────────

export function validateKPIDashboard(doc: KPIDashboardDocument): ValidationResult {
  const all: ValidationError[] = [];

  // §10: Period must be set
  if (!doc.period_start || !doc.period_end) {
    all.push({
      file: 'kpi_dashboard.json', record_id: '_root', field: 'period',
      message: 'Missing period_start or period_end.', severity: 'error', sop_ref: '§10',
    });
  }

  // §10.1: Overdue rate sanity
  if (doc.operational.overdue_rate > 0.25) {
    all.push({
      file: 'kpi_dashboard.json', record_id: '_root', field: 'overdue_rate',
      message: `Overdue rate at ${(doc.operational.overdue_rate * 100).toFixed(0)}% — exceeds 25% threshold.`,
      severity: 'warning', sop_ref: '§10.1',
    });
  }

  // §10.3: SLA compliance
  if (doc.client.sla_compliance_rate < 0.80) {
    all.push({
      file: 'kpi_dashboard.json', record_id: '_root', field: 'sla_compliance_rate',
      message: `SLA compliance at ${(doc.client.sla_compliance_rate * 100).toFixed(0)}% — below 80% minimum.`,
      severity: 'warning', sop_ref: '§10.3',
    });
  }

  // §10.3: Promise fulfillment
  if (doc.client.promise_fulfillment_rate < 0.90) {
    all.push({
      file: 'kpi_dashboard.json', record_id: '_root', field: 'promise_fulfillment_rate',
      message: `Promise fulfillment at ${(doc.client.promise_fulfillment_rate * 100).toFixed(0)}% — below 90% target.`,
      severity: 'warning', sop_ref: '§10.3',
    });
  }

  // §10.2: Collection rate
  if (doc.financial.collection_rate < 0.70) {
    all.push({
      file: 'kpi_dashboard.json', record_id: '_root', field: 'collection_rate',
      message: `Collection rate at ${(doc.financial.collection_rate * 100).toFixed(0)}% — below 70% target.`,
      severity: 'warning', sop_ref: '§10.2',
    });
  }

  return buildResult(all);
}

// ─── Validate All ────────────────────────────────────────

export interface FullValidationResult {
  tasks: ValidationResult;
  billing: ValidationResult;
  sales: ValidationResult;
  promises: ValidationResult;
  kpi: ValidationResult;
  overall_valid: boolean;
  total_errors: number;
  total_warnings: number;
}

export function validateAll(
  tasks: TasksDocument,
  billing: BillingLedgerDocument,
  sales: SalesPipelineDocument,
  promises: PromisesDocument,
  kpi: KPIDashboardDocument,
): FullValidationResult {
  const t = validateTasks(tasks);
  const b = validateBillingLedger(billing);
  const s = validateSalesPipeline(sales);
  const p = validatePromises(promises);
  const k = validateKPIDashboard(kpi);

  const total_errors = t.errors.length + b.errors.length + s.errors.length + p.errors.length + k.errors.length;
  const total_warnings = t.warnings.length + b.warnings.length + s.warnings.length + p.warnings.length + k.warnings.length;

  return {
    tasks: t,
    billing: b,
    sales: s,
    promises: p,
    kpi: k,
    overall_valid: total_errors === 0,
    total_errors,
    total_warnings,
  };
}

// ─── Internal ────────────────────────────────────────────

function buildResult(all: ValidationError[]): ValidationResult {
  const errors = all.filter(e => e.severity === 'error');
  const warnings = all.filter(e => e.severity === 'warning');
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: `${errors.length} error(s), ${warnings.length} warning(s)`,
  };
}
