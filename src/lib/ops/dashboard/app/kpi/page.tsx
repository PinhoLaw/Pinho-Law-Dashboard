'use client';

import { useEffect, useState } from 'react';

export default function KPIPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/state/kpi_dashboard.json')
      .then(r => r.json())
      .then(data => { setKpi(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-400">Loading KPIs...</div>;
  if (!kpi) return <div className="p-6 text-gray-400">No KPI data available.</div>;

  const { operational: op, financial: fin, client: cl, team, calendar: cal } = kpi;

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">KPI Dashboard</h1>
        <p className="text-sm text-gray-400">
          SOP §10 — Period: {kpi.period_start} to {kpi.period_end}
        </p>
      </div>

      {/* Operational Health */}
      <Section title="Operational Health (§10.1)">
        <Metric label="Active Matters" value={op.active_matters} />
        <Metric label="Overdue" value={op.overdue_matters} alert={op.overdue_matters > 0} />
        <Metric label="Overdue Rate" value={`${(op.overdue_rate * 100).toFixed(0)}%`} alert={op.overdue_rate > 0.25} />
        <Metric label="Critical Risk" value={op.critical_risk_count} alert={op.critical_risk_count > 0} />
        <Metric label="Elevated Risk" value={op.elevated_risk_count} warn={op.elevated_risk_count > 0} />
        <Metric label="Avg Days Since Action" value={op.avg_days_since_action.toFixed(1)} warn={op.avg_days_since_action > 5} />
        <Metric label="Stale (7+ days)" value={op.stale_matters} warn={op.stale_matters > 0} />
        <Metric label="Opened This Period" value={op.matters_opened_period} />
        <Metric label="Closed This Period" value={op.matters_closed_period} />
      </Section>

      {/* Financial Health */}
      <Section title="Financial Health (§10.2)">
        <Metric label="Outstanding" value={`$${fin.total_outstanding.toLocaleString()}`} alert={fin.total_outstanding > 50000} />
        <Metric label="Collected (Period)" value={`$${fin.total_collected_period.toLocaleString()}`} />
        <Metric label="Billed (Period)" value={`$${fin.total_billed_period.toLocaleString()}`} />
        <Metric label="Collection Rate" value={`${(fin.collection_rate * 100).toFixed(0)}%`} alert={fin.collection_rate < 0.7} />
        <Metric label="30+ Day Aging" value={fin.aging_30_plus} warn={fin.aging_30_plus > 0} />
        <Metric label="60+ Day Aging" value={fin.aging_60_plus} alert={fin.aging_60_plus > 0} />
        <Metric label="90+ Day Aging" value={fin.aging_90_plus} alert={fin.aging_90_plus > 0} />
        <Metric label="Billable Hours" value={`${fin.billable_hours_period.toFixed(1)}h`} />
        <Metric label="Utilization" value={`${(fin.utilization_rate * 100).toFixed(0)}%`} warn={fin.utilization_rate < 0.6} />
      </Section>

      {/* Client Satisfaction */}
      <Section title="Client Satisfaction (§10.3)">
        <Metric label="Avg Contact Gap" value={`${cl.avg_contact_gap_days.toFixed(1)} days`} warn={cl.avg_contact_gap_days > 5} />
        <Metric label="Within SLA" value={cl.within_sla_count} />
        <Metric label="SLA Compliance" value={`${(cl.sla_compliance_rate * 100).toFixed(0)}%`} alert={cl.sla_compliance_rate < 0.8} />
        <Metric label="Open Promises" value={cl.open_promises} />
        <Metric label="Promise Fulfillment" value={`${(cl.promise_fulfillment_rate * 100).toFixed(0)}%`} alert={cl.promise_fulfillment_rate < 0.9} />
        <Metric label="At-Risk Promises" value={cl.at_risk_promises} alert={cl.at_risk_promises > 0} />
        <Metric label="WA Messages Sent" value={cl.wa_messages_sent_period} />
      </Section>

      {/* Team Performance */}
      <Section title="Team Performance (§10.4)">
        <div className="col-span-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-800">
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Role</th>
                <th className="py-2 px-2 text-right">Matters</th>
                <th className="py-2 px-2 text-right">Overdue</th>
                <th className="py-2 px-2 text-right">Billable</th>
                <th className="py-2 px-2 text-right">Outstanding</th>
                <th className="py-2 px-2 text-right">Promises</th>
              </tr>
            </thead>
            <tbody>
              {(team.members || []).map((m: any) => (
                <tr key={m.name} className="border-b border-gray-800/50">
                  <td className="py-2 px-2 text-white">{m.name}</td>
                  <td className="py-2 px-2 text-gray-400">{m.role}</td>
                  <td className="py-2 px-2 text-right text-gray-300">{m.active_matters}</td>
                  <td className={`py-2 px-2 text-right ${m.overdue_items > 0 ? 'text-red-400' : 'text-gray-500'}`}>{m.overdue_items}</td>
                  <td className="py-2 px-2 text-right text-gray-300">{m.billable_hours.toFixed(1)}h</td>
                  <td className="py-2 px-2 text-right text-gray-300">${m.outstanding_balance.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right text-gray-300">{m.open_promises}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Calendar */}
      <Section title="Calendar Compliance (§10.5)">
        <Metric label="Execution Blocks" value={`${cal.execution_blocks_scheduled}/5`} warn={cal.execution_blocks_scheduled < 5} />
        <Metric label="Block Completion" value={`${(cal.block_completion_rate * 100).toFixed(0)}%`} />
        <Metric label="Court Deadlines (7d)" value={cal.court_deadlines_7d} alert={cal.court_deadlines_7d > 0} />
        <Metric label="Filing Deadlines (7d)" value={cal.filing_deadlines_7d} warn={cal.filing_deadlines_7d > 0} />
        <Metric label="Client Meetings (7d)" value={cal.client_meetings_7d} />
        <Metric label="Conflicts" value={cal.conflicts_detected} alert={cal.conflicts_detected > 0} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-indigo-400 mb-3">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {children}
      </div>
    </div>
  );
}

function Metric({ label, value, alert, warn }: { label: string; value: string | number; alert?: boolean; warn?: boolean }) {
  const color = alert ? 'text-red-400' : warn ? 'text-yellow-400' : 'text-white';
  return (
    <div className={`metric-card ${alert ? 'border-red-500/30' : warn ? 'border-yellow-500/30' : ''}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
