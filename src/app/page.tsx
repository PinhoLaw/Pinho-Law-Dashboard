'use client';

import { useEffect, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
import StatCard from '@/components/StatCard';
import { DollarSign, AlertTriangle, TrendingUp, Users, MessageCircle } from 'lucide-react';
import type { BillingSummary, OwingMatter } from '@/lib/types';

export default function WhoOwesMoney() {
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/billing')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = data?.owingMatters.filter((m: OwingMatter) =>
    !search ||
    m.clientName.toLowerCase().includes(search.toLowerCase()) ||
    m.clioMatter.toLowerCase().includes(search.toLowerCase()) ||
    m.responsiblePerson.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const formatCurrency = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getAmountColor = (amount: number) => {
    if (amount >= 5000) return '#FF3B30';
    if (amount >= 1000) return '#FF9500';
    return '#34C759';
  };

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">
          Collections
        </h1>
        <p className="text-[13px] text-[#98989D]">Outstanding balances across all active matters</p>
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
              label="Total Outstanding"
              value={formatCurrency(data.totalOutstanding)}
              icon={DollarSign}
              accent="#FF3B30"
            />
            <StatCard
              label="Clients Owing"
              value={data.clientsOwing}
              icon={AlertTriangle}
              accent="#FF9500"
              subtext={`of ${data.totalMatters} total matters`}
            />
            <StatCard
              label="Total Paid"
              value={formatCurrency(data.totalPaid)}
              icon={TrendingUp}
              accent="#34C759"
              subtext="from owing clients"
            />
            <StatCard
              label="Collection Rate"
              value={data.totalPaid + data.totalOutstanding > 0
                ? Math.round((data.totalPaid / (data.totalPaid + data.totalOutstanding)) * 100) + '%'
                : 'N/A'}
              icon={Users}
              accent="#007AFF"
              subtext="paid vs total billed"
            />
          </div>

          <div className="mb-5">
            <input
              type="text"
              placeholder="Search by client, matter #, or attorney..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full max-w-md px-4 py-2.5 input-field"
            />
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Client</th>
                    <th className="text-left">Matter</th>
                    <th className="text-right">Outstanding</th>
                    <th className="text-right">Paid</th>
                    <th className="text-left">Attorney</th>
                    <th className="text-left">Area</th>
                    <th className="text-center">Contact</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => (
                    <tr key={m.clioMatter + i}>
                      <td>
                        <p className="font-medium text-[#1D1D1F]">{m.clientName}</p>
                        <p className="text-[11px] mono text-[#98989D]">{m.clioMatter}</p>
                      </td>
                      <td>
                        <p className="text-[13px] truncate max-w-[200px] text-[#6E6E73]">{m.matterName}</p>
                      </td>
                      <td className="text-right">
                        <span
                          className="inline-block text-[13px] font-semibold mono"
                          style={{ color: getAmountColor(m.outstanding) }}
                        >
                          {formatCurrency(m.outstanding)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="text-[13px] mono text-[#34C759]">
                          {formatCurrency(m.paid)}
                        </span>
                      </td>
                      <td>
                        <span className="text-[13px] text-[#6E6E73]">{m.responsiblePerson}</span>
                      </td>
                      <td>
                        {m.area ? (
                          <span className="badge badge-info">{m.area}</span>
                        ) : (
                          <span className="text-[11px] text-[#C7C7CC]">—</span>
                        )}
                      </td>
                      <td className="text-center">
                        {m.whatsAppPhone ? (
                          <span className="badge badge-success">
                            {m.daysSinceLastWa ? `${m.daysSinceLastWa}d ago` : 'Has phone'}
                          </span>
                        ) : (
                          <span className="badge badge-danger">No phone</span>
                        )}
                      </td>
                      <td className="text-center">
                        {m.whatsAppPhone && (
                          <button
                            className="btn btn-ghost text-[12px] py-1 px-2.5"
                            title="Send WhatsApp follow-up"
                          >
                            <MessageCircle size={12} />
                            Follow up
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] mt-3 text-[#98989D]">
            Showing {filtered.length} of {data.clientsOwing} clients with outstanding balances
          </p>
        </>
      ) : (
        <p className="text-[#FF3B30]">Failed to load billing data</p>
      )}
    </DashboardShell>
  );
}
