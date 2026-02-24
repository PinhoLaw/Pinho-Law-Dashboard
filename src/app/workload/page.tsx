'use client';

import { useEffect, useState, useMemo } from 'react';
import DashboardShell from '@/components/DashboardShell';
import StatCard from '@/components/StatCard';
import {
  Users, DollarSign, FolderOpen, TrendingUp, BarChart3, Clock,
  AlertTriangle, Phone, PhoneOff, Calendar, ArrowUpRight, ArrowDownRight,
  ChevronDown, ChevronRight
} from 'lucide-react';

interface EnrichedMatter {
  id: number;
  displayNumber: string;
  description: string;
  status: string;
  openDate: string;
  closeDate: string;
  clientName: string;
  clientType: string;
  responsibleAttorney: string;
  practiceArea: string;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  lastInvoiceNumber: string;
  lastInvoiceDate: string;
  billCount: number;
  phone: string;
  email: string;
  daysOpen: number;
}

interface ClioResponse {
  matters: EnrichedMatter[];
  stats: {
    totalMatters: number;
    openMatters: number;
    closedMatters: number;
    totalOutstanding: number;
    totalPaid: number;
    totalBilled: number;
    clientsOwing: number;
    collectionRate: number;
    withPhone: number;
    withoutPhone: number;
  };
  byAttorney: { name: string; count: number; outstanding: number; paid: number }[];
  byArea: { name: string; count: number; outstanding: number }[];
  fetchedAt: string;
}

// Aging bucket type
interface AgingBucket {
  label: string;
  range: string;
  count: number;
  outstanding: number;
  color: string;
  bgColor: string;
}

