'use client';

import { useEffect, useState } from 'react';

interface Task {
  id: string;
  clio_matter_id: string;
  client: string;
  matter_name: string;
  status: string;
  next_action: string;
  deadline: string;
  lead_attorney: string;
  assigned_to: string;
  risk_level: 'Normal' | 'Elevated' | 'Critical';
  days_since_contact: number;
  matter_type: string;
}

const COLUMNS = ['Open', 'Active', 'Pending Client', 'Pending Court', 'Closing'];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/state/tasks.json')
      .then(r => r.json())
      .then(data => {
        setTasks(data.matters || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.risk_level === filter);

  if (loading) return <div className="p-6 text-gray-400">Loading tasks...</div>;

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-gray-400">SOP §3-§5, §9 — Matter Lifecycle Kanban</p>
        </div>
        <div className="flex gap-2">
          {['all', 'Normal', 'Elevated', 'Critical'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-sm ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const colTasks = filtered.filter(t => t.status === col);
          return (
            <div key={col} className="kanban-column min-w-[280px] flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{col}</h3>
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{colTasks.length}</span>
              </div>
              {colTasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
              {colTasks.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-8">No matters</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const riskClass = task.risk_level === 'Critical' ? 'risk-critical' :
    task.risk_level === 'Elevated' ? 'risk-elevated' : 'risk-normal';
  const isOverdue = task.deadline < new Date().toISOString().split('T')[0];

  return (
    <div className={`kanban-card ${riskClass}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 font-mono">{task.clio_matter_id}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          task.risk_level === 'Critical' ? 'bg-red-500/20 text-red-400' :
          task.risk_level === 'Elevated' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-green-500/20 text-green-400'
        }`}>
          {task.risk_level}
        </span>
      </div>
      <p className="text-sm font-medium text-white mb-1">{task.client}</p>
      <p className="text-xs text-gray-400 mb-2">{task.matter_type}</p>
      <div className="border-t border-gray-700 pt-2 mt-2">
        <p className="text-xs text-gray-300">
          <span className="text-gray-500">Next:</span> {task.next_action}
        </p>
        <p className={`text-xs mt-1 ${isOverdue ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
          {isOverdue ? 'OVERDUE: ' : 'Due: '}{task.deadline}
        </p>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">{task.assigned_to}</span>
        {task.days_since_contact > 7 && (
          <span className="text-xs text-yellow-500">{task.days_since_contact}d no contact</span>
        )}
      </div>
    </div>
  );
}
