'use client';

import { useEffect, useState, useMemo } from 'react';
import DashboardShell from '@/components/DashboardShell';
import StatCard from '@/components/StatCard';
import { DollarSign, AlertTriangle, TrendingUp, Percent, Phone, ChevronDown, ChevronUp } from 'lucide-react';

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
  fetchedAt: string;
}

type SortField = 'totalOutstanding' | 'totalPaid' | 'clientName' | 'daysOpen' | 'totalBilled';

export default function Collections() {
  const [data, setData] = useState<ClioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalOutstanding');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch('/api/clio/matters')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const owingMatters = useMemo(() => {
    if (!data?.matters) return [];
    return data.matters
      .filter(m => m.status === 'Open' && m.totalOutstanding > 0)
      .filter(m =>
        !search ||
        m.clientName.toLowerCase().includes(search.toLowerCase()) ||
        m.displayNumber.toLowerCase().includes(search.toLowerCase()) ||
        m.description.toLowerCase().includes(search.toLowerCase()) ||
        m.responsibleAttorney.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      });
  }, [data, search, sortField, sortAsc]);

  const formatCurrency = (n: number) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatCompact = (n: number) => {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return formatCurrency(n);
  };

  const getAmountColor = (amount: number) => {
    if (amount >= 5000) return '#FF3B30';
    if (amount >= 1000) return '#FF9500';
    return '#34C759';
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
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">
          Collections
        </h1>
        <p className="text-[13px] text-[#98989D]">
          Outstanding balances across all open matters
          {data?.fetchedAt && (
            <span className="ml-2 text-[11px] text-[#C7C7CC]">
              &middot; live from Clio
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[1,2,3,4,5].map(i => <div key={i} className="h-24 loading-shimmer" />)}
          </div>
          <div className="h-96 loading-shimmer" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8 stagger-children">
            <StatCard
              label="Total Outstanding"
              value={formatCompact(data.stats.totalOutstanding)}
              icon={DollarSign}
              accent="#FF3B30"
              subtext={`across ${owingMatters.length} matters`}
            />
            <StatCard
              label="Clients Owing"
              value={data.stats.clientsOwing}
              icon={AlertTriangle}
              accent="#FF9500"
              subtext={`of ${data.stats.openMatters} open`}
            />
            <StatCard
              label="Total Collected"
              value={formatCompact(data.stats.totalPaid)}
              icon={TrendingUp}
              accent="#34C759"
              subtext={`${formatCompact(data.stats.totalBilled)} billed`}
            />
            <StatCard
              label="Collection Rate"
              value={`${data.stats.collectionRate}%`}
              icon={Percent}
              accent="#007AFF"
              subtext="paid vs billed"
            />
            <StatCard
              label="Phone Coverage"
              value={`${data.stats.withPhone}`}
              icon={Phone}
              accent="#AF52DE"
              subtext={`${data.stats.withoutPhone} missing`}
            />
          </div>

          <div className="mb-5">
            <input
              type="text"
              placeholder="Search by client, matter #, description, or attorney..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full max-w-lg px-4 py-2.5 input-field"
            />
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Client</th>
                    <th className="text-left">Matter</th>
                    <th
                      className="text-right cursor-pointer select-none hover:text-[#6E6E73] transition-colors"
                      onClick={() => handleSort('totalOutstanding')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Outstanding <SortIcon field="totalOutstanding" />
                      </span>
                    </th>
                    <th
                      className="text-right cursor-pointer select-none hover:text-[#6E6E73] transition-colors"
                      onClick={() => handleSort('totalPaid')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Paid <SortIcon field="totalPaid" />
                      </span>
                    </th>
                    <th className="text-left">Area</th>
                    <th
                      className="text-right cursor-pointer select-none hover:text-[#6E6E73] transition-colors"
                      onClick={() => handleSort('daysOpen')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Days Open <SortIcon field="daysOpen" />
                      </span>
                    </th>
                    <th className="text-center">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {owingMatters.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <p className="font-medium text-[#1D1D1F] text-[13px]">{m.clientName}</p>
                        <p className="text-[11px] mono text-[#C7C7CC] mt-0.5">{m.displayNumber}</p>
                      </td>
                      <td>
                        <p className="text-[13px] truncate max-w-[200px] text-[#6E6E73]">
                          {m.description || '\u2014'}
                        </p>
                      </td>
                      <td className="text-right">
                        <span
                          className="text-[13px] font-semibold mono"
                          style={{ color: getAmountColor(m.totalOutstanding) }}
                        >
                          {formatCurrency(m.totalOutstanding)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="text-[13px] mono" style={{ color: m.totalPaid > 0 ? '#34C759' : '#C7C7CC' }}>
                          {formatCurrency(m.totalPaid)}
                        </span>
                      </td>
                      <td>
                        {m.practiceArea && m.practiceArea !== 'Uncategorized' ? (
                          <span className="badge badge-info">{m.practiceArea}</span>
                        ) : (
                          <span className="text-[11px] text-[#C7C7CC]">{'\u2014'}</span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className="text-[13px] mono" style={{
                          color: m.daysOpen > 365 ? '#FF3B30' : m.daysOpen > 180 ? '#FF9500' : '#98989D'
                        }}>
                          {m.daysOpen}d
                        </span>
                      </td>
                      <td className="text-center">
                        {m.phone ? (
                          <span className="badge badge-success">Has phone</span>
                        ) : m.email ? (
                          <span className="badge badge-info">Email only</span>
                        ) : (
                          <span className="badge badge-danger">No contact</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {owingMatters.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-[#98989D]">
                        {search ? 'No results match your search' : 'No outstanding balances found'}
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
              {search && ` (filtered from ${data.stats.clientsOwing})`}
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
