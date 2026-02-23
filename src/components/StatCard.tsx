'use client';

import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: string;
  subtext?: string;
  glowClass?: string;
}

export default function StatCard({ label, value, icon: Icon, accent, subtext, glowClass }: StatCardProps) {
  return (
    <div className="card p-5 relative overflow-hidden group">
      {/* Subtle gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: accent
            ? `radial-gradient(ellipse at top right, ${accent}08, transparent 70%)`
            : 'none',
        }}
      />

      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5A5A5E] mb-2">
            {label}
          </p>
          <p className={`stat-value ${glowClass || ''}`} style={!glowClass ? { color: accent || '#F0EDE6' } : undefined}>
            {value}
          </p>
          {subtext && (
            <p className="text-[11px] mt-2 text-[#5A5A5E]">{subtext}</p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accent ? `${accent}12` : 'rgba(255,255,255,0.04)' }}
        >
          <Icon size={18} style={{ color: accent || '#5A5A5E' }} />
        </div>
      </div>
    </div>
  );
}
