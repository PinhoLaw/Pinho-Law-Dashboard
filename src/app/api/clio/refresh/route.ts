import { NextRequest, NextResponse } from 'next/server';
import { clioGetAll } from '@/lib/clio';
import { writeCache, readCache } from '@/lib/clio-cache';

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

interface EnrichedMatter {
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
 * Build enriched data from raw Clio data.
 */
function buildResponse(matters: ClioMatter[], bills: ClioBill[], contacts: ClioContact[]) {
  // Build contact lookup
  const contactMap = new Map<number, { phone: string; email: string }>();
  for (const c of contacts) {
    const phones = c.phone_numbers || [];
    const emails = c.email_addresses || [];
    const mobile = phones.find(p => p.name === 'Mobile') || phones.find(p => p.name === 'Work') || phones[0];
    const email = emails.find(e => e.name === 'Work') || emails[0];
    contactMap.set(c.id, { phone: mobile?.number || '', email: email?.address || '' });
  }

  // Aggregate billing
  const billingMap = new Map<string, {
    paid: number; outstanding: number; billed: number; billCount: number;
    lastInvoiceNumber: string; lastInvoiceDate: string;
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

  // Enrich
  const now = Date.now();
  const enriched: EnrichedMatter[] = matters.map(m => {
    const billing = billingMap.get(m.display_number);
    const contact = m.client?.id ? contactMap.get(m.client.id) : undefined;
    const openDate = m.open_date || '';
    const daysOpen = openDate ? Math.floor((now - new Date(openDate).getTime()) / 86400000) : 0;
    return {
      id: m.id, displayNumber: m.display_number, description: m.description || '',
      status: m.status, openDate, closeDate: m.close_date || '', billable: m.billable,
      clientName: m.client?.name || 'Unknown', clientType: m.client?.type || '',
      clientId: m.client?.id || 0, responsibleAttorney: m.responsible_attorney?.name || '',
      practiceArea: m.practice_area?.name || '',
      totalBilled: billing?.billed || 0, totalPaid: billing?.paid || 0,
      totalOutstanding: billing?.outstanding || 0,
      lastInvoiceNumber: billing?.lastInvoiceNumber || '',
      lastInvoiceDate: billing?.lastInvoiceDate || '',
      billCount: billing?.billCount || 0,
      phone: contact?.phone || '', email: contact?.email || '', daysOpen,
    };
  });

  // Stats
  const openMatters = enriched.filter(m => m.status === 'Open');
  const totalOutstanding = openMatters.reduce((s, m) => s + m.totalOutstanding, 0);
  const totalPaid = enriched.reduce((s, m) => s + m.totalPaid, 0);
  const totalBilled = enriched.reduce((s, m) => s + m.totalBilled, 0);
  const withOutstanding = openMatters.filter(m => m.totalOutstanding > 0);
  const withPhone = openMatters.filter(m => m.phone).length;

  const byAttorney: Record<string, { count: number; outstanding: number; paid: number }> = {};
  for (const m of openMatters) {
    const atty = m.responsibleAttorney || 'Unassigned';
    if (!byAttorney[atty]) byAttorney[atty] = { count: 0, outstanding: 0, paid: 0 };
    byAttorney[atty].count++;
    byAttorney[atty].outstanding += m.totalOutstanding;
    byAttorney[atty].paid += m.totalPaid;
  }

  const byArea: Record<string, { count: number; outstanding: number }> = {};
  for (const m of openMatters) {
    const area = m.practiceArea || 'Uncategorized';
    if (!byArea[area]) byArea[area] = { count: 0, outstanding: 0 };
    byArea[area].count++;
    byArea[area].outstanding += m.totalOutstanding;
  }

  return {
    matters: enriched,
    stats: {
      totalMatters: enriched.length, openMatters: openMatters.length,
      closedMatters: enriched.length - openMatters.length,
      totalOutstanding, totalPaid, totalBilled,
      clientsOwing: withOutstanding.length, withPhone,
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
  };
}

/**
 * Do a FULL fetch from Clio (all matters, bills, contacts).
 * ~40-50 seconds.
 */
async function fullFetch() {
  const mattersRaw = await clioGetAll('/matters', {
    fields: 'id,display_number,description,status,open_date,close_date,billable,pending_date,client{id,name,type},responsible_attorney{name},practice_area{name}',
    order: 'id(asc)',
  });
  const billsRaw = await clioGetAll('/bills', {
    fields: 'id,total,paid,pending,due,state,issued_at,number,matters{id,display_number}',
    order: 'id(asc)',
  }).catch(() => []);
  const contactsRaw = await clioGetAll('/contacts', {
    fields: 'id,name,phone_numbers{name,number},email_addresses{name,address}',
    type: 'Person',
  }).catch(() => []);

  return {
    matters: mattersRaw as unknown as ClioMatter[],
    bills: billsRaw as unknown as ClioBill[],
    contacts: contactsRaw as unknown as ClioContact[],
  };
}

/**
 * Do an INCREMENTAL fetch — only get matters/bills changed since lastFetchedAt.
 * Merges updated data into the existing enriched matters array.
 * Typically ~3-10 seconds instead of ~40-50 seconds.
 */
async function incrementalFetch(existingData: {
  matters: EnrichedMatter[];
}, lastFetchedAt: string) {
  // Fetch only matters updated since last sync
  console.log(`[Refresh] Incremental: fetching matters updated since ${lastFetchedAt}`);
  const updatedMattersRaw = await clioGetAll('/matters', {
    fields: 'id,display_number,description,status,open_date,close_date,billable,pending_date,client{id,name,type},responsible_attorney{name},practice_area{name}',
    updated_since: lastFetchedAt,
    order: 'id(asc)',
  });
  const updatedMatters = updatedMattersRaw as unknown as ClioMatter[];
  console.log(`[Refresh] Incremental: ${updatedMatters.length} matters updated since last sync`);

  if (updatedMatters.length === 0) {
    // Nothing changed — just refresh the timestamp
    return { changed: 0, total: existingData.matters.length };
  }

  // Get the display numbers of changed matters so we can fetch their bills
  const changedDisplayNumbers = new Set(updatedMatters.map(m => m.display_number));
  const changedClientIds = new Set(
    updatedMatters.map(m => m.client?.id).filter((id): id is number => !!id)
  );

  // Fetch ALL bills (we need to re-aggregate since bills can span matters)
  // For a truly incremental approach we'd need updated_since on bills too,
  // but since billing totals are aggregated across all bills for a matter,
  // it's safer to refetch all bills for changed matters
  const billsRaw = await clioGetAll('/bills', {
    fields: 'id,total,paid,pending,due,state,issued_at,number,matters{id,display_number}',
    order: 'id(asc)',
  }).catch(() => []);
  const bills = billsRaw as unknown as ClioBill[];

  // Fetch contacts only for changed client IDs
  let contacts: ClioContact[] = [];
  if (changedClientIds.size > 0) {
    const contactsRaw = await clioGetAll('/contacts', {
      fields: 'id,name,phone_numbers{name,number},email_addresses{name,address}',
      type: 'Person',
    }).catch(() => []);
    contacts = contactsRaw as unknown as ClioContact[];
  }

  // Build contact + billing lookups
  const contactMap = new Map<number, { phone: string; email: string }>();
  for (const c of contacts) {
    const phones = c.phone_numbers || [];
    const emails = c.email_addresses || [];
    const mobile = phones.find(p => p.name === 'Mobile') || phones.find(p => p.name === 'Work') || phones[0];
    const email = emails.find(e => e.name === 'Work') || emails[0];
    contactMap.set(c.id, { phone: mobile?.number || '', email: email?.address || '' });
  }

  const billingMap = new Map<string, {
    paid: number; outstanding: number; billed: number; billCount: number;
    lastInvoiceNumber: string; lastInvoiceDate: string;
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

  // Enrich only the changed matters
  const now = Date.now();
  const updatedEnriched: EnrichedMatter[] = updatedMatters.map(m => {
    const billing = billingMap.get(m.display_number);
    const contact = m.client?.id ? contactMap.get(m.client.id) : undefined;
    // For contact, try existing data if we didn't refetch
    const existingMatter = existingData.matters.find(em => em.id === m.id);
    const openDate = m.open_date || '';
    const daysOpen = openDate ? Math.floor((now - new Date(openDate).getTime()) / 86400000) : 0;
    return {
      id: m.id, displayNumber: m.display_number, description: m.description || '',
      status: m.status, openDate, closeDate: m.close_date || '', billable: m.billable,
      clientName: m.client?.name || 'Unknown', clientType: m.client?.type || '',
      clientId: m.client?.id || 0, responsibleAttorney: m.responsible_attorney?.name || '',
      practiceArea: m.practice_area?.name || '',
      totalBilled: billing?.billed || 0, totalPaid: billing?.paid || 0,
      totalOutstanding: billing?.outstanding || 0,
      lastInvoiceNumber: billing?.lastInvoiceNumber || '',
      lastInvoiceDate: billing?.lastInvoiceDate || '',
      billCount: billing?.billCount || 0,
      phone: contact?.phone || existingMatter?.phone || '',
      email: contact?.email || existingMatter?.email || '',
      daysOpen,
    };
  });

  // Also update billing for ALL existing matters (since bills were refetched)
  const updatedExistingMatters = existingData.matters.map(em => {
    if (changedDisplayNumbers.has(em.displayNumber)) {
      // This matter was updated — will be replaced below
      return em;
    }
    // Update billing data from fresh bills
    const billing = billingMap.get(em.displayNumber);
    if (billing) {
      return {
        ...em,
        totalBilled: billing.billed,
        totalPaid: billing.paid,
        totalOutstanding: billing.outstanding,
        lastInvoiceNumber: billing.lastInvoiceNumber,
        lastInvoiceDate: billing.lastInvoiceDate,
        billCount: billing.billCount,
      };
    }
    return em;
  });

  // Merge: replace existing matters with updated ones, add new ones
  const mergedMap = new Map<number, EnrichedMatter>();
  for (const m of updatedExistingMatters) {
    mergedMap.set(m.id, m);
  }
  for (const m of updatedEnriched) {
    mergedMap.set(m.id, m);
  }

  return {
    changed: updatedMatters.length,
    total: mergedMap.size,
    mergedMatters: Array.from(mergedMap.values()),
    bills,
    contacts,
  };
}

/**
 * GET /api/clio/refresh
 *
 * Force-refresh the Clio data cache. Called by:
 *   1. Vercel cron job (daily at 6 AM EST)
 *   2. Manual trigger from the dashboard
 *   3. Background revalidation from stale cache hits
 *
 * Supports two modes:
 *   - ?mode=full  — always do a full fetch (~45s). Default for first-time or explicit.
 *   - ?mode=incremental — only fetch changes since last sync (~5-15s). Default when cache exists.
 */
export async function GET(req: NextRequest) {
  const start = Date.now();
  const requestedMode = req.nextUrl.searchParams.get('mode');

  try {
    if (!process.env.CLIO_REFRESH_TOKEN) {
      return NextResponse.json({ error: 'Clio not connected' }, { status: 400 });
    }

    // Check current cache
    const existing = await readCache();
    const cacheAge = existing ? Math.round((Date.now() - existing.fetchedAt) / 1000) : null;
    let existingParsed: { matters: EnrichedMatter[]; fetchedAt: string } | null = null;

    if (existing) {
      try {
        existingParsed = JSON.parse(existing.data);
      } catch {
        existingParsed = null;
      }
    }

    // Decide mode: incremental if cache exists AND not explicitly requesting full
    const useIncremental = requestedMode !== 'full' && existingParsed?.matters?.length && existingParsed?.fetchedAt;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let responseBody: any;
    let mode: string;

    if (useIncremental && existingParsed) {
      // INCREMENTAL SYNC
      mode = 'incremental';
      console.log(`[Refresh] Incremental sync starting... (cache age: ${cacheAge}s, last fetch: ${existingParsed.fetchedAt})`);

      const result = await incrementalFetch(existingParsed, existingParsed.fetchedAt);

      if (result.mergedMatters) {
        // Rebuild the full response with merged data
        // We need to re-compute stats from the merged matters array
        const allMatters = result.mergedMatters;
        const openMatters = allMatters.filter(m => m.status === 'Open');
        const totalOutstanding = openMatters.reduce((s, m) => s + m.totalOutstanding, 0);
        const totalPaid = allMatters.reduce((s, m) => s + m.totalPaid, 0);
        const totalBilled = allMatters.reduce((s, m) => s + m.totalBilled, 0);
        const withOutstanding = openMatters.filter(m => m.totalOutstanding > 0);
        const withPhone = openMatters.filter(m => m.phone).length;

        const byAttorney: Record<string, { count: number; outstanding: number; paid: number }> = {};
        for (const m of openMatters) {
          const atty = m.responsibleAttorney || 'Unassigned';
          if (!byAttorney[atty]) byAttorney[atty] = { count: 0, outstanding: 0, paid: 0 };
          byAttorney[atty].count++;
          byAttorney[atty].outstanding += m.totalOutstanding;
          byAttorney[atty].paid += m.totalPaid;
        }
        const byArea: Record<string, { count: number; outstanding: number }> = {};
        for (const m of openMatters) {
          const area = m.practiceArea || 'Uncategorized';
          if (!byArea[area]) byArea[area] = { count: 0, outstanding: 0 };
          byArea[area].count++;
          byArea[area].outstanding += m.totalOutstanding;
        }

        const bills = result.bills || [];
        responseBody = {
          matters: allMatters,
          stats: {
            totalMatters: allMatters.length, openMatters: openMatters.length,
            closedMatters: allMatters.length - openMatters.length,
            totalOutstanding, totalPaid, totalBilled,
            clientsOwing: withOutstanding.length, withPhone,
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
        };
      } else {
        // No changes — just update the timestamp
        responseBody = { ...existingParsed, fetchedAt: new Date().toISOString() };
      }
    } else {
      // FULL SYNC
      mode = 'full';
      console.log(`[Refresh] Full sync starting... (cache age: ${cacheAge ? cacheAge + 's' : 'none'})`);

      const { matters, bills, contacts } = await fullFetch();
      responseBody = buildResponse(matters, bills, contacts);
    }

    const jsonStr = JSON.stringify(responseBody);

    // Write to all cache layers
    await writeCache(jsonStr, Date.now());

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Refresh] ${mode} complete in ${elapsed}s — ${responseBody.matters.length} matters`);

    return NextResponse.json({
      success: true,
      mode,
      elapsed: `${elapsed}s`,
      matters: responseBody.matters.length,
      stats: responseBody.stats,
      previousCacheAge: cacheAge ? `${cacheAge}s` : 'none',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Refresh] Failed:', message);
    return NextResponse.json({ error: message, elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s` }, { status: 500 });
  }
}
