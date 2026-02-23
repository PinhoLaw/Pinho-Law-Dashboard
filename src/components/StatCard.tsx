'use client';

import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: string;
  subtext?: string;
}

export default function StatCard({ label, value, icon: Icon, accent, subtext }: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#98989D] mb-1.5">
            {label}
          </p>
          <p className="text-[22px] font-semibold tracking-tight" style={{ color: accent || '#1D1D1F' }}>
            {value}
          </p>
          {subtext && (
            <p className="text-[11px] mt-1 text-[#98989D]">{subtext}</p>
          )}
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accent ? `${accent}0F` : '#F5F5F7' }}
        >
          <Icon size={17} style={{ color: accent || '#6E6E73' }} />
        </div>
      </div>
    </div>
  );
}
