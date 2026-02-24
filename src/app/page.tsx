'use client';

import { useEffect, useState, useMemo } from 'react';
import DashboardShell from '@/components/DashboardShell';
import {
  DollarSign, ChevronDown, ChevronUp,
  Phone as PhoneIcon, Mail, PhoneOff,
  Search, Filter, X
} from 'lucide-react';

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
  fetchedAt: string;
}

type SortField = 'totalOutstanding' | 'totalPaid' | 'clientName' | 'daysOpen';
type ContactFilter = 'all' | 'has-phone' | 'no-phone';
type AmountFilter = 'all' | 'over-1k' | 'over-5k' | 'over-10k';
type AreaFilter = string;

export default function Collections() {
  const [data, setData] = useState<ClioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalOutstanding');
  const [sortAsc, setSortAsc] = useState(false);
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [amountFilter, setAmountFilter] = useState<AmountFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetch('/api/clio/matters')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const areas = useMemo(() => {
    if (!data?.matters) return [];
    const set = new Set(
      data.matters
        .filter(m => m.status === 'Open' && m.totalOutstanding > 0 && m.practiceArea)
        .map(m => m.practiceArea)
    );
    return Array.from(set).sort();
  }, [data]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (areaFilter !== 'all') c++;
    if (contactFilter !== 'all') c++;
    if (amountFilter !== 'all') c++;
    return c;
  }, [areaFilter, contactFilter, amountFilter]);

  const clearAll = () => {
    setAreaFilter('all');
    setContactFilter('all');
    setAmountFilter('all');
    setSearch('');
  };

  const owingMatters = useMemo(() => {
    if (!data?.matters) return [];
    return data.matters
      .filter(m => {
        if (m.status !== 'Open' || m.totalOutstanding <= 0) return false;

        if (search) {
          const q = search.toLowerCase();
          if (!m.clientName.toLowerCase().includes(q) &&
              !m.displayNumber.toLowerCase().includes(q) &&
              !m.description.toLowerCase().includes(q) &&
              !(m.phone && m.phone.includes(q)) &&
              !(m.email && m.email.toLowerCase().includes(q))) return false;
        }

        if (areaFilter !== 'all' && m.practiceArea !== areaFilter) return false;

        if (contactFilter === 'has-phone' && !m.phone) return false;
        if (contactFilter === 'no-phone' && m.phone) return false;

        if (amountFilter === 'over-1k' && m.totalOutstanding < 1000) return false;
        if (amountFilter === 'over-5k' && m.totalOutstanding < 5000) return false;
        if (amountFilter === 'over-10k' && m.totalOutstanding < 10000) return false;

        return true;
      })
      .sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      });
  }, [data, search, sortField, sortAsc, areaFilter, contactFilter, amountFilter]);

  // Summary stats for filtered results
  const filteredStats = useMemo(() => {
    const totalOwed = owingMatters.reduce((sum, m) => sum + m.totalOutstanding, 0);
    const totalPaid = owingMatters.reduce((sum, m) => sum + m.totalPaid, 0);
    const withPhone = owingMatters.filter(m => m.phone).length;
    return { totalOwed, totalPaid, withPhone, count: owingMatters.length };
  }, [owingMatters]);

  const formatCurrency = (n: number) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatCompact = (n: number) => {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return formatCurrency(n);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  };

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">
          Collections
        </h1>
        <p className="text-[13px] text-[#98989D]">
          Who owes money — sorted by amount, ready to action
          {data?.fetchedAt && (
            <span className="ml-2 text-[11px] text-[#C7C7CC]">
              &middot; live from Clio
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-16 loading-shimmer" />
          <div className="h-96 loading-shimmer" />
        </div>
      ) : data ? (
        <>
          {/* Summary bar */}
          <div className="card p-4 mb-5">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[rgba(255,59,48,0.08)] flex items-center justify-center">
                  <DollarSign size={15} className="text-[#FF3B30]" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D]">Total Owed</p>
                  <p className="text-[18px] font-bold mono text-[#FF3B30]">{formatCompact(filteredStats.totalOwed)}</p>
                </div>
              </div>
              <div className="h-8 w-px bg-[#E5E5EA]" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D]">Matters</p>
                <p className="text-[15px] font-semibold mono text-[#1D1D1F]">{filteredStats.count}</p>
              </div>
              <div className="h-8 w-px bg-[#E5E5EA]" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D]">Reachable</p>
                <p className="text-[15px] font-semibold mono" style={{
                  color: filteredStats.count > 0 && (filteredStats.withPhone / filteredStats.count) >= 0.7 ? '#34C759' : '#FF9500'
                }}>
                  {filteredStats.withPhone} of {filteredStats.count}
                </p>
              </div>
              <div className="h-8 w-px bg-[#E5E5EA]" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D]">Collection Rate</p>
                <p className="text-[15px] font-semibold mono text-[#B8860B]">{data.stats.collectionRate}%</p>
              </div>
            </div>
          </div>

          {/* Search + Filter row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98989D]" />
              <input
                type="text"
                placeholder="Search by name, matter #, phone, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 input-field"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C7C7CC] hover:text-[#98989D]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn btn-ghost gap-2 ${showFilters ? '!border-[#007AFF] !text-[#007AFF]' : ''}`}
            >
              <Filter size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 w-5 h-5 rounded-full bg-[#007AFF] text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="text-[12px] text-[#FF3B30] hover:underline cursor-pointer">
                Clear all
              </button>
            )}
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div className="card p-4 mb-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="detail-label block mb-1.5">Practice Area</label>
                  <select
                    value={areaFilter}
                    onChange={e => setAreaFilter(e.target.value)}
                    className="w-full px-3 py-2 select-field text-[12px]"
                  >
                    <option value="all">All Areas</option>
                    {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="detail-label block mb-1.5">Phone Status</label>
                  <select
                    value={contactFilter}
                    onChange={e => setContactFilter(e.target.value as ContactFilter)}
                    className="w-full px-3 py-2 select-field text-[12px]"
                  >
                    <option value="all">All</option>
                    <option value="has-phone">Has Phone</option>
                    <option value="no-phone">Missing Phone</option>
                  </select>
                </div>
                <div>
                  <label className="detail-label block mb-1.5">Amount Owed</label>
                  <select
                    value={amountFilter}
                    onChange={e => setAmountFilter(e.target.value as AmountFilter)}
                    className="w-full px-3 py-2 select-field text-[12px]"
                  >
                    <option value="all">Any Amount</option>
                    <option value="over-1k">Over $1,000</option>
                    <option value="over-5k">Over $5,000</option>
                    <option value="over-10k">Over $10,000</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th
                      className="text-left cursor-pointer select-none hover:text-[#6E6E73]"
                      onClick={() => handleSort('clientName')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Client <SortIcon field="clientName" />
                      </span>
                    </th>
                    <th className="text-left">Matter</th>
                    <th className="text-left">Area</th>
                    <th
                      className="text-right cursor-pointer select-none hover:text-[#6E6E73]"
                      onClick={() => handleSort('totalOutstanding')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Owed <SortIcon field="totalOutstanding" />
                      </span>
                    </th>
                    <th
                      className="text-right cursor-pointer select-none hover:text-[#6E6E73]"
                      onClick={() => handleSort('totalPaid')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Paid <SortIcon field="totalPaid" />
                      </span>
                    </th>
                    <th
                      className="text-right cursor-pointer select-none hover:text-[#6E6E73]"
                      onClick={() => handleSort('daysOpen')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Age <SortIcon field="daysOpen" />
                      </span>
                    </th>
                    <th className="text-left">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {owingMatters.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <p className="font-medium text-[#1D1D1F] text-[13px]">{m.clientName}</p>
                        <p className="text-[10px] mono text-[#C7C7CC] mt-0.5">{m.displayNumber}</p>
                      </td>
                      <td>
                        <p className="text-[12px] truncate max-w-[180px] text-[#6E6E73]">
                          {m.description || '\u2014'}
                        </p>
                      </td>
                      <td>
                        {m.practiceArea && m.practiceArea !== 'Uncategorized' ? (
                          <span className="badge badge-brand">{m.practiceArea}</span>
                        ) : (
                          <span className="text-[11px] text-[#C7C7CC]">{'\u2014'}</span>
                        )}
                      </td>
                      <td className="text-right">
                        <span
                          className="text-[13px] font-semibold mono"
                          style={{
                            color: m.totalOutstanding >= 5000 ? '#FF3B30'
                              : m.totalOutstanding >= 1000 ? '#FF9500'
                              : '#34C759'
                          }}
                        >
                          {formatCurrency(m.totalOutstanding)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="text-[13px] mono" style={{ color: m.totalPaid > 0 ? '#34C759' : '#C7C7CC' }}>
                          {formatCurrency(m.totalPaid)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="mono text-[12px]" style={{
                          color: m.daysOpen > 365 ? '#FF3B30' : m.daysOpen > 180 ? '#FF9500' : '#98989D'
                        }}>
                          {m.daysOpen}d
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          {m.phone ? (
                            <a href={`tel:${m.phone}`} className="flex items-center gap-1.5 text-[12px] mono text-[#007AFF] hover:underline">
                              <PhoneIcon size={12} className="text-[#34C759]" />
                              {m.phone}
                            </a>
                          ) : m.email ? (
                            <a href={`mailto:${m.email}`} className="flex items-center gap-1.5 text-[12px] text-[#007AFF] hover:underline truncate max-w-[160px]">
                              <Mail size={12} />
                              {m.email}
                            </a>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[11px] text-[#FF3B30]">
                              <PhoneOff size={12} />
                              No contact
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {owingMatters.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12">
                        <p className="text-[#98989D] text-[13px]">
                          {search || activeFilterCount > 0 ? 'No matters match your filters' : 'No outstanding balances'}
                        </p>
                        {activeFilterCount > 0 && (
                          <button onClick={clearAll} className="text-[12px] text-[#007AFF] mt-2 hover:underline">
                            Clear all filters
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-[#98989D]">
              {owingMatters.length} matters with outstanding balances
              {(search || activeFilterCount > 0) && ` (filtered from ${data.stats.clientsOwing})`}
            </p>
            <p className="text-[11px] text-[#C7C7CC] mono">
              {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : ''}
            </p>
          </div>
        </>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-[#FF3B30] text-sm">Failed to load Clio data</p>
          <p className="text-[#98989D] text-xs mt-1">Check that Clio is connected and refresh the page</p>
        </div>
      )}
    </DashboardShell>
  );
}
