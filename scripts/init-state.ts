/**
 * PinhoOps State Initialization Script
 *
 * Creates all 5 state files in the GitHub repository with
 * proper schemas and 3 realistic starter matters for Pinho Law.
 *
 * Run: npx tsx scripts/init-state.ts
 *
 * Requires env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
 */

import { Octokit } from '@octokit/rest';

// ─── Config ─────────────────────────────────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'PinhoLaw';
const GITHUB_REPO = process.env.GITHUB_REPO || 'Pinho-Law-Dashboard';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const STATE_PATH = process.env.GITHUB_STATE_PATH || 'state/';

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN is required. Set it as an environment variable.');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const now = new Date().toISOString();
const today = now.split('T')[0];

// ─── Helper: Create or update a file ────────────────────

async function upsertFile(path: string, content: string, message: string) {
  const fullPath = `${STATE_PATH}${path}`;

  // Check if file exists
  let sha: string | undefined;
  try {
    const existing = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: fullPath,
      ref: GITHUB_BRANCH,
    });
    sha = (existing.data as any).sha;
    console.log(`  📝 Updating ${fullPath} (exists)`);
  } catch {
    console.log(`  ✨ Creating ${fullPath} (new)`);
  }

  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: fullPath,
    message: `[PinhoOps] ${message}`,
    content: Buffer.from(content).toString('base64'),
    branch: GITHUB_BRANCH,
    ...(sha ? { sha } : {}),
  });
}

// ─── 1. tasks.json ──────────────────────────────────────

const tasks = {
  last_updated: now,
  version: '1.0',
  sop_version: 'PinhoLaw SOP v1.0',
  summary: {
    total_tasks: 3,
    open: 3,
    overdue: 0,
    critical: 0,
    elevated: 1,
    by_status: {
      Open: 0,
      Active: 3,
      'Pending Client': 0,
      'Pending Court': 0,
      Closing: 0,
      Archived: 0,
    },
  },
  tasks: [
    {
      id: 'TASK-001',
      clio_matter_id: '1001',
      client: 'Roberto Mendes',
      matter_name: 'Mendes v. Apex Properties LLC — Breach of Contract',
      matter_type: 'Litigation',
      status: 'Active',
      next_action: 'File motion for summary judgment',
      deadline: '2026-03-10',
      lead_attorney: 'Guillerme',
      paralegal: 'Mariana',
      assigned_to: 'Guillerme',
      risk_level: 'Elevated',
      current_phase: 'Discovery',
      sop_ref: '§4.1, §5.2',
      last_action: 'Completed depositions of defendant witnesses',
      last_action_date: '2026-02-20',
      days_since_contact: 4,
      whatsapp_phone: '+15558881001',
      internal_notes: 'Client anxious about timeline. Apex offered $45K settlement — client rejected.',
      created_at: '2025-11-15T10:00:00Z',
      updated_at: now,
    },
    {
      id: 'TASK-002',
      clio_matter_id: '1002',
      client: 'Dr. Fernanda Oliveira',
      matter_name: 'Oliveira EB-2 NIW Immigration Petition',
      matter_type: 'Immigration',
      status: 'Active',
      next_action: 'Submit I-140 petition to USCIS',
      deadline: '2026-03-05',
      lead_attorney: 'Daniel',
      paralegal: 'Inez',
      assigned_to: 'Inez',
      risk_level: 'Normal',
      current_phase: 'Document Preparation',
      sop_ref: '§4.1, §5.1',
      last_action: 'Received recommendation letters from 3 independent experts',
      last_action_date: '2026-02-22',
      days_since_contact: 2,
      whatsapp_phone: '+15558881002',
      internal_notes: 'Strong case — PhD in Biomedical Engineering, 15 publications, 200+ citations. Priority date current.',
      created_at: '2025-12-01T14:00:00Z',
      updated_at: now,
    },
    {
      id: 'TASK-003',
      clio_matter_id: '1003',
      client: 'TechBridge Solutions Inc.',
      matter_name: 'TechBridge — Florida LLC Formation & Operating Agreement',
      matter_type: 'Corporate',
      status: 'Active',
      next_action: 'Draft operating agreement and file Articles of Organization',
      deadline: '2026-03-01',
      lead_attorney: 'Guillerme',
      paralegal: 'Mariana',
      assigned_to: 'Mariana',
      risk_level: 'Normal',
      current_phase: 'Document Preparation',
      sop_ref: '§4.1, §5.1',
      last_action: 'Completed conflict check — cleared. Engagement letter signed.',
      last_action_date: '2026-02-21',
      days_since_contact: 3,
      whatsapp_phone: '+15558881003',
      internal_notes: 'Three Brazilian co-founders. Need multi-member LLC with custom profit allocation. Also need EIN.',
      created_at: '2026-02-10T09:00:00Z',
      updated_at: now,
    },
  ],
};

