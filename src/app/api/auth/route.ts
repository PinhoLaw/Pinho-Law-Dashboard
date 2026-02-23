import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correctPassword = process.env.DASHBOARD_PASSWORD || 'pinholaw2024';

  if (password === correctPassword) {
    const session = await getSession();
    session.isLoggedIn = true;
    await session.save();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ success: true });
}
