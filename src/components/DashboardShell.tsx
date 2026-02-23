'use client';

import Sidebar from './Sidebar';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Sidebar />
      <main className="lg:ml-[220px] min-h-screen">
        <div className="max-w-[1320px] mx-auto px-5 sm:px-8 py-8 pt-16 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
