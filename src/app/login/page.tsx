'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Zap } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError('Invalid password');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{ background: '#0A0A0B' }}>
      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
           style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.04) 0%, transparent 70%)' }} />

      <div className="w-full max-w-sm px-6 relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center animate-pulse-glow"
                 style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #DFBF6F 100%)' }}>
              <Zap size={24} className="text-[#0A0A0B]" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="font-display text-[28px] italic text-[#F0EDE6] tracking-tight mb-1">
            PinhoLaw
          </h1>
          <p className="text-[12px] text-[#5A5A5E] font-medium tracking-[0.15em] uppercase">
            Mission Control
          </p>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="card-brand p-7">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-5">
              <Lock size={14} className="text-[#5A5A5E]" />
              <span className="text-[12px] font-medium text-[#5A5A5E] uppercase tracking-wider">
                Secure Access
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="detail-label block mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter dashboard password"
                  autoFocus
                  className="w-full px-4 py-3 input-field"
                />
              </div>

              {error && (
                <p className="text-[13px] px-3 py-2 rounded-lg text-[#F87171]"
                   style={{ background: 'rgba(239,68,68,0.08)' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 rounded-xl text-[13px] font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed btn-brand"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </div>
        </form>

        <p className="text-center mt-8 text-[11px] text-[#3A3A3E]">
          PinhoLaw PLLC {'\u2014'} Orlando, FL
        </p>
      </div>
    </div>
  );
}
