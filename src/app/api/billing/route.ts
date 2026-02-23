import { NextResponse } from 'next/server';
import { readOngoingMatters } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/session';
import type { BillingSummary, OwingMatter } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const matters = await readOngoingMatters();

    const owingMatters: OwingMatter[] = matters
      .filter(m => {
        const outstanding = Number(m.clioOutstanding);
        return !isNaN(outstanding) && outstanding > 0;
      })
      .map(m => ({
        clioMatter: m.clioMatter,
        clientName: m.clientFullName,
        matterName: m.matterName,
        outstanding: Number(m.clioOutstanding),
        paid: Number(m.clioPaid) || 0,
        responsiblePerson: m.responsiblePerson || 'Unassigned',
        area: m.area || 'N/A',
        status: m.statusClio,
        whatsAppPhone: m.whatsAppPhone || '',
        daysSinceLastWa: m.daysSinceLastWa,
      }))
      .sort((a, b) => b.outstanding - a.outstanding);

    const summary: BillingSummary = {
      totalOutstanding: owingMatters.reduce((sum, m) => sum + m.outstanding, 0),
      totalPaid: owingMatters.reduce((sum, m) => sum + m.paid, 0),
      clientsOwing: owingMatters.length,
      totalMatters: matters.length,
      owingMatters,
    };

    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
