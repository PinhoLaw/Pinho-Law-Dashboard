'use client';

import { useEffect, useState } from 'react';

interface BillingMatter {
  clio_matter_id: string;
  client: string;
  matter_name: string;
  responsible_attorney: string;
  billing_type: string;
  total_paid: number;
  total_outstanding: number;
  total_billable_hours: number;
  days_since_payment: number;
  followup_needed: boolean;
  time_entries: any[];
}

export default function BillingPage() {
  const [matters, setMatters] = useState<BillingMatter[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/state/billing_ledger.json')
      .then(r => r.json())
      .then(data => {
        setMatters(data.matters || []);
        setSummary(data.summary || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleApproveToClio(matterId: string) {
    setSyncing(matterId);
    try {
      const res = await fetch('/api/clio/sync-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clio_matter_id: matterId }),
      });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();
      alert(`Synced ${data.entries_synced} entries to Clio for ${matterId}`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSyncing(null);
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading billing...</div>;

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing Ledger</h1>
          <p className="text-sm text-gray-400">SOP §8 — Time Entries, Invoices & Collections</p>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="metric-card">
            <p className="text-xs text-gray-500">Outstanding</p>
            <p className="text-xl font-bold text-red-400">${summary.total_outstanding?.toLocaleString()}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Paid</p>
            <p className="text-xl font-bold text-green-400">${summary.total_paid?.toLocaleString()}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Billable Hours</p>
            <p className="text-xl font-bold text-white">{summary.total_billable_hours?.toFixed(1)}h</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Clients w/ Balance</p>
            <p className="text-xl font-bold text-yellow-400">{summary.clients_with_balance}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Total Matters</p>
            <p className="text-xl font-bold text-white">{summary.total_matters}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-left">
              <th className="py-3 px-2">Matter</th>
              <th className="py-3 px-2">Client</th>
              <th className="py-3 px-2">Attorney</th>
              <th className="py-3 px-2">Type</th>
              <th className="py-3 px-2 text-right">Paid</th>
              <th className="py-3 px-2 text-right">Outstanding</th>
              <th className="py-3 px-2 text-right">Hours</th>
              <th className="py-3 px-2">Days</th>
              <th className="py-3 px-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {matters.map(m => (
              <tr key={m.clio_matter_id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-3 px-2 font-mono text-xs text-indigo-400">{m.clio_matter_id}</td>
                <td className="py-3 px-2 text-white">{m.client}</td>
                <td className="py-3 px-2 text-gray-400">{m.responsible_attorney}</td>
                <td className="py-3 px-2 text-gray-400">{m.billing_type}</td>
                <td className="py-3 px-2 text-right text-green-400">${m.total_paid.toFixed(2)}</td>
                <td className={`py-3 px-2 text-right ${m.total_outstanding > 0 ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                  ${m.total_outstanding.toFixed(2)}
                </td>
                <td className="py-3 px-2 text-right text-gray-400">{m.total_billable_hours.toFixed(1)}</td>
                <td className={`py-3 px-2 ${m.days_since_payment > 30 ? 'text-yellow-500' : 'text-gray-500'}`}>
                  {m.days_since_payment}d
                </td>
                <td className="py-3 px-2">
                  <button
                    onClick={() => handleApproveToClio(m.clio_matter_id)}
                    disabled={syncing === m.clio_matter_id}
                    className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-50"
                  >
                    {syncing === m.clio_matter_id ? 'Syncing...' : 'Approve → Clio'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
