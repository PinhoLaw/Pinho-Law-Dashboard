'use client';

import { useEffect, useState, useMemo, Fragment, useCallback } from 'react';
import DashboardShell from '@/components/DashboardShell';
import StatCard from '@/components/StatCard';
import {
  FolderOpen, CheckCircle, Clock, AlertCircle,
  ChevronDown, ChevronRight, ChevronUp,
  Mail, Phone as PhoneIcon, PhoneOff,
  Search, Filter, X, Save, Loader2,
  Edit3, ExternalLink
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

type SortField = 'totalOutstanding' | 'totalPaid' | 'clientName' | 'daysOpen' | 'openDate';
type ContactFilter = 'all' | 'has-phone' | 'has-email' | 'no-contact';
type BalanceFilter = 'all' | 'has-balance' | 'no-balance' | 'over-1k' | 'over-5k' | 'over-10k';
type AgingFilter = 'all' | 'under-90' | '90-180' | '180-365' | 'over-365';
type ClientTypeFilter = 'all' | 'Person' | 'Company';

export default function AllMatters() {
  const [data, setData] = useState<ClioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'open' | 'archive'>('open');
  const [areaFilter, setAreaFilter] = useState('all');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('all');
  const [agingFilter, setAgingFilter] = useState<AgingFilter>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState<ClientTypeFilter>('all');
  const [sortField, setSortField] = useState<SortField>('totalOutstanding');
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editArea, setEditArea] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (areaFilter !== 'all') count++;
    if (contactFilter !== 'all') count++;
    if (balanceFilter !== 'all') count++;
    if (agingFilter !== 'all') count++;
    if (clientTypeFilter !== 'all') count++;
    return count;
  }, [areaFilter, contactFilter, balanceFilter, agingFilter, clientTypeFilter]);

  const clearAllFilters = () => {
    setAreaFilter('all');
    setContactFilter('all');
    setBalanceFilter('all');
    setAgingFilter('all');
    setClientTypeFilter('all');
    setSearch('');
  };

  const filtered = useMemo(() => {
    return matters
      .filter(m => {
        // Tab filter
        if (tab === 'open' && m.status === 'Closed') return false;
        if (tab === 'archive' && m.status !== 'Closed') return false;

        // Search
        if (search) {
          const q = search.toLowerCase();
          if (!m.clientName.toLowerCase().includes(q) &&
              !m.displayNumber.toLowerCase().includes(q) &&
              !m.description.toLowerCase().includes(q) &&
              !m.responsibleAttorney.toLowerCase().includes(q) &&
              !(m.phone && m.phone.includes(q)) &&
              !(m.email && m.email.toLowerCase().includes(q))) return false;
        }

        // Practice area
        if (areaFilter !== 'all' && m.practiceArea !== areaFilter) return false;

        // Contact
        if (contactFilter === 'has-phone' && !m.phone) return false;
        if (contactFilter === 'has-email' && !m.email) return false;
        if (contactFilter === 'no-contact' && (m.phone || m.email)) return false;

        // Balance
        if (balanceFilter === 'has-balance' && m.totalOutstanding <= 0) return false;
        if (balanceFilter === 'no-balance' && m.totalOutstanding > 0) return false;
        if (balanceFilter === 'over-1k' && m.totalOutstanding < 1000) return false;
        if (balanceFilter === 'over-5k' && m.totalOutstanding < 5000) return false;
        if (balanceFilter === 'over-10k' && m.totalOutstanding < 10000) return false;

        // Aging
        if (agingFilter === 'under-90' && m.daysOpen > 90) return false;
        if (agingFilter === '90-180' && (m.daysOpen < 90 || m.daysOpen > 180)) return false;
        if (agingFilter === '180-365' && (m.daysOpen < 180 || m.daysOpen > 365)) return false;
        if (agingFilter === 'over-365' && m.daysOpen < 365) return false;

        // Client type
        if (clientTypeFilter !== 'all' && m.clientType !== clientTypeFilter) return false;

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
  }, [matters, search, tab, areaFilter, contactFilter, balanceFilter, agingFilter, clientTypeFilter, sortField, sortAsc]);

  const formatCurrency = (n: number) =>
    n ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';

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

  const getStatusBadge = (status: string) => {
    if (status === 'Open') return 'badge-success';
    if (status === 'Closed') return 'badge-neutral';
    if (status === 'Pending') return 'badge-warning';
    return 'badge-info';
  };

  // Start editing
  const startEdit = useCallback((m: EnrichedMatter) => {
    setEditingId(m.id);
    setEditDescription(m.description || '');
    setEditStatus(m.status);
    setEditArea(m.practiceArea || '');
    setSaveMessage(null);
  }, []);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setSaveMessage(null);
  }, []);

  // Save edits to Clio
  const saveEdit = useCallback(async (matter: EnrichedMatter) => {
    setSaving(true);
    setSaveMessage(null);

    const updates: Record<string, string | undefined> = {};
    if (editDescription !== (matter.description || '')) updates.description = editDescription;
    if (editStatus !== matter.status) updates.status = editStatus;
    if (editArea !== (matter.practiceArea || '')) updates.practiceArea = editArea || undefined;

    if (Object.keys(updates).length === 0) {
      setSaveMessage({ type: 'success', text: 'No changes to save' });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/clio/update-matter', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: matter.id, ...updates }),
      });

      const result = await res.json();

      if (!res.ok) {
        setSaveMessage({ type: 'error', text: result.error || 'Failed to save' });
      } else {
        setSaveMessage({ type: 'success', text: 'Saved to Clio' });
        // Update local data
        if (data) {
          const updatedMatters = data.matters.map(m => {
            if (m.id !== matter.id) return m;
            return {
              ...m,
              description: editDescription,
              status: editStatus,
              practiceArea: editArea,
            };
          });
          setData({ ...data, matters: updatedMatters });
        }
        setTimeout(() => {
          setEditingId(null);
          setSaveMessage(null);
        }, 1500);
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'Network error' });
    }
    setSaving(false);
  }, [editDescription, editStatus, editArea, data]);

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">
          All Matters
        </h1>
        <p className="text-[13px] text-[#98989D]">
          Manage and filter your complete case list
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
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-children">
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
          <div className="flex items-center gap-2 mb-4">
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

          {/* Search + Filter Toggle */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98989D]" />
              <input
                type="text"
                placeholder="Search by name, matter #, description, phone, email..."
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
              <button
                onClick={clearAllFilters}
                className="text-[12px] text-[#FF3B30] hover:underline cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Filter Bar */}
          {showFilters && (
            <div className="card p-4 mb-4 animate-fade-in">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
                  <label className="detail-label block mb-1.5">Contact Info</label>
                  <select
                    value={contactFilter}
                    onChange={e => setContactFilter(e.target.value as ContactFilter)}
                    className="w-full px-3 py-2 select-field text-[12px]"
                  >
                    <option value="all">Any Contact</option>
                    <option value="has-phone">Has Phone</option>
                    <option value="has-email">Has Email</option>
                    <option value="no-contact">No Contact Info</option>
                  </select>
                </div>
                <div>
                  <label className="detail-label block mb-1.5">Balance</label>
                  <select
                    value={balanceFilter}
                    onChange={e => setBalanceFilter(e.target.value as BalanceFilter)}
                    className="w-full px-3 py-2 select-field text-[12px]"
                  >
                    <option value="all">Any Balance</option>
                    <option value="has-balance">Has Balance</option>
                    <option value="no-balance">No Balance</option>
                    <option value="over-1k">Over $1,000</option>
                    <option value="over-5k">Over $5,000</option>
                    <option value="over-10k">Over $10,000</option>
                  </select>
                </div>
                <div>
                  <label className="detail-label block mb-1.5">Case Age</label>
                  <select
                    value={agingFilter}
                    onChange={e => setAgingFilter(e.target.value as AgingFilter)}
                    className="w-full px-3 py-2 select-field text-[12px]"
                  >
                    <option value="all">Any Age</option>
                    <option value="under-90">Under 90 days</option>
                    <option value="90-180">90–180 days</option>
                    <option value="180-365">180–365 days</option>
                    <option value="over-365">Over 1 year</option>
                  </select>
                </div>
                <div>
                  <label className="detail-label block mb-1.5">Client Type</label>
                  <select
                    value={clientTypeFilter}
                    onChange={e => setClientTypeFilter(e.target.value as ClientTypeFilter)}
                    className="w-full px-3 py-2 select-field text-[12px]"
                  >
                    <option value="all">All Types</option>
                    <option value="Person">Individual</option>
                    <option value="Company">Business</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Results count */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] text-[#6E6E73]">
              <span className="font-semibold text-[#1D1D1F]">{filtered.length}</span>
              {' '}matter{filtered.length !== 1 ? 's' : ''}
              {(activeFilterCount > 0 || search) && (
                <span className="text-[#98989D]">
                  {' '}(filtered from {tab === 'open' ? data.stats.openMatters : data.stats.closedMatters.toLocaleString()})
                </span>
              )}
            </p>
            <p className="text-[11px] text-[#C7C7CC]">
              Click row to expand &middot; Click edit to modify in Clio
            </p>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-6"></th>
                    <th
                      className="text-left cursor-pointer select-none hover:text-[#6E6E73]"
                      onClick={() => handleSort('clientName')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Client <SortIcon field="clientName" />
                      </span>
                    </th>
                    <th className="text-left">Description</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Area</th>
                    <th
                      className="text-right cursor-pointer select-none hover:text-[#6E6E73]"
                      onClick={() => handleSort('totalOutstanding')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Outstanding <SortIcon field="totalOutstanding" />
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
                        Days <SortIcon field="daysOpen" />
                      </span>
                    </th>
                    <th className="text-center">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <Fragment key={m.id}>
                      <tr
                        className="cursor-pointer"
                        onClick={() => {
                          setExpanded(expanded === m.id ? null : m.id);
                          if (editingId && editingId !== m.id) cancelEdit();
                        }}
                      >
                        <td className="!pr-0">
                          {expanded === m.id
                            ? <ChevronDown size={14} className="text-[#98989D]" />
                            : <ChevronRight size={14} className="text-[#C7C7CC]" />
                          }
                        </td>
                        <td>
                          <p className="font-medium text-[#1D1D1F] text-[13px]">{m.clientName}</p>
                          <p className="text-[10px] mono text-[#C7C7CC] mt-0.5">{m.displayNumber}</p>
                        </td>
                        <td>
                          <span className="text-[12px] truncate block max-w-[200px] text-[#6E6E73]">
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
                            <span className="text-[11px] text-[#C7C7CC]">{'\u2014'}</span>
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
                          <span className="mono text-[12px]" style={{
                            color: m.daysOpen > 365 ? '#FF3B30' : m.daysOpen > 180 ? '#FF9500' : '#98989D'
                          }}>
                            {m.daysOpen}d
                          </span>
                        </td>
                        <td className="text-center">
                          {m.phone ? (
                            <PhoneIcon size={13} className="inline text-[#34C759]" />
                          ) : m.email ? (
                            <Mail size={13} className="inline text-[#007AFF]" />
                          ) : (
                            <PhoneOff size={13} className="inline text-[#FF3B30]" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail + edit row */}
                      {expanded === m.id && (
                        <tr>
                          <td colSpan={9} className="!bg-[#F5F5F7] !p-0">
                            <div className="p-5 animate-fade-in">
                              {/* Detail grid */}
                              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
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
                                  <p className="detail-label">Total Billed</p>
                                  <p className="detail-value mono">{formatCurrency(m.totalBilled)}</p>
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
                              </div>

                              {/* Contact row */}
                              <div className="flex flex-wrap gap-4 mb-4 p-3 rounded-lg bg-white border border-[#E5E5EA]">
                                <div className="flex items-center gap-2">
                                  <PhoneIcon size={13} className={m.phone ? 'text-[#34C759]' : 'text-[#FF3B30]'} />
                                  <span className="text-[12px]">
                                    {m.phone ? (
                                      <a href={`tel:${m.phone}`} className="mono text-[#007AFF] hover:underline">{m.phone}</a>
                                    ) : (
                                      <span className="text-[#FF3B30]">No phone</span>
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Mail size={13} className={m.email ? 'text-[#007AFF]' : 'text-[#98989D]'} />
                                  <span className="text-[12px]">
                                    {m.email ? (
                                      <a href={`mailto:${m.email}`} className="text-[#007AFF] hover:underline">{m.email}</a>
                                    ) : (
                                      <span className="text-[#98989D]">No email</span>
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 ml-auto">
                                  <span className="text-[11px] text-[#98989D]">Attorney:</span>
                                  <span className="text-[12px] text-[#1D1D1F]">{m.responsibleAttorney || 'Unassigned'}</span>
                                </div>
                              </div>

                              {/* Edit section */}
                              {editingId === m.id ? (
                                <div className="p-4 rounded-lg bg-white border border-[#007AFF]/20">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Edit3 size={13} className="text-[#007AFF]" />
                                    <span className="text-[12px] font-semibold text-[#007AFF]">Editing Matter</span>
                                    {saveMessage && (
                                      <span className={`text-[11px] ml-2 ${saveMessage.type === 'success' ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                                        {saveMessage.text}
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                    <div>
                                      <label className="detail-label block mb-1">Description</label>
                                      <input
                                        type="text"
                                        value={editDescription}
                                        onChange={e => setEditDescription(e.target.value)}
                                        className="w-full px-3 py-2 input-field text-[13px]"
                                        placeholder="Matter description..."
                                      />
                                    </div>
                                    <div>
                                      <label className="detail-label block mb-1">Status</label>
                                      <select
                                        value={editStatus}
                                        onChange={e => setEditStatus(e.target.value)}
                                        className="w-full px-3 py-2 select-field text-[13px]"
                                      >
                                        <option value="Open">Open</option>
                                        <option value="Pending">Pending</option>
                                        <option value="Closed">Closed</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="detail-label block mb-1">Practice Area</label>
                                      <select
                                        value={editArea}
                                        onChange={e => setEditArea(e.target.value)}
                                        className="w-full px-3 py-2 select-field text-[13px]"
                                      >
                                        <option value="">Uncategorized</option>
                                        {areas.map(a => <option key={a} value={a}>{a}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => saveEdit(m)}
                                      disabled={saving}
                                      className="btn btn-brand text-[12px]"
                                    >
                                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                      {saving ? 'Saving...' : 'Save to Clio'}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="btn btn-ghost text-[12px]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); startEdit(m); }}
                                  className="btn btn-ghost text-[12px] gap-1.5"
                                >
                                  <Edit3 size={12} />
                                  Edit Matter
                                </button>
                              )}

                              {m.closeDate && (
                                <p className="text-[11px] text-[#98989D] mt-3">
                                  Closed: {m.closeDate}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12">
                        <p className="text-[#98989D] text-[13px]">
                          {search || activeFilterCount > 0 ? 'No matters match your filters' : 'No matters found'}
                        </p>
                        {activeFilterCount > 0 && (
                          <button onClick={clearAllFilters} className="text-[12px] text-[#007AFF] mt-2 hover:underline">
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
              Showing {filtered.length} of {matters.length} matters
            </p>
            <p className="text-[11px] text-[#C7C7CC] mono">
              {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : ''}
            </p>
          </div>
        </>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-[#FF3B30] text-sm">Failed to load matters from Clio</p>
        </div>
      )}
    </DashboardShell>
  );
}
