import { NextResponse } from 'next/server';
import { clioGetAll } from '@/lib/clio';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ClioMatter {
  id: number;
  display_number: string;
  description: string;
  status: string;
  open_date: string;
  close_date: string;
  billable: boolean;
  pending_date: string | null;
  client?: { id: number; name: string; type: string };
  responsible_attorney?: { name: string };
  practice_area?: { name: string };
}

interface ClioBill {
  id: number;
  total: number;
  paid: number;
  pending: number;
  due: number;
  state: string;
  issued_at: string;
  number: string;
  matters?: { id: number; display_number: string }[];
}

interface ClioContact {
  id: number;
  name: string;
  phone_numbers?: { name: string; number: string }[];
  email_addresses?: { name: string; address: string }[];
}

export interface EnrichedMatter {
  id: number;
  displayNumber: string;
  description: string;
  status: string;
  openDate: string;
  closeDate: string;
  billable: boolean;
  clientName: string;
  clientType: string;
  clientId: number;
  responsibleAttorney: string;
  practiceArea: string;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  lastInvoiceNumber: string;
  lastInvoiceDate: string;
  billCount: number;
  phone: string;
  email: string;
  daysOpen: number;
}

/**
 * Pulls ALL matters directly from Clio with billing and contact data enriched.
 * This is the "source of truth" endpoint for the dashboard.
 */
export async function GET() {
  try {
    if (!process.env.CLIO_REFRESH_TOKEN) {
      return NextResponse.json({ error: 'Clio not connected' }, { status: 400 });
    }

    // Fetch matters, bills, and contacts in parallel
    const [mattersRaw, billsRaw, contactsRaw] = await Promise.all([
      clioGetAll('/matters', {
        fields: 'id,display_number,description,status,open_date,close_date,billable,pending_date,client{id,name,type},responsible_attorney{name},practice_area{name}',
        order: 'id(asc)',
      }),
      clioGetAll('/bills', {
        fields: 'id,total,paid,pending,due,state,issued_at,number,matters{id,display_number}',
        order: 'id(asc)',
      }).catch(() => []),
      clioGetAll('/contacts', {
        fields: 'id,name,phone_numbers{name,number},email_addresses{name,address}',
        type: 'Person',
      }).catch(() => []),
    ]);

    const matters = mattersRaw as unknown as ClioMatter[];
    const bills = billsRaw as unknown as ClioBill[];
    const contacts = contactsRaw as unknown as ClioContact[];

    // Build contact lookup by ID
    const contactMap = new Map<number, { phone: string; email: string }>();
    for (const c of contacts) {
      const phones = c.phone_numbers || [];
      const emails = c.email_addresses || [];
      const mobile = phones.find(p => p.name === 'Mobile') || phones.find(p => p.name === 'Work') || phones[0];
      const email = emails.find(e => e.name === 'Work') || emails[0];
      contactMap.set(c.id, {
        phone: mobile?.number || '',
        email: email?.address || '',
      });
    }

    // Aggregate billing per matter (skip void/deleted)
    const billingMap = new Map<string, {
      paid: number;
      outstanding: number;
      billed: number;
      billCount: number;
      lastInvoiceNumber: string;
      lastInvoiceDate: string;
    }>();

    for (const bill of bills) {
      if (bill.state === 'void' || bill.state === 'deleted') continue;
      for (const m of (bill.matters || [])) {
        const existing = billingMap.get(m.display_number) || {
          paid: 0, outstanding: 0, billed: 0, billCount: 0,
          lastInvoiceNumber: '', lastInvoiceDate: '',
        };
        existing.paid += (bill.paid || 0);
        existing.outstanding += (bill.due || 0);
        existing.billed += (bill.total || 0);
        existing.billCount++;
        if (bill.issued_at > existing.lastInvoiceDate) {
          existing.lastInvoiceDate = bill.issued_at;
          existing.lastInvoiceNumber = bill.number;
        }
        billingMap.set(m.display_number, existing);
      }
    }

    // Enrich matters
    const now = Date.now();
    const enriched: EnrichedMatter[] = matters.map(m => {
      const billing = billingMap.get(m.display_number);
      const contact = m.client?.id ? contactMap.get(m.client.id) : undefined;
      const openDate = m.open_date || '';
      const daysOpen = openDate ? Math.floor((now - new Date(openDate).getTime()) / 86400000) : 0;

      return {
        id: m.id,
        displayNumber: m.display_number,
        description: m.description || '',
        status: m.status,
        openDate,
        closeDate: m.close_date || '',
        billable: m.billable,
        clientName: m.client?.name || 'Unknown',
        clientType: m.client?.type || '',
        clientId: m.client?.id || 0,
        responsibleAttorney: m.responsible_attorney?.name || '',
        practiceArea: m.practice_area?.name || '',
        totalBilled: billing?.billed || 0,
        totalPaid: billing?.paid || 0,
        totalOutstanding: billing?.outstanding || 0,
        lastInvoiceNumber: billing?.lastInvoiceNumber || '',
        lastInvoiceDate: billing?.lastInvoiceDate || '',
        billCount: billing?.billCount || 0,
        phone: contact?.phone || '',
        email: contact?.email || '',
        daysOpen,
      };
    });

    // Summary stats
    const openMatters = enriched.filter(m => m.status === 'Open');
    const totalOutstanding = openMatters.reduce((s, m) => s + m.totalOutstanding, 0);
    const totalPaid = enriched.reduce((s, m) => s + m.totalPaid, 0);
    const totalBilled = enriched.reduce((s, m) => s + m.totalBilled, 0);
    const withOutstanding = openMatters.filter(m => m.totalOutstanding > 0);
    const withPhone = openMatters.filter(m => m.phone).length;

    // Group by attorney
    const byAttorney: Record<string, { count: number; outstanding: number; paid: number }> = {};
    for (const m of openMatters) {
      const atty = m.responsibleAttorney || 'Unassigned';
      if (!byAttorney[atty]) byAttorney[atty] = { count: 0, outstanding: 0, paid: 0 };
      byAttorney[atty].count++;
      byAttorney[atty].outstanding += m.totalOutstanding;
      byAttorney[atty].paid += m.totalPaid;
    }

    // Group by practice area
    const byArea: Record<string, { count: number; outstanding: number }> = {};
    for (const m of openMatters) {
      const area = m.practiceArea || 'Uncategorized';
      if (!byArea[area]) byArea[area] = { count: 0, outstanding: 0 };
      byArea[area].count++;
      byArea[area].outstanding += m.totalOutstanding;
    }

    return NextResponse.json({
      matters: enriched,
      stats: {
        totalMatters: enriched.length,
        openMatters: openMatters.length,
        closedMatters: enriched.length - openMatters.length,
        totalOutstanding,
        totalPaid,
        totalBilled,
        clientsOwing: withOutstanding.length,
        withPhone,
        withoutPhone: openMatters.length - withPhone,
        collectionRate: totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0,
      },
      byAttorney: Object.entries(byAttorney)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.outstanding - a.outstanding),
      byArea: Object.entries(byArea)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.outstanding - a.outstanding),
      billStats: {
        totalBills: bills.filter(b => b.state !== 'void' && b.state !== 'deleted').length,
        paidBills: bills.filter(b => b.state === 'paid').length,
        openBills: bills.filter(b => b.state === 'open' || b.state === 'awaiting_payment').length,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Clio matters API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
