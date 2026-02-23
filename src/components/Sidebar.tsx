'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  DollarSign,
  FolderOpen,
  Users,
  MessageCircle,
  Building2,
  Bot,
  LogOut,
  Menu,
  X,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/', label: 'Collections', icon: DollarSign, description: 'Who owes money' },
  { href: '/matters', label: 'All Matters', icon: FolderOpen, description: 'Full case list' },
  { href: '/workload', label: 'Team', icon: Users, description: 'Attorney workload' },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, description: 'Client comms' },
  { href: '/sunbiz', label: 'Sunbiz', icon: Building2, description: 'Entity tracking' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  };

  const NavContent = () => (
    <>
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #DFBF6F 100%)' }}>
            <Zap size={15} className="text-[#0A0A0B]" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-[#F0EDE6]">PinhoLaw</h1>
            <p className="text-[10px] text-[#5A5A5E] font-medium -mt-0.5">Mission Control</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3A3A3E]">
          Dashboard
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200"
              style={{
                background: isActive ? 'rgba(201, 168, 76, 0.08)' : 'transparent',
                color: isActive ? '#DFBF6F' : '#8A8A8E',
                borderLeft: isActive ? '2px solid #C9A84C' : '2px solid transparent',
              }}
            >
              <Icon
                size={16}
                strokeWidth={isActive ? 2 : 1.5}
                style={{ color: isActive ? '#C9A84C' : '#5A5A5E' }}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <div className="my-4 mx-3 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />

        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3A3A3E]">
          Tools
        </p>
        <Link
          href="/agent"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200"
          style={{
            background: pathname === '/agent' ? 'rgba(201, 168, 76, 0.08)' : 'transparent',
            color: pathname === '/agent' ? '#DFBF6F' : '#8A8A8E',
            borderLeft: pathname === '/agent' ? '2px solid #C9A84C' : '2px solid transparent',
          }}
        >
          <Bot
            size={16}
            strokeWidth={pathname === '/agent' ? 2 : 1.5}
            style={{ color: pathname === '/agent' ? '#C9A84C' : '#5A5A5E' }}
          />
          <span>AI Assistant</span>
        </Link>
      </nav>

      {/* Footer */}
      <div className="px-3 pb-5">
        <div className="mx-3 mb-3 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />

        {/* Clio status indicator */}
        <div className="px-3 mb-3 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#34D399]" style={{ boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
          <span className="text-[10px] text-[#5A5A5E] font-medium">Clio Connected</span>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] w-full transition-colors cursor-pointer text-[#5A5A5E] hover:text-[#F87171] hover:bg-[rgba(239,68,68,0.06)]"
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 p-2 rounded-xl lg:hidden"
        style={{ background: '#131315', border: '1px solid rgba(255,255,255,0.06)' }}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={18} className="text-[#F0EDE6]" /> : <Menu size={18} className="text-[#F0EDE6]" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: '230px',
          background: '#0D0D0F',
          borderRight: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <NavContent />
      </aside>
    </>
  );
}
