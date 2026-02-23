'use client';

import { useEffect, useState, useMemo, Fragment } from 'react';
import DashboardShell from '@/components/DashboardShell';
import StatCard from '@/components/StatCard';
import { FolderOpen, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronRight, Mail, Phone as PhoneIcon } from 'lucide-react';

interface EnrichedMatter {
  id: number;
  displayNumber: string;
  description: string;
  status: string;
  openDate: string;
  closeDate: string;
  billable: boolean;
  clientName: string;
  clientType: string;
  clientId: number;
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

interface ClioStats {
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
}

interface ClioResponse {
  matters: EnrichedMatter[];
  stats: ClioStats;
  byArea: { name: string; count: number; outstanding: number }[];
  fetchedAt: string;
}

export default function AllMatters() {
  const [data, setData] = useState<ClioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'open' | 'archive'>('open');
  const [areaFilter, setAreaFilter] = useState('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/clio/matters')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const matters = data?.matters || [];

  const areas = useMemo(() => {
    const areaSet = new Set(matters.map(m => m.practiceArea).filter(Boolean));
    return Array.from(areaSet).sort();
  }, [matters]);

  const filtered = useMemo(() => {
    return matters
      .filter(m => {
        if (tab === 'open' && m.status === 'Closed') return false;
        if (tab === 'archive' && m.status !== 'Closed') return false;
        if (search) {
          const q = search.toLowerCase();
          if (!m.clientName.toLowerCase().includes(q) &&
              !m.displayNumber.toLowerCase().includes(q) &&
              !m.description.toLowerCase().includes(q) &&
              !m.responsibleAttorney.toLowerCase().includes(q)) return false;
        }
        if (areaFilter !== 'all' && m.practiceArea !== areaFilter) return false;
        return true;
      })
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [matters, search, tab, areaFilter]);

  const formatCurrency = (n: number) =>
    n ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';

  const formatCompact = (n: number) => {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return formatCurrency(n);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'Open') return 'badge-success';
    if (status === 'Closed') return 'badge-neutral';
    if (status === 'Pending') return 'badge-warning';
    return 'badge-info';
  };

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">
          All Matters
        </h1>
        <p className="text-[13px] text-[#98989D]">
          Complete case list from Clio
          {data ? ` \u00B7 ${data.stats.totalMatters.toLocaleString()} total` : ''}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 loading-shimmer" />)}
          </div>
          <div className="h-96 loading-shimmer" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
            <StatCard
              label="Total Matters"
              value={data.stats.totalMatters.toLocaleString()}
              icon={FolderOpen}
              accent="#007AFF"
            />
            <StatCard
              label="Open"
              value={data.stats.openMatters}
              icon={CheckCircle}
              accent="#34C759"
              subtext={`${Math.round((data.stats.openMatters / data.stats.totalMatters) * 100)}% of total`}
            />
            <StatCard
              label="Closed"
              value={data.stats.closedMatters.toLocaleString()}
              icon={Clock}
              accent="#98989D"
            />
            <StatCard
              label="With Balance"
              value={data.stats.clientsOwing}
              icon={AlertCircle}
              accent="#FF9500"
              subtext={formatCompact(data.stats.totalOutstanding)}
            />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => { setTab('open'); setExpanded(null); }}
              className={`pill ${tab === 'open' ? 'pill-active' : ''}`}
            >
              Open Cases
              <span className="ml-1.5 text-[11px] mono opacity-70">{data.stats.openMatters}</span>
            </button>
            <button
              onClick={() => { setTab('archive'); setExpanded(null); }}
              className={`pill ${tab === 'archive' ? 'pill-active' : ''}`}
            >
              Archive
              <span className="ml-1.5 text-[11px] mono opacity-70">{data.stats.closedMatters.toLocaleString()}</span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <input
              type="text"
              placeholder="Search matters..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-4 py-2.5 input-field flex-1 min-w-[200px]"
            />
            <select
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              className="px-3 py-2.5 select-field"
            >
              <option value="all">All Areas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-6"></th>
                    <th className="text-left">Matter #</th>
                    <th className="text-left">Client</th>
                    <th className="text-left">Description</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Area</th>
                    <th className="text-right">Outstanding</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Billed</th>
                    <th className="text-left">Open Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <Fragment key={m.id}>
                      <tr
                        className="cursor-pointer"
                        onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                      >
                        <td className="!pr-0">
                          {expanded === m.id
                            ? <ChevronDown size={14} className="text-[#98989D]" />
                            : <ChevronRight size={14} className="text-[#C7C7CC]" />
                          }
                        </td>
                        <td>
                          <span className="mono text-[12px] text-[#007AFF]">{m.displayNumber}</span>
                        </td>
                        <td>
                          <span className="font-medium text-[#1D1D1F]">{m.clientName}</span>
                        </td>
                        <td>
                          <span className="text-[13px] truncate block max-w-[220px] text-[#6E6E73]">
                            {m.description || '\u2014'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${getStatusBadge(m.status)}`}>{m.status}</span>
                        </td>
                        <td>
                          {m.practiceArea && m.practiceArea !== 'Uncategorized' ? (
                            <span className="badge badge-brand">{m.practiceArea}</span>
                          ) : (
                            <span className="text-[12px] text-[#C7C7CC]">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="text-right">
                          <span className="text-[13px] mono" style={{
                            color: m.totalOutstanding > 0 ? '#FF3B30' : '#C7C7CC'
                          }}>
                            {formatCurrency(m.totalOutstanding)}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="text-[13px] mono" style={{
                            color: m.totalPaid > 0 ? '#34C759' : '#C7C7CC'
                          }}>
                            {formatCurrency(m.totalPaid)}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="text-[13px] mono text-[#6E6E73]">
                            {formatCurrency(m.totalBilled)}
                          </span>
                        </td>
                        <td>
                          <span className="text-[12px] text-[#98989D]">{m.openDate || '\u2014'}</span>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {expanded === m.id && (
                        <tr>
                          <td colSpan={10} className="!bg-[#F5F5F7] !p-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5 animate-fade-in">
                              <div>
                                <p className="detail-label">Days Open</p>
                                <p className="detail-value mono" style={{
                                  color: m.daysOpen > 365 ? '#FF3B30' : m.daysOpen > 180 ? '#FF9500' : '#1D1D1F'
                                }}>
                                  {m.daysOpen} days
                                </p>
                              </div>
                              <div>
                                <p className="detail-label">Client Type</p>
                                <p className="detail-value">{m.clientType || '\u2014'}</p>
                              </div>
                              <div>
                                <p className="detail-label">Billable</p>
                                <p className="detail-value">{m.billable ? 'Yes' : 'No'}</p>
                              </div>
                              <div>
                                <p className="detail-label">Invoices</p>
                                <p className="detail-value mono">{m.billCount || 0}</p>
                              </div>
                              <div>
                                <p className="detail-label">Last Invoice</p>
                                <p className="detail-value">
                                  {m.lastInvoiceNumber ? (
                                    <span className="mono text-[12px]">
                                      #{m.lastInvoiceNumber}
                                      {m.lastInvoiceDate && (
                                        <span className="text-[#98989D] ml-1">
                                          ({m.lastInvoiceDate})
                                        </span>
                                      )}
                                    </span>
                                  ) : '\u2014'}
                                </p>
                              </div>
                              <div>
                                <p className="detail-label">Attorney</p>
                                <p className="detail-value">
                                  {m.responsibleAttorney || 'Unassigned'}
                                </p>
                              </div>
                              <div>
                                <p className="detail-label">Phone</p>
                                <p className="detail-value flex items-center gap-1.5">
                                  {m.phone ? (
                                    <>
                                      <PhoneIcon size={12} className="text-[#34C759]" />
                                      <span className="mono text-[12px]">{m.phone}</span>
                                    </>
                                  ) : (
                                    <span className="text-[#FF3B30] text-[12px]">Missing</span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="detail-label">Email</p>
                                <p className="detail-value flex items-center gap-1.5">
                                  {m.email ? (
                                    <>
                                      <Mail size={12} className="text-[#007AFF]" />
                                      <span className="text-[12px] truncate max-w-[180px]">{m.email}</span>
                                    </>
                                  ) : (
                                    <span className="text-[#98989D] text-[12px]">{'\u2014'}</span>
                                  )}
                                </p>
                              </div>
                              {m.closeDate && (
                                <div>
                                  <p className="detail-label">Closed</p>
                                  <p className="detail-value text-[12px]">{m.closeDate}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] mt-3 text-[#98989D]">
            Showing {filtered.length} of {matters.length} matters
            {'\u00A0\u00B7\u00A0'}Click a row for details
          </p>
        </>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-[#FF3B30] text-sm">Failed to load matters from Clio</p>
        </div>
      )}
    </DashboardShell>
  );
}