// ─── 2. billing_ledger.json ─────────────────────────────

const billing = {
  last_updated: now,
  version: '1.0',
  sop_version: 'PinhoLaw SOP v1.0',
  summary: {
    total_outstanding: 14525,
    total_paid: 11000,
    total_billable_hours: 42.5,
    clients_with_balance: 2,
    total_matters: 3,
  },
  matters: [
    {
      clio_matter_id: '1001',
      client: 'Roberto Mendes',
      matter_name: 'Mendes v. Apex Properties LLC — Breach of Contract',
      responsible_attorney: 'Guillerme',
      billing_type: 'Hourly',
      contrato_clio: 'CLO-1001',
      total_paid: 7000,
      total_outstanding: 8750,
      total_billable_hours: 25,
      total_nonbillable_hours: 3,
      days_since_payment: 18,
      followup_needed: false,
      followup_prompt: '',
      time_entries: [
        {
          id: 'TE-001',
          date: '2026-02-20',
          attorney: 'Guillerme',
          hours: 3.5,
          rate: 350,
          amount: 1225,
          type: 'Billable',
          description: 'Deposition preparation and witness examination — Apex Properties',
          approval_status: 'Approved',
          approved_by: 'Guillerme',
          approved_at: '2026-02-20T18:00:00Z',
          clio_time_entry_id: null,
        },
        {
          id: 'TE-002',
          date: '2026-02-18',
          attorney: 'Mariana',
          hours: 2,
          rate: 150,
          amount: 300,
          type: 'Billable',
          description: 'Document review and exhibit organization for depositions',
          approval_status: 'Approved',
          approved_by: 'Guillerme',
          approved_at: '2026-02-19T10:00:00Z',
          clio_time_entry_id: null,
        },
      ],
      payments: [
        {
          id: 'PAY-001',
          date: '2026-02-05',
          amount: 3500,
          method: 'Wire',
          reference: 'WR-20260205-Mendes',
          notes: 'Retainer replenishment',
        },
        {
          id: 'PAY-002',
          date: '2026-01-10',
          amount: 3500,
          method: 'Wire',
          reference: 'WR-20260110-Mendes',
          notes: 'Initial retainer',
        },
      ],
    },
    {
      clio_matter_id: '1002',
      client: 'Dr. Fernanda Oliveira',
      matter_name: 'Oliveira EB-2 NIW Immigration Petition',
      responsible_attorney: 'Daniel',
      billing_type: 'Flat Fee',
      contrato_clio: 'CLO-1002',
      total_paid: 4000,
      total_outstanding: 3500,
      total_billable_hours: 12.5,
      total_nonbillable_hours: 1,
      days_since_payment: 25,
      followup_needed: false,
      followup_prompt: '',
      time_entries: [
        {
          id: 'TE-003',
          date: '2026-02-22',
          attorney: 'Inez',
          hours: 4,
          rate: 150,
          amount: 600,
          type: 'Billable',
          description: 'Compiled expert recommendation letters and drafted I-140 support brief',
          approval_status: 'Draft',
          approved_by: '',
          approved_at: '',
          clio_time_entry_id: null,
        },
      ],
      payments: [
        {
          id: 'PAY-003',
          date: '2026-01-28',
          amount: 4000,
          method: 'Credit Card',
          reference: 'CC-20260128-Oliveira',
          notes: 'Flat fee installment 1 of 2',
        },
      ],
    },
    {
      clio_matter_id: '1003',
      client: 'TechBridge Solutions Inc.',
      matter_name: 'TechBridge — Florida LLC Formation & Operating Agreement',
      responsible_attorney: 'Guillerme',
      billing_type: 'Flat Fee',
      contrato_clio: 'CLO-1003',
      total_paid: 0,
      total_outstanding: 2275,
      total_billable_hours: 5,
      total_nonbillable_hours: 0.5,
      days_since_payment: 0,
      followup_needed: true,
      followup_prompt: 'Olá Lucas, tudo bem? Aqui é da Equipe PinhoLaw. Gostaríamos de confirmar o pagamento referente à formação da LLC da TechBridge Solutions no valor de $2,275. Podemos agendar uma conversa para discutir os próximos passos? Aguardamos seu retorno. Equipe PinhoLaw',
      time_entries: [
        {
          id: 'TE-004',
          date: '2026-02-21',
          attorney: 'Mariana',
          hours: 3,
          rate: 150,
          amount: 450,
          type: 'Billable',
          description: 'Drafted Articles of Organization and initial operating agreement template',
          approval_status: 'Pending Approval',
          approved_by: '',
          approved_at: '',
          clio_time_entry_id: null,
        },
      ],
      payments: [],
    },
  ],
};

