'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/tasks', label: 'Tasks', icon: '▣', desc: 'Kanban board with risk flags' },
  { href: '/billing', label: 'Billing', icon: '$', desc: 'Editable ledger + Clio sync' },
  { href: '/sales', label: 'Sales', icon: '⊳', desc: 'Pipeline view' },
  { href: '/kpi', label: 'KPI', icon: '◈', desc: 'Live metrics' },
  { href: '/calendar-health', label: 'Calendar', icon: '◫', desc: 'Schedule compliance' },
];

export default function HomePage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/state/kpi_dashboard.json')
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => null);
  }, []);

  return (
    <div className="min-h-screen p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">PinhoLaw Ops</h1>
        <p className="text-gray-400 mt-1">SOP v1.0 — Operations Command Center</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="metric-card hover:border-indigo-500/50 transition-colors group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl text-indigo-400 group-hover:text-indigo-300">{item.icon}</span>
              <h2 className="text-lg font-semibold text-white">{item.label}</h2>
            </div>
            <p className="text-sm text-gray-400">{item.desc}</p>
          </Link>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label="Active Matters" value={stats.operational?.active_matters ?? '-'} />
          <StatBox label="Overdue" value={stats.operational?.overdue_matters ?? '-'} color="red" />
          <StatBox label="Outstanding" value={`$${(stats.financial?.total_outstanding ?? 0).toLocaleString()}`} />
          <StatBox label="SLA Compliance" value={`${((stats.client?.sla_compliance_rate ?? 0) * 100).toFixed(0)}%`} color="green" />
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const colorClass = color === 'red' ? 'text-red-400' : color === 'green' ? 'text-green-400' : 'text-white';
  return (
    <div className="metric-card">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
    </div>
  );
}
