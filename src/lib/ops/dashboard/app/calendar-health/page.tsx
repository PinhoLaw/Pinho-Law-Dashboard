'use client';

import { useEffect, useState } from 'react';

export default function CalendarHealthPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/state/kpi_dashboard.json').then(r => r.json()),
      fetch('/api/state/tasks.json').then(r => r.json()),
    ]).then(([kpiData, tasksData]) => {
      setKpi(kpiData);
      setTasks(tasksData.matters || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-400">Loading calendar data...</div>;

  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0];
  const in30Days = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0];

  const overdue = tasks.filter(t => t.status !== 'Archived' && t.deadline < today).sort((a: any, b: any) => a.deadline.localeCompare(b.deadline));
  const thisWeek = tasks.filter(t => t.status !== 'Archived' && t.deadline >= today && t.deadline <= in7Days).sort((a: any, b: any) => a.deadline.localeCompare(b.deadline));
  const thisMonth = tasks.filter(t => t.status !== 'Archived' && t.deadline > in7Days && t.deadline <= in30Days).sort((a: any, b: any) => a.deadline.localeCompare(b.deadline));

  const cal = kpi?.calendar;

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Calendar Health</h1>
        <p className="text-sm text-gray-400">SOP §6, §10.5 — Schedule Compliance & Execution Blocks</p>
      </div>

      {cal && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className={`metric-card ${cal.execution_blocks_scheduled < 5 ? 'border-yellow-500/30' : ''}`}>
            <p className="text-xs text-gray-500">Execution Blocks</p>
            <p className="text-2xl font-bold text-white">{cal.execution_blocks_scheduled}<span className="text-gray-500 text-sm">/5</span></p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Block Completion</p>
            <p className="text-2xl font-bold text-indigo-400">{(cal.block_completion_rate * 100).toFixed(0)}%</p>
          </div>
          <div className={`metric-card ${cal.court_deadlines_7d > 0 ? 'border-red-500/30' : ''}`}>
            <p className="text-xs text-gray-500">Court Deadlines</p>
            <p className="text-2xl font-bold text-red-400">{cal.court_deadlines_7d}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Filing Deadlines</p>
            <p className="text-2xl font-bold text-yellow-400">{cal.filing_deadlines_7d}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Client Meetings</p>
            <p className="text-2xl font-bold text-white">{cal.client_meetings_7d}</p>
          </div>
          <div className={`metric-card ${cal.conflicts_detected > 0 ? 'border-red-500/30' : ''}`}>
            <p className="text-xs text-gray-500">Conflicts</p>
            <p className="text-2xl font-bold text-red-400">{cal.conflicts_detected}</p>
          </div>
        </div>
      )}

      <DeadlineSection title="Overdue" items={overdue} color="red" />
      <DeadlineSection title="This Week" items={thisWeek} color="yellow" />
      <DeadlineSection title="Next 30 Days" items={thisMonth} color="gray" />
    </div>
  );
}

function DeadlineSection({ title, items, color }: { title: string; items: any[]; color: string }) {
  const titleColor = color === 'red' ? 'text-red-400' : color === 'yellow' ? 'text-yellow-400' : 'text-gray-400';
  const badgeColor = color === 'red' ? 'bg-red-500/20 text-red-400' : color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-400';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className={`text-lg font-semibold ${titleColor}`}>{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-600">None</p>
      ) : (
        <div className="space-y-2">
          {items.map((t: any) => (
            <div key={t.id || t.clio_matter_id} className={`bg-gray-900 border border-gray-800 rounded p-3 flex items-center justify-between ${
              color === 'red' ? 'border-l-4 border-l-red-500' : color === 'yellow' ? 'border-l-4 border-l-yellow-500' : ''
            }`}>
              <div>
                <span className="text-sm font-medium text-white">{t.client}</span>
                <span className="text-xs text-gray-500 ml-2">{t.clio_matter_id}</span>
                <p className="text-xs text-gray-400 mt-1">{t.next_action}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-mono ${color === 'red' ? 'text-red-400' : 'text-gray-400'}`}>{t.deadline}</p>
                <p className="text-xs text-gray-500">{t.assigned_to}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
