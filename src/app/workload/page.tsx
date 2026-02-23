'use client';

import { useEffect, useState, useMemo } from 'react';
import DashboardShell from '@/components/DashboardShell';
import { Users, DollarSign, FolderOpen, TrendingUp, BarChart3 } from 'lucide-react';

interface EnrichedMatter {
  id: number;
  displayNumber: string;
  description: string;
  status: string;
  openDate: string;
  clientName: string;
  responsibleAttorney: string;
  practiceArea: string;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  phone: string;
  daysOpen: number;
}

interface AttorneyBreakdown {
  name: string;
  count: number;
  outstanding: number;
  paid: number;
}

interface AreaBreakdown {
  name: string;
  count: number;
  outstanding: number;
}

interface ClioResponse {
  matters: EnrichedMatter[];
  stats: {
    totalMatters: number;
    openMatters: number;
    totalOutstanding: number;
    totalPaid: number;
    totalBilled: number;
    collectionRate: number;
  };
  byAttorney: AttorneyBreakdown[];
  byArea: AreaBreakdown[];
  fetchedAt: string;
}

export default function TeamWorkload() {
  const [data, setData] = useState<ClioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/clio/matters')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const team = data?.byAttorney || [];
  const areas = data?.byArea || [];

  const maxMatters = useMemo(() => Math.max(...team.map(t => t.count), 1), [team]);
  const maxOutstanding = useMemo(() => Math.max(...team.map(t => t.outstanding), 1), [team]);
  const maxAreaCount = useMemo(() => Math.max(...areas.map(a => a.count), 1), [areas]);

  // Group matters by attorney for expanded view
  const mattersByAttorney = useMemo(() => {
    if (!data?.matters) return new Map<string, EnrichedMatter[]>();
    const map = new Map<string, EnrichedMatter[]>();
    for (const m of data.matters.filter(m => m.status === 'Open')) {
      const atty = m.responsibleAttorney || 'Unassigned';
      if (!map.has(atty)) map.set(atty, []);
      map.get(atty)!.push(m);
    }
    // Sort each attorney's matters by outstanding desc
    for (const [, matters] of map) {
      matters.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    }
    return map;
  }, [data]);

  const formatCurrency = (n: number) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatCompact = (n: number) => {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return formatCurrency(n);
  };

  return (
    <DashboardShell>
      <div className="mb-8">
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="font-display text-[32px] italic text-[#F0EDE6] tracking-tight">
            Team Workload
          </h1>
        </div>
        <p className="text-[13px] text-[#5A5A5E]">
          Open matters and billing grouped by responsible attorney and practice area
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 loading-shimmer" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Attorney cards — 2/3 width */}
          <div className="xl:col-span-2 space-y-3 stagger-children">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-[#C9A84C]" />
              <h2 className="text-[15px] font-semibold text-[#F0EDE6]">By Attorney</h2>
              <span className="text-[11px] text-[#3A3A3E] mono ml-auto">
                {team.length} attorneys
              </span>
            </div>

            {team.map((member) => {
              const memberMatters = mattersByAttorney.get(member.name) || [];

              return (
                <div key={member.name} className="card overflow-hidden">
                  <div
                    className="p-5 cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                    onClick={() => setExpanded(expanded === member.name ? null : member.name)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold"
                          style={{
                            background: member.name === 'Unassigned'
                              ? 'rgba(239,68,68,0.08)'
                              : 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.04) 100%)',
                            color: member.name === 'Unassigned' ? '#F87171' : '#DFBF6F',
                            border: `1px solid ${member.name === 'Unassigned' ? 'rgba(239,68,68,0.12)' : 'rgba(201,168,76,0.12)'}`,
                          }}
                        >
                          {member.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-[15px] text-[#F0EDE6]">
                            {member.name}
                          </h3>
                          <p className="text-[11px] text-[#5A5A5E]">
                            {member.count} open matter{member.count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[18px] font-bold mono" style={{
                          color: member.outstanding > 0 ? '#F87171' : '#34D399',
                          textShadow: member.outstanding > 0
                            ? '0 0 30px rgba(248,113,113,0.2)'
                            : '0 0 30px rgba(52,211,153,0.2)',
                        }}>
                          {formatCompact(member.outstanding)}
                        </p>
                        <p className="text-[10px] text-[#5A5A5E] uppercase tracking-wider">outstanding</p>
                      </div>
                    </div>

                    {/* Progress bars */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between text-[10px] mb-1.5">
                          <span className="text-[#5A5A5E] flex items-center gap-1 uppercase tracking-wider font-semibold">
                            <FolderOpen size={10} /> Matters
                          </span>
                          <span className="text-[#8A8A8E] mono">{member.count}</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-bar"
                            style={{
                              width: `${(member.count / maxMatters) * 100}%`,
                              background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] mb-1.5">
                          <span className="text-[#5A5A5E] flex items-center gap-1 uppercase tracking-wider font-semibold">
                            <DollarSign size={10} /> Collected
                          </span>
                          <span className="text-[#34D399] mono">{formatCompact(member.paid)}</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-bar"
                            style={{
                              width: `${member.outstanding > 0 ? (member.outstanding / maxOutstanding) * 100 : 0}%`,
                              background: member.outstanding > 10000
                                ? 'linear-gradient(90deg, #EF4444, #F87171)'
                                : member.outstanding > 0
                                ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                                : 'linear-gradient(90deg, #10B981, #34D399)',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded matters */}
                  {expanded === member.name && memberMatters.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="overflow-x-auto animate-fade-in">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Matter #</th>
                              <th>Client</th>
                              <th>Area</th>
                              <th className="text-right">Outstanding</th>
                              <th className="text-right">Paid</th>
                              <th className="text-center">Phone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {memberMatters.slice(0, 20).map(m => (
                              <tr key={m.id}>
                                <td><span className="mono text-[12px] text-[#60A5FA]">{m.displayNumber}</span></td>
                                <td><span className="text-[#F0EDE6]">{m.clientName}</span></td>
                                <td>
                                  {m.practiceArea && m.practiceArea !== 'Uncategorized' ? (
                                    <span className="badge badge-brand">{m.practiceArea}</span>
                                  ) : (
                                    <span className="text-[#3A3A3E]">{'\u2014'}</span>
                                  )}
                                </td>
                                <td className="text-right">
                                  <span className="mono text-[13px]" style={{
                                    color: m.totalOutstanding > 0 ? '#F87171' : '#3A3A3E'
                                  }}>
                                    {formatCurrency(m.totalOutstanding)}
                                  </span>
                                </td>
                                <td className="text-right">
                                  <span className="mono text-[13px] text-[#34D399]">
                                    {formatCurrency(m.totalPaid)}
                                  </span>
                                </td>
                                <td className="text-center">
                                  <span style={{ color: m.phone ? '#34D399' : '#F87171', fontSize: '0.75rem' }}>
                                    {m.phone ? '\u2713' : '\u2717'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {memberMatters.length > 20 && (
                              <tr>
                                <td colSpan={6} className="text-center text-[11px] text-[#5A5A5E] py-3">
                                  + {memberMatters.length - 20} more matters
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Practice area sidebar — 1/3 width */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-[#C9A84C]" />
              <h2 className="text-[15px] font-semibold text-[#F0EDE6]">By Practice Area</h2>
            </div>

            {areas.map((area, i) => (
              <div key={area.name} className="card p-4" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-medium text-[#F0EDE6]">{area.name}</h3>
                  <span className="text-[11px] mono text-[#8A8A8E]">{area.count} matters</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#5A5A5E] uppercase tracking-wider font-semibold">Outstanding</span>
                  <span className="text-[13px] mono" style={{
                    color: area.outstanding > 0 ? '#F87171' : '#3A3A3E'
                  }}>
                    {formatCompact(area.outstanding)}
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-bar"
                    style={{
                      width: `${(area.count / maxAreaCount) * 100}%`,
                      background: 'linear-gradient(90deg, rgba(201,168,76,0.5), rgba(223,191,111,0.3))',
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Summary card */}
            <div className="card-brand p-5 mt-4">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={14} className="text-[#C9A84C]" />
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#DFBF6F]">
                    Firm Totals
                  </h3>
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#8A8A8E]">Total Billed</span>
                    <span className="mono text-[13px] text-[#F0EDE6]">
                      {formatCompact(data?.stats.totalBilled || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#8A8A8E]">Total Collected</span>
                    <span className="mono text-[13px] text-[#34D399]">
                      {formatCompact(data?.stats.totalPaid || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#8A8A8E]">Outstanding</span>
                    <span className="mono text-[13px] text-[#F87171]">
                      {formatCompact(data?.stats.totalOutstanding || 0)}
                    </span>
                  </div>
                  <div className="h-px my-1" style={{ background: 'rgba(201,168,76,0.15)' }} />
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#DFBF6F] font-semibold">Collection Rate</span>
                    <span className="mono text-[14px] font-bold text-[#DFBF6F]">
                      {data?.stats.collectionRate || 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-[#F87171] text-sm">Failed to load team data from Clio</p>
        </div>
      )}
    </DashboardShell>
  );
}
