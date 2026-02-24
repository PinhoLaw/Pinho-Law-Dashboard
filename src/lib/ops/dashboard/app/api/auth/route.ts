/**
 * API Route: POST /api/auth
 * Simple password auth for leadership access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const LEADERSHIP_PASSWORD = process.env.DASHBOARD_PASSWORD || 'pinholaw2026';
const SESSION_TOKEN = process.env.SESSION_SECRET || 'pl-session-token-v1';

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password !== LEADERSHIP_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set('pl-auth', SESSION_TOKEN, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('pl-auth');
  return NextResponse.json({ success: true });
}
