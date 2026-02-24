/**
 * API Route: /api/state/[file]
 * Reads JSON state files from GitHub repository.
 * Protected by auth middleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readState, STATE_FILES, type StateFile } from '../../../../github';

const VALID_FILES = new Set(Object.values(STATE_FILES));

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;

  if (!VALID_FILES.has(file as StateFile)) {
    return NextResponse.json(
      { error: `Invalid state file: ${file}` },
      { status: 400 },
    );
  }

  try {
    const { data } = await readState(file as StateFile);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.message?.includes('not found') ? 404 : 500 },
    );
  }
}