// ─── 3. sales_pipeline.json ─────────────────────────────

const sales = {
  last_updated: now,
  version: '1.0',
  sop_version: 'PinhoLaw SOP v1.0',
  summary: {
    total_leads: 2,
    by_stage: {
      'New Lead': 1,
      Contacted: 0,
      'Consultation Scheduled': 1,
      'Consultation Completed': 0,
      'Proposal Sent': 0,
      'Engagement Signed': 0,
      'Conflict Check': 0,
      'Opened in Clio': 0,
      Lost: 0,
      Disqualified: 0,
    },
    estimated_value: 12500,
    conversion_rate: 0,
  },
  leads: [
    {
      id: 'LEAD-001',
      name: 'Ana Carolina Vieira',
      phone: '+15558882001',
      email: 'ana.vieira@email.com',
      source: 'WhatsApp Referral',
      matter_type: 'Immigration',
      stage: 'Consultation Scheduled',
      estimated_value: 7500,
      next_action: 'Conduct initial consultation via Zoom',
      deadline: '2026-02-26',
      assigned_to: 'Daniel',
      conflict_check_status: 'Pending',
      notes: 'H-1B holder looking to self-petition EB-1A. Has 50+ publications in physics.',
      created_at: '2026-02-20T11:00:00Z',
      updated_at: now,
      days_in_stage: 4,
    },
    {
      id: 'LEAD-002',
      name: 'Marcus Thompson',
      phone: '+15558882002',
      email: 'mthompson@techstartup.io',
      source: 'Website Form',
      matter_type: 'Corporate',
      stage: 'New Lead',
      estimated_value: 5000,
      next_action: 'Call to discuss business formation needs',
      deadline: '2026-02-25',
      assigned_to: 'Guillerme',
      conflict_check_status: 'Not Started',
      notes: 'Tech startup founder needs Delaware C-Corp with FL qualification. 3 co-founders.',
      created_at: '2026-02-23T15:00:00Z',
      updated_at: now,
      days_in_stage: 1,
    },
  ],
};

// ─── 4. promises.json ───────────────────────────────────

const promises = {
  last_updated: now,
  version: '1.0',
  sop_version: 'PinhoLaw SOP v1.0',
  summary: {
    total_promises: 3,
    open: 2,
    fulfilled: 1,
    broken: 0,
    at_risk: 1,
  },
  promises: [
    {
      id: 'PROM-001',
      client: 'Roberto Mendes',
      clio_matter_id: '1001',
      promise: 'File motion for summary judgment by March 10',
      promised_by: 'Guillerme',
      promised_to: 'Roberto Mendes',
      channel: 'WhatsApp',
      date_made: '2026-02-20',
      deadline: '2026-03-10',
      status: 'Open',
      at_risk: false,
      notes: 'Discussed during deposition debrief call',
      escalation_history: [],
    },
    {
      id: 'PROM-002',
      client: 'Dr. Fernanda Oliveira',
      clio_matter_id: '1002',
      promise: 'Submit I-140 petition by March 5',
      promised_by: 'Daniel',
      promised_to: 'Dr. Fernanda Oliveira',
      channel: 'Email',
      date_made: '2026-02-15',
      deadline: '2026-03-05',
      status: 'Open',
      at_risk: true,
      notes: 'Still waiting on one more recommendation letter. May need extension.',
      escalation_history: [
        {
          date: '2026-02-22',
          level: 1,
          action: 'Notified Inez about approaching deadline',
        },
      ],
    },
    {
      id: 'PROM-003',
      client: 'TechBridge Solutions Inc.',
      clio_matter_id: '1003',
      promise: 'Send draft operating agreement for review by Feb 28',
      promised_by: 'Guillerme',
      promised_to: 'Lucas Ferreira (TechBridge CEO)',
      channel: 'Phone',
      date_made: '2026-02-21',
      deadline: '2026-02-28',
      status: 'Fulfilled',
      at_risk: false,
      notes: 'Draft sent ahead of schedule on Feb 24',
      escalation_history: [],
    },
  ],
};

