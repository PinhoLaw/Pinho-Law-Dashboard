'use client';

import { useEffect, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
import StatCard from '@/components/StatCard';
import { FolderOpen, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import type { Matter } from '@/lib/types';

export default function AllMatters() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/matters')
      .then(r => r.json())
      .then(d => { setMatters(d.matters || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const statuses = [...new Set(matters.map(m => m.statusClio).filter(Boolean))];
  const areas = [...new Set(matters.map(m => m.area).filter(Boolean))];
  const persons = [...new Set(matters.map(m => m.responsiblePerson).filter(Boolean))];

  const filtered = matters.filter(m => {
    if (search && !m.clientFullName.toLowerCase().includes(search.toLowerCase()) &&
        !m.clioMatter.toLowerCase().includes(search.toLowerCase()) &&
        !m.matterName.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && m.statusClio !== statusFilter) return false;
    if (areaFilter !== 'all' && m.area !== areaFilter) return false;
    if (personFilter !== 'all' && m.responsiblePerson !== personFilter) return false;
    return true;
  });

  const active = matters.filter(m => m.statusClio !== 'Closed').length;
  const closed = matters.filter(m => m.statusClio === 'Closed').length;
  const withOutstanding = matters.filter(m => Number(m.clioOutstanding) > 0).length;

  const formatCurrency = (n: number) => n ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';

  const getStatusBadge = (status: string) => {
    if (status === 'Open') return 'badge-success';
    if (status === 'Closed') return 'badge-neutral';
    return 'badge-warning';
  };

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">All Matters</h1>
        <p className="text-[13px] text-[#98989D]">Complete case list from the Ongoing tab</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 loading-shimmer" />)}
          </div>
          <div className="h-96 loading-shimmer" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
            <StatCard label="Total Matters" value={matters.length} icon={FolderOpen} accent="#007AFF" />
            <StatCard label="Active" value={active} icon={CheckCircle} accent="#34C759" />
            <StatCard label="Closed" value={closed} icon={Clock} accent="#98989D" />
            <StatCard label="With Balance" value={withOutstanding} icon={AlertCircle} accent="#FF9500" />
          </div>

          <div className="flex flex-wrap gap-3 mb-5">
            <input
              type="text"
              placeholder="Search matters..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-4 py-2.5 input-field flex-1 min-w-[200px]"
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 select-field">
              <option value="all">All Status</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="px-3 py-2.5 select-field">
              <option value="all">All Areas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} className="px-3 py-2.5 select-field">
              <option value="all">All Attorneys</option>
              {persons.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Matter #</th>
                    <th className="text-left">Client</th>
                    <th className="text-left">Matter Name</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Area</th>
                    <th className="text-left">Attorney</th>
                    <th className="text-right">Outstanding</th>
                    <th className="text-right">Paid</th>
                    <th className="text-left">Open Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <>
                      <tr
                        key={m.clioMatter}
                        className="cursor-pointer"
                        onClick={() => setExpanded(expanded === m.clioMatter ? null : m.clioMatter)}
                      >
                        <td><span className="mono text-[12px] text-[#007AFF]">{m.clioMatter}</span></td>
                        <td><span className="font-medium text-[#1D1D1F]">{m.clientFullName}</span></td>
                        <td><span className="text-[13px] truncate block max-w-[220px] text-[#6E6E73]">{m.matterName}</span></td>
                        <td><span className={`badge ${getStatusBadge(m.statusClio)}`}>{m.statusClio}</span></td>
                        <td><span className="text-[12px] text-[#6E6E73]">{m.area || '—'}</span></td>
                        <td><span className="text-[13px] text-[#6E6E73]">{m.responsiblePerson || '—'}</span></td>
                        <td className="text-right">
                          <span className="text-[13px] mono" style={{ color: Number(m.clioOutstanding) > 0 ? '#FF3B30' : '#C7C7CC' }}>
                            {formatCurrency(Number(m.clioOutstanding))}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="text-[13px] mono" style={{ color: Number(m.clioPaid) > 0 ? '#34C759' : '#C7C7CC' }}>
                            {formatCurrency(Number(m.clioPaid))}
                          </span>
                        </td>
                        <td><span className="text-[12px] text-[#98989D]">{m.openDate || '—'}</span></td>
                      </tr>
                      {expanded === m.clioMatter && (
                        <tr key={`${m.clioMatter}-detail`}>
                          <td colSpan={9} className="!bg-[#F5F5F7] !p-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px] animate-fade-in">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Current Status</p>
                                <p className="text-[#1D1D1F]">{m.currentStatus || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">WhatsApp Phone</p>
                                <p style={{ color: m.whatsAppPhone ? '#34C759' : '#FF3B30' }}>{m.whatsAppPhone || 'Missing'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Last WA Sent</p>
                                <p className="text-[#6E6E73]">{m.lastWaSent || 'Never'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Notes</p>
                                <p className="text-[#6E6E73]">{m.notes || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Observations</p>
                                <p className="text-[#6E6E73]">{m.observations || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Next Step</p>
                                <p className="text-[#6E6E73]">{m.nextStepAndWho || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Billable</p>
                                <p className="text-[#6E6E73]">{formatCurrency(m.clioBillable)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Non-Billable</p>
                                <p className="text-[#6E6E73]">{formatCurrency(m.clioNonBillable)}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] mt-3 text-[#98989D]">
            Showing {filtered.length} of {matters.length} matters · Click a row for details
          </p>
        </>
      )}
    </DashboardShell>
  );
}
