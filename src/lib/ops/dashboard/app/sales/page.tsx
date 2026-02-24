'use client';

import { useEffect, useState } from 'react';

interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  practice_area: string;
  stage: string;
  conflict_check: string;
  assigned_attorney: string;
  next_action: string;
  deadline: string;
  estimated_value: number;
  created_at: string;
}

const STAGES = [
  'New Lead', 'Contacted', 'Consultation Scheduled', 'Consultation Completed',
  'Proposal Sent', 'Engagement Signed', 'Conflict Check', 'Opened in Clio',
];

const STAGE_COLORS: Record<string, string> = {
  'New Lead': 'bg-blue-500/20 text-blue-400',
  'Contacted': 'bg-cyan-500/20 text-cyan-400',
  'Consultation Scheduled': 'bg-purple-500/20 text-purple-400',
  'Consultation Completed': 'bg-indigo-500/20 text-indigo-400',
  'Proposal Sent': 'bg-yellow-500/20 text-yellow-400',
  'Engagement Signed': 'bg-green-500/20 text-green-400',
  'Conflict Check': 'bg-orange-500/20 text-orange-400',
  'Opened in Clio': 'bg-emerald-500/20 text-emerald-400',
  'Lost': 'bg-gray-500/20 text-gray-400',
  'Disqualified': 'bg-red-500/20 text-red-400',
};

export default function SalesPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'pipeline' | 'table'>('pipeline');

  useEffect(() => {
    fetch('/api/state/sales_pipeline.json')
      .then(r => r.json())
      .then(data => {
        setLeads(data.leads || []);
        setSummary(data.summary || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-400">Loading pipeline...</div>;

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales Pipeline</h1>
          <p className="text-sm text-gray-400">SOP §2 — Client Intake & Onboarding</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('pipeline')}
            className={`px-3 py-1 rounded text-sm ${view === 'pipeline' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-3 py-1 rounded text-sm ${view === 'table' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Table
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="metric-card">
            <p className="text-xs text-gray-500">Total Leads</p>
            <p className="text-xl font-bold text-white">{summary.total_leads}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Estimated Value</p>
            <p className="text-xl font-bold text-green-400">${summary.total_estimated_value?.toLocaleString()}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Conversion Rate</p>
            <p className="text-xl font-bold text-indigo-400">{((summary.conversion_rate || 0) * 100).toFixed(0)}%</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-gray-500">Active Pipeline</p>
            <p className="text-xl font-bold text-white">
              {leads.filter(l => !['Lost', 'Disqualified'].includes(l.stage)).length}
            </p>
          </div>
        </div>
      )}

      {view === 'pipeline' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage);
            return (
              <div key={stage} className="kanban-column min-w-[240px] flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase">{stage}</h3>
                  <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{stageLeads.length}</span>
                </div>
                {stageLeads.map(lead => (
                  <div key={lead.id} className="kanban-card">
                    <p className="text-sm font-medium text-white">{lead.name}</p>
                    <p className="text-xs text-gray-400">{lead.practice_area}</p>
                    <p className="text-xs text-gray-500 mt-1">{lead.next_action}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-600">{lead.source}</span>
                      {lead.conflict_check === 'Pending' && (
                        <span className="text-xs text-orange-400">Conflict TBD</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-left">
                <th className="py-3 px-2">Name</th>
                <th className="py-3 px-2">Stage</th>
                <th className="py-3 px-2">Area</th>
                <th className="py-3 px-2">Source</th>
                <th className="py-3 px-2">Attorney</th>
                <th className="py-3 px-2">Conflict</th>
                <th className="py-3 px-2">Next Action</th>
                <th className="py-3 px-2">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-3 px-2 text-white font-medium">{l.name}</td>
                  <td className="py-3 px-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${STAGE_COLORS[l.stage] || 'bg-gray-800 text-gray-400'}`}>
                      {l.stage}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-gray-400">{l.practice_area}</td>
                  <td className="py-3 px-2 text-gray-500">{l.source}</td>
                  <td className="py-3 px-2 text-gray-400">{l.assigned_attorney}</td>
                  <td className={`py-3 px-2 text-xs ${
                    l.conflict_check === 'Cleared' ? 'text-green-400' :
                    l.conflict_check === 'Conflict Found' ? 'text-red-400' : 'text-orange-400'
                  }`}>{l.conflict_check}</td>
                  <td className="py-3 px-2 text-gray-400 text-xs">{l.next_action}</td>
                  <td className={`py-3 px-2 text-xs ${l.deadline < new Date().toISOString().split('T')[0] ? 'text-red-400' : 'text-gray-500'}`}>
                    {l.deadline}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
