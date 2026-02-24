'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  DollarSign,
  FolderOpen,
  Users,
  Building2,
  Bot,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/', label: 'Collections', icon: DollarSign, description: 'Who owes money' },
  { href: '/matters', label: 'All Matters', icon: FolderOpen, description: 'Full case list' },
  { href: '/workload', label: 'Overview', icon: Users, description: 'Firm overview' },
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
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <Image
            src="/pinho-law-logo.png"
            alt="Pinho Law"
            width={150}
            height={38}
            priority
            className="h-9 w-auto"
          />
        </div>
        <p className="text-[10px] text-[#98989D] font-medium mt-1.5 pl-0.5">Mission Control</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#C7C7CC]">
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
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150"
              style={{
                background: isActive ? '#F5F5F7' : 'transparent',
                color: isActive ? '#1D1D1F' : '#6E6E73',
              }}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} style={{ color: isActive ? '#1D1D1F' : '#98989D' }} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <div className="my-3 mx-3 h-px bg-[#E5E5EA]" />

        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#C7C7CC]">
          Tools
        </p>
        <Link
          href="/agent"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150"
          style={{
            background: pathname === '/agent' ? '#F5F5F7' : 'transparent',
            color: pathname === '/agent' ? '#1D1D1F' : '#6E6E73',
          }}
        >
          <Bot size={16} strokeWidth={pathname === '/agent' ? 2 : 1.5} style={{ color: pathname === '/agent' ? '#1D1D1F' : '#98989D' }} />
          <span>AI Assistant</span>
        </Link>
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4">
        <div className="mx-3 mb-3 h-px bg-[#E5E5EA]" />

        {/* Clio status indicator */}
        <div className="px-3 mb-3 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#34C759]" style={{ boxShadow: '0 0 6px rgba(52,199,89,0.4)' }} />
          <span className="text-[10px] text-[#98989D] font-medium">Clio Connected</span>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] w-full transition-colors cursor-pointer text-[#98989D] hover:text-[#FF3B30] hover:bg-[rgba(255,59,48,0.04)]"
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
        className="fixed top-4 left-4 z-50 p-2 rounded-xl lg:hidden bg-white border border-[#E5E5EA] shadow-sm"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={18} className="text-[#1D1D1F]" /> : <Menu size={18} className="text-[#1D1D1F]" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: '220px',
          background: '#FFFFFF',
          borderRight: '1px solid #E5E5EA',
        }}
      >
        <NavContent />
      </aside>
    </>
  );
}