// ─── 5. kpi_dashboard.json ──────────────────────────────

const kpi = {
  last_updated: now,
  version: '1.0',
  sop_version: 'PinhoLaw SOP v1.0',
  period: {
    start: '2026-02-17',
    end: '2026-02-23',
    label: 'Week of Feb 17–23, 2026',
  },
  operational: {
    total_active_matters: 3,
    matters_with_next_action: 3,
    matters_missing_deadline: 0,
    overdue_tasks: 0,
    sla_violations_7day: 0,
    promises_at_risk: 1,
    promises_broken: 0,
    average_days_since_contact: 3,
  },
  financial: {
    total_billable_hours_this_week: 12.5,
    total_revenue_this_week: 2575,
    total_outstanding: 14525,
    total_collected_this_month: 4000,
    utilization_rate: 0.78,
    realization_rate: 0.92,
    average_hourly_effective_rate: 285,
  },
  client: {
    new_leads_this_week: 2,
    consultations_scheduled: 1,
    consultations_completed: 0,
    engagements_signed: 0,
    pipeline_value: 12500,
    conversion_rate: 0,
    average_lead_response_time_hours: 4,
  },
  team: [
    {
      name: 'Guillerme',
      role: 'Managing Partner',
      active_matters: 2,
      max_matters: 25,
      capacity_pct: 8,
      billable_hours_this_week: 3.5,
      overdue_tasks: 0,
      sla_violations: 0,
    },
    {
      name: 'Daniel',
      role: 'Attorney',
      active_matters: 1,
      max_matters: 25,
      capacity_pct: 4,
      billable_hours_this_week: 0,
      overdue_tasks: 0,
      sla_violations: 0,
    },
    {
      name: 'Inez',
      role: 'Senior Paralegal',
      active_matters: 1,
      max_matters: 30,
      capacity_pct: 3,
      billable_hours_this_week: 4,
      overdue_tasks: 0,
      sla_violations: 0,
    },
    {
      name: 'Mariana',
      role: 'Paralegal',
      active_matters: 2,
      max_matters: 30,
      capacity_pct: 7,
      billable_hours_this_week: 5,
      overdue_tasks: 0,
      sla_violations: 0,
    },
  ],
  calendar: {
    execution_blocks_this_week: 4,
    target_execution_blocks: 5,
    execution_block_compliance: 0.8,
    protected_hours_violated: 0,
    total_meetings_this_week: 6,
  },
};

// ─── Run ─────────────────────────────────────────────────

async function main() {
  console.log('🚀 PinhoOps State Initialization');
  console.log(`   Repo: ${GITHUB_OWNER}/${GITHUB_REPO}`);
  console.log(`   Branch: ${GITHUB_BRANCH}`);
  console.log(`   Path: ${STATE_PATH}`);
  console.log('');

  const files: [string, unknown, string][] = [
    ['tasks.json', tasks, 'Initialize tasks with 3 starter matters'],
    ['billing_ledger.json', billing, 'Initialize billing ledger with starter data'],
    ['sales_pipeline.json', sales, 'Initialize sales pipeline with 2 leads'],
    ['promises.json', promises, 'Initialize promises tracker'],
    ['kpi_dashboard.json', kpi, 'Initialize KPI dashboard for current week'],
  ];

  for (const [filename, data, message] of files) {
    try {
      await upsertFile(filename, JSON.stringify(data, null, 2) + '\n', message);
      console.log(`  ✅ ${filename}`);
    } catch (err: any) {
      console.error(`  ❌ ${filename}: ${err.message}`);
    }
  }

  console.log('');
  console.log('✅ State initialization complete!');
  console.log('');
  console.log('📊 Starter Data Summary:');
  console.log('   Matters: 3 (Litigation, Immigration, Corporate)');
  console.log('   Leads: 2 (Immigration consultation, Corporate formation)');
  console.log('   Promises: 3 (2 open, 1 fulfilled)');
  console.log('   Time Entries: 4 (2 Approved, 1 Draft, 1 Pending Approval)');
  console.log('   Billing: $14,525 outstanding across 2 clients');
  console.log('');
  console.log('🧪 Test with:');
  console.log('   curl https://pinholaw-ops.vercel.app/api/pinhoops \\');
  console.log('     -X POST -H "Content-Type: application/json" \\');
  console.log('     -d \'{"sender_phone":"+15551234567","sender_name":"Guillerme","message_text":"daily briefing"}\'');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
