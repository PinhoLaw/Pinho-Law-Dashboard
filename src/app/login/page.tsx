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
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <Image
              src="/pinho-law-logo.png"
              alt="Pinho Law"
              width={220}
              height={56}
              priority
              className="h-14 w-auto"
            />
          </div>
          <p className="text-[13px] text-[#98989D] font-medium tracking-wide">Mission Control</p>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="card p-7">
          <div className="flex items-center gap-2 mb-5">
            <Lock size={15} className="text-[#98989D]" />
            <span className="text-[13px] font-medium text-[#6E6E73]">Secure Access</span>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-wider text-[#98989D] mb-2">
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
              <p className="text-[13px] px-3 py-2 rounded-lg text-[#FF3B30] bg-[rgba(255,59,48,0.06)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl text-[13px] font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-[#1D1D1F] text-white hover:bg-[#3a3a3c]"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>

        <p className="text-center mt-8 text-[11px] text-[#C7C7CC]">
          PinhoLaw PLLC — Orlando, FL
        </p>
      </div>
    </div>
  );
}