export default function TeamWorkload() {
  const [data, setData] = useState<ClioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/clio/matters')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const openMatters = useMemo(() => {
    if (!data?.matters) return [];
    return data.matters.filter(m => m.status === 'Open');
  }, [data]);

  const areas = data?.byArea || [];
  const maxAreaCount = useMemo(() => Math.max(...areas.map(a => a.count), 1), [areas]);
  const maxAreaOutstanding = useMemo(() => Math.max(...areas.map(a => a.outstanding), 1), [areas]);

  // Practice area colors
  const areaColors: Record<string, { color: string; bg: string }> = {
    'Business': { color: '#007AFF', bg: 'rgba(0,122,255,0.08)' },
    'Immigration': { color: '#AF52DE', bg: 'rgba(175,82,222,0.08)' },
    'Civil Litigation': { color: '#FF9500', bg: 'rgba(255,149,0,0.08)' },
    'Family': { color: '#FF2D55', bg: 'rgba(255,45,85,0.08)' },
    'Uncategorized': { color: '#8E8E93', bg: 'rgba(142,142,147,0.08)' },
  };

  // Aging analysis
  const agingBuckets = useMemo<AgingBucket[]>(() => {
    const buckets = [
      { label: 'Current', range: '0–90 days', min: 0, max: 90, color: '#34C759', bgColor: 'rgba(52,199,89,0.08)' },
      { label: 'Aging', range: '91–180 days', min: 91, max: 180, color: '#FF9500', bgColor: 'rgba(255,149,0,0.08)' },
      { label: 'At Risk', range: '181–365 days', min: 181, max: 365, color: '#FF3B30', bgColor: 'rgba(255,59,48,0.08)' },
      { label: 'Critical', range: '365+ days', min: 366, max: Infinity, color: '#AF52DE', bgColor: 'rgba(175,82,222,0.08)' },
    ];
    return buckets.map(b => {
      const matching = openMatters.filter(m => m.daysOpen >= b.min && m.daysOpen <= b.max);
      return {
        label: b.label,
        range: b.range,
        count: matching.length,
        outstanding: matching.reduce((sum, m) => sum + m.totalOutstanding, 0),
        color: b.color,
        bgColor: b.bgColor,
      };
    });
  }, [openMatters]);

  const maxBucketCount = useMemo(() => Math.max(...agingBuckets.map(b => b.count), 1), [agingBuckets]);

  // Client type breakdown
  const clientTypes = useMemo(() => {
    const types: Record<string, { count: number; outstanding: number }> = {};
    for (const m of openMatters) {
      const t = m.clientType || 'Unknown';
      if (!types[t]) types[t] = { count: 0, outstanding: 0 };
      types[t].count++;
      types[t].outstanding += m.totalOutstanding;
    }
    return Object.entries(types).sort((a, b) => b[1].count - a[1].count);
  }, [openMatters]);

  // Matters by area for expandable sections
  const mattersByArea = useMemo(() => {
    const map = new Map<string, EnrichedMatter[]>();
    for (const m of openMatters) {
      const area = m.practiceArea || 'Uncategorized';
      if (!map.has(area)) map.set(area, []);
      map.get(area)!.push(m);
    }
    for (const [, matters] of map) {
      matters.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    }
    return map;
  }, [openMatters]);

  // Contact coverage data
  const contactStats = useMemo(() => {
    const withBoth = openMatters.filter(m => m.phone && m.email).length;
    const phoneOnly = openMatters.filter(m => m.phone && !m.email).length;
    const emailOnly = openMatters.filter(m => !m.phone && m.email).length;
    const none = openMatters.filter(m => !m.phone && !m.email).length;
    return { withBoth, phoneOnly, emailOnly, none, total: openMatters.length };
  }, [openMatters]);

  // Recent cases (opened in last 30 days)
  const recentCases = useMemo(() => {
    return openMatters
      .filter(m => m.daysOpen <= 30)
      .sort((a, b) => a.daysOpen - b.daysOpen);
  }, [openMatters]);

  // Top outstanding matters
  const topOutstanding = useMemo(() => {
    return openMatters
      .filter(m => m.totalOutstanding > 0)
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .slice(0, 8);
  }, [openMatters]);

  // Revenue per area (for the donut-style horizontal chart)
  const totalAreaOutstanding = useMemo(
    () => areas.reduce((sum, a) => sum + a.outstanding, 0),
    [areas]
  );

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
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">
          Firm Overview
        </h1>
        <p className="text-[13px] text-[#98989D]">
          Operational snapshot across all {data?.stats?.openMatters || 0} open matters
          {data?.fetchedAt && (
            <span className="ml-2 text-[11px] text-[#C7C7CC]">
              &middot; live from Clio
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 loading-shimmer" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-64 loading-shimmer" />)}
          </div>
        </div>
      ) : data && data.matters ? (
        <>
          {/* Stat Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
            <StatCard
              label="Open Matters"
              value={data.stats.openMatters}
              icon={FolderOpen}
              accent="#007AFF"
              subtext={`${data.stats.totalMatters.toLocaleString()} total`}
            />
            <StatCard
              label="Outstanding"
              value={formatCompact(data.stats.totalOutstanding)}
              icon={DollarSign}
              accent="#FF3B30"
              subtext={`${data.stats.clientsOwing} clients owing`}
            />
            <StatCard
              label="Collection Rate"
              value={`${data.stats.collectionRate}%`}
              icon={TrendingUp}
              accent="#34C759"
              subtext={`${formatCompact(data.stats.totalPaid)} collected`}
            />
            <StatCard
              label="Phone Coverage"
              value={`${data.stats.openMatters > 0 ? Math.round((data.stats.withPhone / data.stats.openMatters) * 100) : 0}%`}
              icon={Phone}
              accent="#AF52DE"
              subtext={`${data.stats.withoutPhone} missing`}
            />
          </div>

          {/* Main Grid: 2 columns */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

            {/* LEFT: Case Aging Analysis */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-5">
                <Clock size={16} className="text-[#FF9500]" />
                <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Case Aging</h2>
                <span className="text-[11px] text-[#C7C7CC] mono ml-auto">
                  {openMatters.length} open
                </span>
              </div>

              <div className="space-y-4">
                {agingBuckets.map((bucket) => (
                  <div key={bucket.label}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: bucket.color }}
                        />
                        <span className="text-[13px] font-medium text-[#1D1D1F]">
                          {bucket.label}
                        </span>
                        <span className="text-[11px] text-[#98989D]">{bucket.range}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[13px] mono text-[#6E6E73]">
                          {bucket.count} matter{bucket.count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[13px] mono font-semibold" style={{ color: bucket.outstanding > 0 ? bucket.color : '#C7C7CC' }}>
                          {formatCompact(bucket.outstanding)}
                        </span>
                      </div>
                    </div>
                    <div className="progress-track" style={{ height: '6px' }}>
                      <div
                        className="progress-bar"
                        style={{
                          width: `${(bucket.count / maxBucketCount) * 100}%`,
                          background: bucket.color,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Aging summary */}
              <div className="mt-5 pt-4" style={{ borderTop: '1px solid #E5E5EA' }}>
                <div className="flex items-center gap-2 text-[12px]">
                  {agingBuckets[2].count + agingBuckets[3].count > 0 ? (
                    <>
                      <AlertTriangle size={13} className="text-[#FF9500]" />
                      <span className="text-[#6E6E73]">
                        <span className="font-semibold text-[#FF3B30]">
                          {agingBuckets[2].count + agingBuckets[3].count}
                        </span>
                        {' '}matters over 180 days with{' '}
                        <span className="font-semibold text-[#FF3B30] mono">
                          {formatCompact(agingBuckets[2].outstanding + agingBuckets[3].outstanding)}
                        </span>
                        {' '}outstanding
                      </span>
                    </>
                  ) : (
                    <span className="text-[#34C759]">All matters within healthy age range</span>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: Practice Area Breakdown */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 size={16} className="text-[#B8860B]" />
                <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Practice Areas</h2>
                <span className="text-[11px] text-[#C7C7CC] mono ml-auto">
                  {areas.length} areas
                </span>
              </div>

              <div className="space-y-3">
                {areas.map((area) => {
                  const ac = areaColors[area.name] || { color: '#8E8E93', bg: 'rgba(142,142,147,0.08)' };
                  const areaMatters = mattersByArea.get(area.name) || [];
                  const isExpanded = expandedArea === area.name;
                  const pctOfTotal = totalAreaOutstanding > 0
                    ? Math.round((area.outstanding / totalAreaOutstanding) * 100)
                    : 0;

                  return (
                    <div key={area.name}>
                      <div
                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-[#F5F5F7]"
                        onClick={() => setExpandedArea(isExpanded ? null : area.name)}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                          style={{ background: ac.bg, color: ac.color }}
                        >
                          {area.count}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[13px] font-medium text-[#1D1D1F]">{area.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[12px] mono" style={{ color: area.outstanding > 0 ? '#FF3B30' : '#C7C7CC' }}>
                                {formatCompact(area.outstanding)}
                              </span>
                              {isExpanded
                                ? <ChevronDown size={14} className="text-[#98989D]" />
                                : <ChevronRight size={14} className="text-[#C7C7CC]" />
                              }
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="progress-track flex-1" style={{ height: '4px' }}>
                              <div
                                className="progress-bar"
                                style={{
                                  width: `${(area.count / maxAreaCount) * 100}%`,
                                  background: ac.color,
                                  opacity: 0.6,
                                }}
                              />
                            </div>
                            <span className="text-[10px] mono text-[#98989D] w-8 text-right">{pctOfTotal}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded matters for this area */}
                      {isExpanded && areaMatters.length > 0 && (
                        <div className="ml-12 mr-3 mb-2 animate-fade-in">
                          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid #E5E5EA' }}>
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Client</th>
                                  <th>Matter</th>
                                  <th className="text-right">Outstanding</th>
                                  <th className="text-right">Days</th>
                                  <th className="text-center">Contact</th>
                                </tr>
                              </thead>
                              <tbody>
                                {areaMatters.slice(0, 10).map(m => (
                                  <tr key={m.id}>
                                    <td>
                                      <span className="text-[#1D1D1F] text-[12px] font-medium">{m.clientName}</span>
                                    </td>
                                    <td>
                                      <span className="mono text-[11px] text-[#007AFF]">{m.displayNumber}</span>
                                    </td>
                                    <td className="text-right">
                                      <span className="mono text-[12px]" style={{ color: m.totalOutstanding > 0 ? '#FF3B30' : '#C7C7CC' }}>
                                        {formatCurrency(m.totalOutstanding)}
                                      </span>
                                    </td>
                                    <td className="text-right">
                                      <span className="mono text-[12px]" style={{
                                        color: m.daysOpen > 365 ? '#FF3B30' : m.daysOpen > 180 ? '#FF9500' : '#98989D'
                                      }}>
                                        {m.daysOpen}d
                                      </span>
                                    </td>
                                    <td className="text-center">
                                      {m.phone ? (
                                        <Phone size={12} className="inline text-[#34C759]" />
                                      ) : m.email ? (
                                        <span className="text-[11px] text-[#007AFF]">@</span>
                                      ) : (
                                        <PhoneOff size={12} className="inline text-[#FF3B30]" />
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {areaMatters.length > 10 && (
                                  <tr>
                                    <td colSpan={5} className="text-center text-[11px] text-[#98989D] py-2">
                                      + {areaMatters.length - 10} more
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
            </div>
          </div>

          {/* Second Row: 3 columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

            {/* Contact Coverage */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-5">
                <Users size={16} className="text-[#007AFF]" />
                <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Contact Coverage</h2>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Phone + Email', count: contactStats.withBoth, color: '#34C759', icon: '✓✓' },
                  { label: 'Phone Only', count: contactStats.phoneOnly, color: '#007AFF', icon: '📞' },
                  { label: 'Email Only', count: contactStats.emailOnly, color: '#FF9500', icon: '✉' },
                  { label: 'No Contact Info', count: contactStats.none, color: '#FF3B30', icon: '⚠' },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-[14px] w-5 text-center">{row.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] text-[#6E6E73]">{row.label}</span>
                        <span className="text-[13px] mono font-medium" style={{ color: row.color }}>
                          {row.count}
                        </span>
                      </div>
                      <div className="progress-track" style={{ height: '3px' }}>
                        <div
                          className="progress-bar"
                          style={{
                            width: `${contactStats.total > 0 ? (row.count / contactStats.total) * 100 : 0}%`,
                            background: row.color,
                            opacity: 0.6,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: '1px solid #E5E5EA' }}>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#98989D]">Overall reachability</span>
                  <span className="mono font-semibold" style={{
                    color: contactStats.total > 0 && ((contactStats.withBoth + contactStats.phoneOnly) / contactStats.total) >= 0.7 ? '#34C759' : '#FF9500'
                  }}>
                    {contactStats.total > 0 ? Math.round(((contactStats.withBoth + contactStats.phoneOnly + contactStats.emailOnly) / contactStats.total) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Client Types */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-5">
                <Users size={16} className="text-[#B8860B]" />
                <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Client Types</h2>
              </div>

              <div className="space-y-4">
                {clientTypes.map(([type, stats]) => {
                  const typeColor = type === 'Person' ? '#007AFF' : type === 'Company' ? '#B8860B' : '#8E8E93';
                  const typeBg = type === 'Person' ? 'rgba(0,122,255,0.08)' : type === 'Company' ? 'rgba(184,134,11,0.08)' : 'rgba(142,142,147,0.08)';
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ background: typeBg, color: typeColor }}
                          >
                            {type}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[12px] mono text-[#6E6E73]">{stats.count}</span>
                          <span className="text-[12px] mono" style={{ color: stats.outstanding > 0 ? '#FF3B30' : '#C7C7CC' }}>
                            {formatCompact(stats.outstanding)}
                          </span>
                        </div>
                      </div>
                      <div className="progress-track" style={{ height: '4px' }}>
                        <div
                          className="progress-bar"
                          style={{
                            width: `${(stats.count / (openMatters.length || 1)) * 100}%`,
                            background: typeColor,
                            opacity: 0.5,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Type ratio */}
              <div className="mt-5 pt-3" style={{ borderTop: '1px solid #E5E5EA' }}>
                <div className="flex items-center gap-1 text-[11px] text-[#98989D]">
                  <span>
                    {clientTypes.find(([t]) => t === 'Person')?.[1].count || 0} individuals,{' '}
                    {clientTypes.find(([t]) => t === 'Company')?.[1].count || 0} businesses
                  </span>
                </div>
              </div>
            </div>

            {/* Firm Totals */}
            <div className="card-brand p-6">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp size={16} className="text-[#B8860B]" />
                  <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Firm Totals</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Total Billed</p>
                    <p className="text-[24px] font-bold mono text-[#1D1D1F] tracking-tight">
                      {formatCompact(data.stats.totalBilled)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Collected</p>
                      <p className="text-[18px] font-bold mono text-[#34C759]">
                        {formatCompact(data.stats.totalPaid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Outstanding</p>
                      <p className="text-[18px] font-bold mono text-[#FF3B30]">
                        {formatCompact(data.stats.totalOutstanding)}
                      </p>
                    </div>
                  </div>

                  {/* Collection bar */}
                  <div>
                    <div className="flex justify-between text-[10px] mb-1.5">
                      <span className="text-[#98989D] uppercase tracking-wider font-semibold">Collection Rate</span>
                      <span className="mono font-bold text-[#B8860B]">{data.stats.collectionRate}%</span>
                    </div>
                    <div className="progress-track" style={{ height: '8px' }}>
                      <div
                        className="progress-bar"
                        style={{
                          width: `${data.stats.collectionRate}%`,
                          background: 'linear-gradient(90deg, #B8860B, #D4A017)',
                        }}
                      />
                    </div>
                  </div>

                  <div className="h-px bg-[#E5E5EA]" />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-[#98989D] uppercase tracking-wider font-semibold mb-0.5">With Phone</p>
                      <p className="text-[14px] mono font-semibold text-[#34C759]">{data.stats.withPhone}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#98989D] uppercase tracking-wider font-semibold mb-0.5">No Phone</p>
                      <p className="text-[14px] mono font-semibold text-[#FF3B30]">{data.stats.withoutPhone}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Third Row: Top Outstanding + Recent Cases */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Top Outstanding */}
            <div className="card overflow-hidden">
              <div className="p-5 pb-3">
                <div className="flex items-center gap-2">
                  <ArrowUpRight size={16} className="text-[#FF3B30]" />
                  <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Highest Outstanding</h2>
                  <span className="text-[11px] text-[#C7C7CC] mono ml-auto">
                    top {topOutstanding.length}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Area</th>
                      <th className="text-right">Outstanding</th>
                      <th className="text-right">Days</th>
                      <th className="text-center">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topOutstanding.map((m, i) => (
                      <tr key={m.id}>
                        <td>
                          <div>
                            <p className="text-[13px] font-medium text-[#1D1D1F]">{m.clientName}</p>
                            <p className="text-[10px] mono text-[#C7C7CC] mt-0.5">{m.displayNumber}</p>
                          </div>
                        </td>
                        <td>
                          {m.practiceArea && m.practiceArea !== 'Uncategorized' ? (
                            <span className="badge badge-brand">{m.practiceArea}</span>
                          ) : (
                            <span className="text-[12px] text-[#C7C7CC]">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="text-right">
                          <span className="mono text-[13px] font-semibold" style={{ color: '#FF3B30' }}>
                            {formatCurrency(m.totalOutstanding)}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="mono text-[12px]" style={{
                            color: m.daysOpen > 365 ? '#FF3B30' : m.daysOpen > 180 ? '#FF9500' : '#98989D'
                          }}>
                            {m.daysOpen}d
                          </span>
                        </td>
                        <td className="text-center">
                          {m.phone ? (
                            <span className="badge badge-success" style={{ fontSize: '10px' }}>Has phone</span>
                          ) : (
                            <span className="badge badge-danger" style={{ fontSize: '10px' }}>Missing</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Cases */}
            <div className="card overflow-hidden">
              <div className="p-5 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-[#007AFF]" />
                  <h2 className="text-[15px] font-semibold text-[#1D1D1F]">Recently Opened</h2>
                  <span className="text-[11px] text-[#C7C7CC] mono ml-auto">
                    last 30 days &middot; {recentCases.length} case{recentCases.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              {recentCases.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Description</th>
                        <th>Area</th>
                        <th className="text-right">Opened</th>
                        <th className="text-center">Contact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCases.slice(0, 8).map(m => (
                        <tr key={m.id}>
                          <td>
                            <div>
                              <p className="text-[13px] font-medium text-[#1D1D1F]">{m.clientName}</p>
                              <p className="text-[10px] mono text-[#C7C7CC] mt-0.5">{m.displayNumber}</p>
                            </div>
                          </td>
                          <td>
                            <span className="text-[12px] text-[#6E6E73] truncate block max-w-[180px]">
                              {m.description || '\u2014'}
                            </span>
                          </td>
                          <td>
                            {m.practiceArea && m.practiceArea !== 'Uncategorized' ? (
                              <span className="badge badge-brand">{m.practiceArea}</span>
                            ) : (
                              <span className="text-[12px] text-[#C7C7CC]">{'\u2014'}</span>
                            )}
                          </td>
                          <td className="text-right">
                            <span className="text-[12px] text-[#98989D]">{m.openDate}</span>
                          </td>
                          <td className="text-center">
                            {m.phone ? (
                              <Phone size={12} className="inline text-[#34C759]" />
                            ) : m.email ? (
                              <span className="text-[11px] text-[#007AFF]">@</span>
                            ) : (
                              <PhoneOff size={12} className="inline text-[#FF3B30]" />
                            )}
                          </td>
                        </tr>
                      ))}
                      {recentCases.length > 8 && (
                        <tr>
                          <td colSpan={5} className="text-center text-[11px] text-[#98989D] py-3">
                            + {recentCases.length - 8} more recent cases
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-[13px] text-[#98989D]">No cases opened in the last 30 days</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] mt-4 text-[#C7C7CC] mono text-right">
            {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : ''}
          </p>
        </>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-[#FF3B30] text-sm">Failed to load data from Clio</p>
          <p className="text-[#98989D] text-xs mt-1">Check that Clio is connected and refresh the page</p>
        </div>
      )}
    </DashboardShell>
  );
}
