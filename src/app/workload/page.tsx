'use client';

import { useEffect, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
import { Users, DollarSign, FolderOpen } from 'lucide-react';
import type { Matter } from '@/lib/types';

interface TeamMember {
  name: string;
  matterCount: number;
  activeCount: number;
  totalOutstanding: number;
  totalPaid: number;
  areas: string[];
  matters: Matter[];
}

export default function TeamWorkload() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/matters')
      .then(r => r.json())
      .then(d => { setMatters(d.matters || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const teamMap = new Map<string, TeamMember>();
  for (const m of matters) {
    const name = m.responsiblePerson || 'Unassigned';
    const existing = teamMap.get(name) || {
      name, matterCount: 0, activeCount: 0, totalOutstanding: 0, totalPaid: 0, areas: [], matters: [],
    };
    existing.matterCount++;
    if (m.statusClio !== 'Closed') existing.activeCount++;
    existing.totalOutstanding += Number(m.clioOutstanding) || 0;
    existing.totalPaid += Number(m.clioPaid) || 0;
    if (m.area && !existing.areas.includes(m.area)) existing.areas.push(m.area);
    existing.matters.push(m);
    teamMap.set(name, existing);
  }

  const team = Array.from(teamMap.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  const maxMatters = Math.max(...team.map(t => t.matterCount), 1);
  const maxOutstanding = Math.max(...team.map(t => t.totalOutstanding), 1);

  const formatCurrency = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">Team Workload</h1>
        <p className="text-[13px] text-[#98989D]">Matters and billing grouped by responsible attorney</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 loading-shimmer" />)}
        </div>
      ) : (
        <div className="space-y-3 stagger-children">
          {team.map((member) => (
            <div key={member.name} className="card overflow-hidden">
              <div
                className="p-5 cursor-pointer hover:bg-[#F9F9FB] transition-colors"
                onClick={() => setExpanded(expanded === member.name ? null : member.name)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-semibold"
                      style={{
                        background: member.name === 'Unassigned' ? 'rgba(255,59,48,0.06)' : '#F5F5F7',
                        color: member.name === 'Unassigned' ? '#FF3B30' : '#1D1D1F',
                      }}
                    >
                      {member.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-[15px] text-[#1D1D1F]">{member.name}</h3>
                      <div className="flex gap-1.5 mt-1">
                        {member.areas.slice(0, 3).map(a => (
                          <span key={a} className="badge badge-info">{a}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[17px] font-semibold mono" style={{ color: member.totalOutstanding > 0 ? '#FF3B30' : '#34C759' }}>
                      {formatCurrency(member.totalOutstanding)}
                    </p>
                    <p className="text-[11px] text-[#98989D]">outstanding</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-[#98989D] flex items-center gap-1">
                        <FolderOpen size={11} /> Matters: {member.matterCount}
                      </span>
                      <span className="text-[#98989D]">{member.activeCount} active</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-[#F0F0F2]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(member.matterCount / maxMatters) * 100}%`,
                          background: '#007AFF',
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-[#98989D] flex items-center gap-1">
                        <DollarSign size={11} /> Paid: {formatCurrency(member.totalPaid)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-[#F0F0F2]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${member.totalOutstanding > 0 ? (member.totalOutstanding / maxOutstanding) * 100 : 0}%`,
                          background: member.totalOutstanding > 5000 ? '#FF3B30' : '#FF9500',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {expanded === member.name && (
                <div className="border-t border-[#E5E5EA] animate-fade-in">
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Matter #</th>
                          <th>Client</th>
                          <th>Status</th>
                          <th className="text-right">Outstanding</th>
                          <th className="text-right">Paid</th>
                          <th>Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {member.matters
                          .sort((a, b) => (Number(b.clioOutstanding) || 0) - (Number(a.clioOutstanding) || 0))
                          .map(m => (
                            <tr key={m.clioMatter}>
                              <td><span className="mono text-[12px] text-[#007AFF]">{m.clioMatter}</span></td>
                              <td><span className="text-[#1D1D1F]">{m.clientFullName}</span></td>
                              <td>
                                <span className={`badge ${m.statusClio === 'Open' ? 'badge-success' : m.statusClio === 'Closed' ? 'badge-neutral' : 'badge-warning'}`}>
                                  {m.statusClio}
                                </span>
                              </td>
                              <td className="text-right">
                                <span className="mono text-[13px]" style={{ color: Number(m.clioOutstanding) > 0 ? '#FF3B30' : '#C7C7CC' }}>
                                  {formatCurrency(Number(m.clioOutstanding))}
                                </span>
                              </td>
                              <td className="text-right">
                                <span className="mono text-[13px] text-[#34C759]">
                                  {formatCurrency(Number(m.clioPaid))}
                                </span>
                              </td>
                              <td>
                                <span style={{ color: m.whatsAppPhone ? '#34C759' : '#FF3B30', fontSize: '0.75rem' }}>
                                  {m.whatsAppPhone ? '✓' : '✗'}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
