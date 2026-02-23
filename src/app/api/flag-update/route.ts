import { NextRequest, NextResponse } from 'next/server';
import { flagForUpdate, unflagForUpdate } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { rowIndex, flag } = await req.json();

    if (!rowIndex || typeof rowIndex !== 'number') {
      return NextResponse.json({ error: 'rowIndex is required' }, { status: 400 });
    }

    if (flag === false) {
      await unflagForUpdate(rowIndex);
    } else {
      await flagForUpdate(rowIndex);
    }

    return NextResponse.json({ success: true, rowIndex, flagged: flag !== false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
