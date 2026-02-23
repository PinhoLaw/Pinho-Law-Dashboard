'use client';

import { useEffect, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
import StatCard from '@/components/StatCard';
import { Building2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { SunbizEntity } from '../api/sunbiz/route';

interface SunbizData {
  entities: SunbizEntity[];
  count: number;
  stats: { active: number; inactive: number; needReinstatement: number };
}

export default function SunbizPage() {
  const [data, setData] = useState<SunbizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/sunbiz')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = (data?.entities || []).filter(e => {
    if (search && !e.entityName.toLowerCase().includes(search.toLowerCase()) &&
        !e.entityNumber.toLowerCase().includes(search.toLowerCase()) &&
        !e.authorizedPersons.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'active' && e.currentStatus?.toUpperCase() !== 'ACTIVE') return false;
    if (statusFilter === 'inactive' && e.currentStatus?.toUpperCase() === 'ACTIVE') return false;
    return true;
  });

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">Controle Sunbiz</h1>
        <p className="text-[13px] text-[#98989D]">Florida entity registrations, annual reports & status tracking</p>
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
            <StatCard label="Total Entities" value={data.count} icon={Building2} accent="#AF52DE" />
            <StatCard label="Active" value={data.stats.active} icon={CheckCircle} accent="#34C759" />
            <StatCard label="Inactive" value={data.stats.inactive} icon={XCircle} accent="#98989D" />
            <StatCard label="Need Reinstatement" value={data.stats.needReinstatement} icon={AlertTriangle} accent="#FF3B30" />
          </div>

          <div className="flex flex-wrap gap-3 mb-5">
            <input
              type="text"
              placeholder="Search entities..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-4 py-2.5 input-field flex-1 min-w-[200px]"
            />
            <div className="flex gap-2">
              {(['all', 'active', 'inactive'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`pill capitalize ${statusFilter === s ? 'pill-active' : ''}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">Entity Name</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Entity #</th>
                    <th className="text-left">Date Filed</th>
                    <th className="text-left">Officer / RA</th>
                    <th className="text-left">Last Annual</th>
                    <th className="text-center">Reinstatement</th>
                    <th className="text-right">Billed</th>
                    <th className="text-right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <>
                      <tr
                        key={e.entityNumber || i}
                        className="cursor-pointer"
                        onClick={() => setExpanded(expanded === (e.entityNumber || String(i)) ? null : (e.entityNumber || String(i)))}
                      >
                        <td>
                          <p className="font-medium text-[#1D1D1F]">{e.entityName}</p>
                          <p className="text-[11px] text-[#98989D]">{e.authorizedPersons ? e.authorizedPersons.substring(0, 50) : ''}</p>
                        </td>
                        <td>
                          <span className={`badge ${
                            e.currentStatus?.toUpperCase() === 'ACTIVE' ? 'badge-success' :
                            e.currentStatus?.toUpperCase() === 'INACTIVE' ? 'badge-danger' : 'badge-warning'
                          }`}>
                            {e.currentStatus}
                          </span>
                        </td>
                        <td><span className="mono text-[12px] text-[#AF52DE]">{e.entityNumber}</span></td>
                        <td><span className="text-[13px] text-[#6E6E73]">{e.dateFiled || '—'}</span></td>
                        <td><span className="text-[13px] text-[#6E6E73]">{e.officerRaName || '—'}</span></td>
                        <td><span className="text-[13px] text-[#6E6E73]">{e.lastAnnualReportDate || '—'}</span></td>
                        <td className="text-center">
                          {e.reinstatementNeeded?.toUpperCase() === 'YES' ? (
                            <span className="badge badge-danger">YES</span>
                          ) : (
                            <span className="text-[12px] text-[#C7C7CC]">No</span>
                          )}
                        </td>
                        <td className="text-right">
                          <span className="mono text-[13px] text-[#6E6E73]">
                            {e.billedAmount ? `$${e.billedAmount.toFixed(2)}` : '—'}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="mono text-[13px]" style={{ color: e.paidAmount > 0 ? '#34C759' : '#C7C7CC' }}>
                            {e.paidAmount ? `$${e.paidAmount.toFixed(2)}` : '—'}
                          </span>
                        </td>
                      </tr>
                      {expanded === (e.entityNumber || String(i)) && (
                        <tr key={`${e.entityNumber}-detail`}>
                          <td colSpan={9} className="!bg-[#F5F5F7] !p-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px] animate-fade-in">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">State</p>
                                <p className="text-[#1D1D1F]">{e.state || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">FEI/EIN</p>
                                <p className="text-[#1D1D1F]">{e.feiEin || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Last Event</p>
                                <p className="text-[#1D1D1F]">{e.lastEvent || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Clio Matter</p>
                                <p className="text-[#007AFF]">{e.clioMatter || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Principal Address</p>
                                <p className="text-[#6E6E73]">{e.principalAddress || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Phone</p>
                                <p style={{ color: e.phone ? '#34C759' : '#FF3B30' }}>{e.phone || 'Missing'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Email</p>
                                <p className="text-[#6E6E73]">{e.email || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Next Annual Due</p>
                                <p className="text-[#FF9500]">{e.nextAnnualDue || '—'}</p>
                              </div>
                              {e.observations && (
                                <div className="col-span-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#98989D] mb-1">Observations</p>
                                  <p className="text-[#6E6E73]">{e.observations}</p>
                                </div>
                              )}
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
            Showing {filtered.length} of {data.count} entities · Click row for details
          </p>
        </>
      ) : (
        <p className="text-[#FF3B30]">Failed to load Sunbiz data</p>
      )}
    </DashboardShell>
  );
}
