import { NextRequest, NextResponse } from 'next/server';
import { clioGetAll, clioGet } from '@/lib/clio';
import { readTab, writeCell } from '@/lib/sheets';

// Column indices (0-indexed) for the Ongoing tab
const COLS: Record<string, number> = {
  clioMatter: 0,        // A
  matterName: 1,        // B
  clientFullName: 2,    // C
  responsiblePerson: 3, // D
  statusClio: 4,        // E
  clioPaid: 7,          // H
  clioOutstanding: 8,   // I
  clioBillable: 9,      // J
  clioNonBillable: 10,  // K
  area: 12,             // M
  openDate: 15,         // P
  whatsAppPhone: 35,    // AJ
};

function colToLetter(col: number): string {
  let letter = '';
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode((c % 26) + 65) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

interface ClioMatter {
  id: number;
  display_number: string;
  description: string;
  status: string;
  open_date: string;
  billable: boolean;
  client?: { id: number; name: string };
  responsible_attorney?: { name: string };
  practice_area?: { name: string };
}

interface ClioBill {
  id: number;
  total: number;
  paid: number;
  pending: number;
  due: number;
  status: string;
  matter?: { id: number; display_number: string };
}

interface SyncResult {
  mattersFound: number;
  billsFound: number;
  cellsUpdated: number;
  errors: string[];
  updates: { row: number; col: string; oldVal: string; newVal: string }[];
}

/**
 * Run Clio → Google Sheet sync
 * Pulls matters, bills, and contacts from Clio and fills in missing data
 */
export async function GET(req: NextRequest) {
  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true';

  try {
    // Check if Clio is configured
    if (!process.env.CLIO_REFRESH_TOKEN) {
      return NextResponse.json({
        error: 'Clio not connected. Visit /api/clio/status to authorize.',
      }, { status: 400 });
    }

    const result: SyncResult = {
      mattersFound: 0,
      billsFound: 0,
      cellsUpdated: 0,
      errors: [],
      updates: [],
    };

    // Step 1: Read current sheet data
    const rows = await readTab('Ongoing');
    if (rows.length < 2) {
      return NextResponse.json({ error: 'No data in Ongoing tab' }, { status: 400 });
    }

    // Build a map of sheet rows by Clio matter number
    const sheetMap: Map<string, { rowIndex: number; row: string[] }> = new Map();
    for (let i = 1; i < rows.length; i++) {
      const matterNum = String(rows[i][COLS.clioMatter] || '').trim();
      if (matterNum) {
        sheetMap.set(matterNum, { rowIndex: i + 1, row: rows[i] });
      }
    }

    // Step 2: Fetch all matters from Clio with expanded fields
    console.log('Fetching matters from Clio...');
    const clioMatters = await clioGetAll('/matters', {
      fields: 'id,display_number,description,status,open_date,billable,client{id,name},responsible_attorney{name},practice_area{name}',
      status: 'Open',
      order: 'id(asc)',
    }) as unknown as ClioMatter[];
    result.mattersFound = clioMatters.length;

    // Step 3: Fetch all bills from Clio
    console.log('Fetching bills from Clio...');
    let clioBills: ClioBill[] = [];
    try {
      clioBills = await clioGetAll('/bills', {
        fields: 'id,total,paid,pending,due,status,matter{id,display_number}',
        order: 'id(asc)',
      }) as unknown as ClioBill[];
      result.billsFound = clioBills.length;
    } catch (err) {
      result.errors.push(`Failed to fetch bills: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    // Step 4: Aggregate billing per matter
    const billingByMatter: Map<string, { paid: number; outstanding: number }> = new Map();
    for (const bill of clioBills) {
      const matterNum = bill.matter?.display_number;
      if (!matterNum) continue;
      const existing = billingByMatter.get(matterNum) || { paid: 0, outstanding: 0 };
      existing.paid += (bill.paid || 0);
      existing.outstanding += ((bill.due || 0) - (bill.paid || 0));
      billingByMatter.set(matterNum, existing);
    }

    // Step 5: Fetch contacts for phone numbers
    console.log('Fetching contacts from Clio...');
    const contactPhones: Map<number, string> = new Map();
    try {
      const contacts = await clioGetAll('/contacts', {
        fields: 'id,name,phone_numbers{number,name}',
        type: 'Person',
      });
      for (const contact of contacts) {
        const phones = (contact.phone_numbers || []) as { number: string; name: string }[];
        const mobile = phones.find((p: { name: string }) => p.name === 'Mobile') || phones[0];
        if (mobile) {
          contactPhones.set(contact.id as number, mobile.number);
        }
      }
    } catch (err) {
      result.errors.push(`Failed to fetch contacts: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    // Step 6: Match Clio data to sheet rows and generate updates
    for (const matter of clioMatters) {
      const matterNum = matter.display_number;
      const sheetRow = sheetMap.get(matterNum);
      if (!sheetRow) continue; // Not in our Ongoing sheet

      const { rowIndex, row } = sheetRow;
      const billing = billingByMatter.get(matterNum);

      // Helper to queue an update
      const queueUpdate = (colName: string, newValue: string | number) => {
        const colIdx = COLS[colName];
        const currentVal = String(row[colIdx] || '').trim();
        const newVal = String(newValue).trim();

        // Only update if the cell is empty or has an error, or if it's billing data (always overwrite)
        const isBillingCol = ['clioPaid', 'clioOutstanding', 'clioBillable', 'clioNonBillable'].includes(colName);
        const isEmpty = !currentVal || currentVal === '0' || currentVal === '#ERROR! (Formula parse error.)';

        if (isEmpty || isBillingCol) {
          if (currentVal !== newVal) {
            result.updates.push({
              row: rowIndex,
              col: colName,
              oldVal: currentVal,
              newVal: newVal,
            });
          }
        }
      };

      // Matter fields
      if (matter.status) queueUpdate('statusClio', matter.status);
      if (matter.practice_area?.name) queueUpdate('area', matter.practice_area.name);
      if (matter.responsible_attorney?.name) queueUpdate('responsiblePerson', matter.responsible_attorney.name);
      if (matter.open_date) queueUpdate('openDate', matter.open_date);

      // Billing
      if (billing) {
        queueUpdate('clioPaid', billing.paid.toFixed(2));
        queueUpdate('clioOutstanding', billing.outstanding.toFixed(2));
      }

      // Phone number from contact
      if (matter.client?.id) {
        const phone = contactPhones.get(matter.client.id);
        if (phone) queueUpdate('whatsAppPhone', phone);
      }
    }

    // Step 7: Apply updates (unless dry run)
    if (!dryRun) {
      for (const update of result.updates) {
        try {
          const colIdx = COLS[update.col];
          const cell = `${colToLetter(colIdx)}${update.row}`;
          const value = ['clioPaid', 'clioOutstanding', 'clioBillable', 'clioNonBillable'].includes(update.col)
            ? Number(update.newVal)
            : update.newVal;
          await writeCell('Ongoing', cell, value);
          result.cellsUpdated++;
        } catch (err) {
          result.errors.push(`Failed to write row ${update.row} col ${update.col}: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        clioMattersFound: result.mattersFound,
        clioBillsFound: result.billsFound,
        sheetRowsMatched: sheetMap.size,
        cellsToUpdate: result.updates.length,
        cellsUpdated: result.cellsUpdated,
        errors: result.errors.length,
      },
      updates: result.updates.slice(0, 100), // Limit for readability
      errors: result.errors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Clio sync error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST handler - same as GET but triggered by cron or manual button
 */
export async function POST(req: NextRequest) {
  return GET(req);
}
