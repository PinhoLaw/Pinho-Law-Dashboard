import { NextResponse } from 'next/server';
import { readOngoingMatters } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const matters = await readOngoingMatters();
    return NextResponse.json({ matters, count: matters.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
