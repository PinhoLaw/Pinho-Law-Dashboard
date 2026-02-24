'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Lock } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-white">
      {/* Subtle warm gradient accent */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(184,134,11,0.04) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="w-full max-w-sm px-6 relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <Image
              src="/pinho-law-logo.png"
              alt="Pinho Law PLLC"
              width={200}
              height={52}
              priority
              className="h-13 w-auto"
            />
          </div>
          <p className="text-[12px] text-[#98989D] font-medium tracking-[0.15em] uppercase">
            Mission Control
          </p>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="bg-white border border-[#E5E5EA] rounded-2xl p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Lock size={14} className="text-[#98989D]" />
            <span className="text-[12px] font-medium text-[#98989D] uppercase tracking-wider">
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
              <p className="text-[13px] px-3 py-2 rounded-lg text-[#FF3B30]"
                 style={{ background: 'rgba(255,59,48,0.06)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl text-[13px] font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: '#B8860B',
                color: '#FFFFFF',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>

        <p className="text-center mt-8 text-[11px] text-[#C7C7CC]">
          PinhoLaw PLLC &mdash; Orlando, FL
        </p>
      </div>
    </div>
  );
}
