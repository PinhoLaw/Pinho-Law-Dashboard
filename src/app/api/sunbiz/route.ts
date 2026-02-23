import { NextResponse } from 'next/server';
import { readTab } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/session';

export const dynamic = 'force-dynamic';

export interface SunbizEntity {
  invoiceNumber: string;
  paidAmount: number;
  filed: string;
  billedAmount: number;
  clioStatus: string;
  state: string;
  entityName: string;
  authorizedPersons: string;
  entityNumber: string;
  documentNumber: string;
  feiEin: string;
  dateFiled: string;
  effectiveDate: string;
  currentStatus: string;
  lastEvent: string;
  eventFiledDate: string;
  eventEffectiveDate: string;
  principalAddress: string;
  mailingAddress: string;
  officerRaName: string;
  lastAnnualReportDate: string;
  reinstatementNeeded: string;
  phone: string;
  email: string;
  observations: string;
  clioMatter: string;
  whatsAppPhone: string;
  sendWaUpdate: boolean;
  lastWaSent: string;
  nextAnnualDue: string;
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await readTab('Controle Sunbiz');
    if (rows.length < 2) {
      return NextResponse.json({ entities: [], count: 0 });
    }

    const entities: SunbizEntity[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[6]) continue; // Skip if no entity name

      entities.push({
        invoiceNumber: String(row[0] || ''),
        paidAmount: Number(row[1]) || 0,
        filed: String(row[2] || ''),
        billedAmount: Number(row[3]) || 0,
        clioStatus: String(row[4] || ''),
        state: String(row[5] || ''),
        entityName: String(row[6] || ''),
        authorizedPersons: String(row[7] || ''),
        entityNumber: String(row[8] || ''),
        documentNumber: String(row[9] || ''),
        feiEin: String(row[10] || ''),
        dateFiled: String(row[11] || ''),
        effectiveDate: String(row[12] || ''),
        currentStatus: String(row[13] || ''),
        lastEvent: String(row[14] || ''),
        eventFiledDate: String(row[15] || ''),
        eventEffectiveDate: String(row[16] || ''),
        principalAddress: String(row[17] || ''),
        mailingAddress: String(row[18] || ''),
        officerRaName: String(row[19] || ''),
        lastAnnualReportDate: String(row[20] || ''),
        reinstatementNeeded: String(row[21] || ''),
        phone: String(row[22] || ''),
        email: String(row[23] || ''),
        observations: String(row[24] || ''),
        clioMatter: String(row[25] || ''),
        whatsAppPhone: String(row[26] || ''),
        sendWaUpdate: String(row[27]) === 'true' || String(row[27]) === 'TRUE',
        lastWaSent: String(row[28] || ''),
        nextAnnualDue: String(row[29] || ''),
      });
    }

    const active = entities.filter(e => e.currentStatus?.toUpperCase() === 'ACTIVE').length;
    const needReinstatement = entities.filter(e => e.reinstatementNeeded?.toUpperCase() === 'YES').length;

    return NextResponse.json({
      entities,
      count: entities.length,
      stats: { active, inactive: entities.length - active, needReinstatement },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
