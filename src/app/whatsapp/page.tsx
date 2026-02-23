'use client';

import { useEffect, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
import StatCard from '@/components/StatCard';
import { MessageCircle, Clock, AlertTriangle, Phone, Flag, CheckCircle, Send, X } from 'lucide-react';
import type { Matter } from '@/lib/types';

// Message templates for common follow-ups
const MESSAGE_TEMPLATES = [
  {
    label: 'Payment Reminder (EN)',
    message: `Hi {name}, this is Pinho Law following up regarding your matter ({matter}). We wanted to check in about the outstanding balance of {amount}. Please let us know if you have any questions or need to discuss payment arrangements. Thank you!`,
  },
  {
    label: 'Payment Reminder (PT)',
    message: `Olá {name}, aqui é o escritório Pinho Law entrando em contato sobre seu caso ({matter}). Gostaríamos de verificar o saldo pendente de {amount}. Por favor, nos avise se tiver alguma dúvida ou precisar discutir opções de pagamento. Obrigado!`,
  },
  {
    label: 'Case Update Request (EN)',
    message: `Hi {name}, this is Pinho Law. We're reaching out regarding your case ({matter}). Could you please provide us with an update on your end? We want to make sure everything is progressing smoothly. Thank you!`,
  },
  {
    label: 'Case Update Request (PT)',
    message: `Olá {name}, aqui é o escritório Pinho Law. Estamos entrando em contato sobre seu caso ({matter}). Poderia nos fornecer uma atualização sobre a situação do seu lado? Queremos garantir que tudo está progredindo bem. Obrigado!`,
  },
  {
    label: 'General Check-in (PT)',
    message: `Olá {name}, tudo bem? Aqui é do escritório Pinho Law. Estamos fazendo um acompanhamento do seu caso ({matter}). Gostaríamos de saber se precisa de alguma coisa ou tem alguma dúvida. Estamos à disposição!`,
  },
];

interface SendModalProps {
  matter: Matter;
  onClose: () => void;
  onSent: (matter: Matter) => void;
}

function SendModal({ matter, onClose, onSent }: SendModalProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [channel, setChannel] = useState<'WhatsApp' | 'SMS'>('WhatsApp');

  const fillTemplate = (template: string) => {
    const filled = template
      .replace(/{name}/g, matter.clientFullName.split(' ')[0] || matter.clientFullName)
      .replace(/{matter}/g, matter.matterName || matter.clioMatter)
      .replace(/{amount}/g, `$${Number(matter.clioOutstanding).toFixed(2)}`);
    setMessage(filled);
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: matter.whatsAppPhone,
          clientName: matter.clientFullName,
          message: message.trim(),
          rowIndex: matter.rowIndex,
          channel,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send message');
      } else {
        setSuccess(true);
        onSent(matter);
        setTimeout(() => onClose(), 1500);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E5E5EA]">
          <div>
            <h3 className="text-[15px] font-semibold text-[#1D1D1F]">
              Send Message
            </h3>
            <p className="text-[12px] text-[#98989D] mt-0.5">
              {matter.clientFullName} · {matter.whatsAppPhone}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F5F5F7] transition-colors cursor-pointer">
            <X size={18} className="text-[#98989D]" />
          </button>
        </div>

        {/* Channel toggle */}
        <div className="px-5 pt-4">
          <div className="flex gap-2">
            <button
              onClick={() => setChannel('WhatsApp')}
              className={`pill ${channel === 'WhatsApp' ? 'pill-active' : ''}`}
            >
              <MessageCircle size={12} className="mr-1 inline" />
              WhatsApp
            </button>
            <button
              onClick={() => setChannel('SMS')}
              className={`pill ${channel === 'SMS' ? 'pill-active' : ''}`}
            >
              <Phone size={12} className="mr-1 inline" />
              SMS
            </button>
          </div>
        </div>

        {/* Templates */}
        <div className="px-5 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#98989D] mb-2">
            Quick Templates
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MESSAGE_TEMPLATES.map((t, i) => (
              <button
                key={i}
                onClick={() => fillTemplate(t.message)}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#6E6E73] transition-colors cursor-pointer"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message input */}
        <div className="p-5">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Type your message..."
            rows={5}
            className="w-full px-4 py-3 input-field resize-none text-[13px]"
            autoFocus
          />
          <p className="text-[11px] text-[#C7C7CC] mt-1.5">
            {message.length} characters · Outstanding: ${Number(matter.clioOutstanding).toFixed(2)}
          </p>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-[rgba(255,59,48,0.06)] text-[#FF3B30] text-[13px]">
            {error}
          </div>
        )}
        {success && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-[rgba(52,199,89,0.06)] text-[#34C759] text-[13px] flex items-center gap-2">
            <CheckCircle size={14} />
            Message sent successfully!
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-[#E5E5EA]">
          <button onClick={onClose} className="btn btn-ghost text-[13px]">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || success}
            className="btn btn-primary text-[13px] flex items-center gap-2 disabled:opacity-40"
          >
            <Send size={13} />
            {sending ? 'Sending...' : `Send via ${channel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppStatus() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'stale' | 'flagged' | 'no-phone'>('all');
  const [flagging, setFlagging] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<Matter | null>(null);

  useEffect(() => {
    fetch('/api/matters')
      .then(r => r.json())
      .then(d => { setMatters(d.matters || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const flagged = matters.filter(m => m.sendWaUpdate);
  const stale = matters.filter(m => {
    const days = Number(m.daysSinceLastWa);
    return !isNaN(days) && days >= 7;
  });
  const noPhone = matters.filter(m => !m.whatsAppPhone);
  const recentlySent = matters.filter(m => m.lastWaSent);

  const getFiltered = () => {
    switch (filter) {
      case 'stale': return stale;
      case 'flagged': return flagged;
      case 'no-phone': return noPhone;
      default: return matters;
    }
  };

  const handleFlag = async (m: Matter) => {
    setFlagging(m.clioMatter);
    try {
      const newFlag = !m.sendWaUpdate;
      await fetch('/api/flag-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: m.rowIndex, flag: newFlag }),
      });
      setMatters(prev => prev.map(matter =>
        matter.clioMatter === m.clioMatter
          ? { ...matter, sendWaUpdate: newFlag }
          : matter
      ));
    } catch (err) {
      console.error('Flag failed:', err);
    } finally {
      setFlagging(null);
    }
  };

  const handleSent = (sentMatter: Matter) => {
    const now = new Date().toLocaleDateString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
    });
    setMatters(prev => prev.map(m =>
      m.clioMatter === sentMatter.clioMatter
        ? { ...m, lastWaSent: now, sendWaUpdate: false }
        : m
    ));
  };

  const filtered = getFiltered();

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1D1D1F] mb-1">WhatsApp</h1>
        <p className="text-[13px] text-[#98989D]">Send messages, track communication, and flag clients for follow-up</p>
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
            <StatCard label="Flagged for Update" value={flagged.length} icon={Flag} accent="#FF9500" />
            <StatCard label="Stale (7+ days)" value={stale.length} icon={Clock} accent="#FF3B30" subtext="no WA contact" />
            <StatCard label="Missing Phone" value={noPhone.length} icon={AlertTriangle} accent="#FF3B30" />
            <StatCard label="Messages Sent" value={recentlySent.length} icon={CheckCircle} accent="#34C759" />
          </div>

          <div className="flex gap-2 mb-5 flex-wrap">
            {[
              { key: 'all', label: 'All Matters', count: matters.length },
              { key: 'flagged', label: 'Flagged', count: flagged.length },
              { key: 'stale', label: 'Stale (7+ days)', count: stale.length },
              { key: 'no-phone', label: 'No Phone', count: noPhone.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as typeof filter)}
                className={`pill ${filter === tab.key ? 'pill-active' : ''}`}
              >
                {tab.label} <span className="ml-1 opacity-60">({tab.count})</span>
              </button>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-center w-12">Flag</th>
                    <th className="text-left">Client</th>
                    <th className="text-left">Matter</th>
                    <th className="text-left">Phone</th>
                    <th className="text-left">Last WA Sent</th>
                    <th className="text-center">Days Since</th>
                    <th className="text-left">Status</th>
                    <th className="text-right">Outstanding</th>
                    <th className="text-center w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const days = Number(m.daysSinceLastWa);
                    const isStale = !isNaN(days) && days >= 7;
                    return (
                      <tr key={m.clioMatter}>
                        <td className="text-center">
                          <button
                            onClick={() => handleFlag(m)}
                            disabled={flagging === m.clioMatter}
                            className="cursor-pointer transition-transform hover:scale-110 disabled:opacity-40"
                            title={m.sendWaUpdate ? 'Unflag for update' : 'Flag for WA update'}
                          >
                            <Flag
                              size={15}
                              fill={m.sendWaUpdate ? '#FF9500' : 'transparent'}
                              style={{ color: m.sendWaUpdate ? '#FF9500' : '#C7C7CC' }}
                            />
                          </button>
                        </td>
                        <td>
                          <p className="font-medium text-[#1D1D1F]">{m.clientFullName}</p>
                          <p className="text-[11px] mono text-[#98989D]">{m.clioMatter}</p>
                        </td>
                        <td>
                          <span className="text-[13px] truncate block max-w-[180px] text-[#6E6E73]">{m.matterName}</span>
                        </td>
                        <td>
                          {m.whatsAppPhone ? (
                            <span className="text-[13px] flex items-center gap-1 text-[#34C759]">
                              <Phone size={12} />
                              {m.whatsAppPhone}
                            </span>
                          ) : (
                            <span className="badge badge-danger">Missing</span>
                          )}
                        </td>
                        <td>
                          <span className="text-[13px] text-[#6E6E73]">{m.lastWaSent || 'Never'}</span>
                        </td>
                        <td className="text-center">
                          {m.daysSinceLastWa ? (
                            <span
                              className="text-[13px] mono font-semibold"
                              style={{ color: isStale ? '#FF3B30' : '#34C759' }}
                            >
                              {m.daysSinceLastWa}d
                            </span>
                          ) : (
                            <span className="text-[12px] text-[#C7C7CC]">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${m.statusClio === 'Open' ? 'badge-success' : m.statusClio === 'Closed' ? 'badge-neutral' : 'badge-warning'}`}>
                            {m.statusClio}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="text-[13px] mono" style={{ color: Number(m.clioOutstanding) > 0 ? '#FF3B30' : '#C7C7CC' }}>
                            ${Number(m.clioOutstanding).toFixed(2)}
                          </span>
                        </td>
                        <td className="text-center">
                          {m.whatsAppPhone ? (
                            <button
                              onClick={() => setSendTarget(m)}
                              className="btn btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1 mx-auto"
                            >
                              <Send size={11} />
                              Send
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#C7C7CC]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] mt-3 text-[#98989D]">
            Showing {filtered.length} matters · Click flag to toggle · Click Send to message client
          </p>
        </>
      )}

      {/* Send Modal */}
      {sendTarget && (
        <SendModal
          matter={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={handleSent}
        />
      )}
    </DashboardShell>
  );
}
