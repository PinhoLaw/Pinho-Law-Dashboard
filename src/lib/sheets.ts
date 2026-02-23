import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import type { Matter } from './types';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// Column mapping for Ongoing tab (0-indexed)
const COLS = {
  clioMatter: 0,
  matterName: 1,
  clientFullName: 2,
  responsiblePerson: 3,
  statusClio: 4,
  currentStatus: 5,
  notes: 6,
  clioPaid: 7,
  clioOutstanding: 8,
  clioBillable: 9,
  clioNonBillable: 10,
  observations: 11,
  area: 12,
  contratoClio: 13,
  billingType: 14,
  openDate: 15,
  nextStepAndWho: 23,
  lastWaSent: 26,
  daysSinceLastWa: 27,
  nextWaDue: 28,
  archiveThis: 29,
  sendWaUpdate: 34,
  whatsAppPhone: 35,
  waMessageSent: 36,
};

let sheetsApi: ReturnType<typeof google.sheets> | null = null;

async function getApi() {
  if (sheetsApi) return sheetsApi;

  // Method 1: OAuth2 via environment variables (for Vercel production)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost'
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    sheetsApi = google.sheets({ version: 'v4', auth: oauth2Client });
    return sheetsApi;
  }

  // Method 2: OAuth2 token from parent project files (for local dev)
  const parentRoot = path.resolve(process.cwd(), '..');
  const tokenPath = path.join(parentRoot, 'token.json');
  const credentialsPath = path.join(parentRoot, 'credentials.json');

  if (fs.existsSync(tokenPath) && fs.existsSync(credentialsPath)) {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));

    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || {};
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
    oauth2Client.setCredentials(token);

    sheetsApi = google.sheets({ version: 'v4', auth: oauth2Client });
    return sheetsApi;
  }

  // Method 3: Fallback to API key (only works with public sheets)
  if (process.env.GOOGLE_API_KEY) {
    sheetsApi = google.sheets({
      version: 'v4',
      auth: process.env.GOOGLE_API_KEY,
    });
    return sheetsApi;
  }

  throw new Error('No Google Sheets credentials available. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN environment variables.');
}

export async function readTab(tabName: string): Promise<string[][]> {
  const api = await getApi();
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'`,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  return (res.data.values as string[][]) || [];
}

export async function readOngoingMatters(): Promise<Matter[]> {
  const rows = await readTab('Ongoing');
  if (rows.length < 2) return [];

  const matters: Matter[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const clioMatter = row[COLS.clioMatter];
    if (!clioMatter) continue;

    matters.push({
      rowIndex: i + 1,
      clioMatter: String(clioMatter),
      matterName: String(row[COLS.matterName] || ''),
      clientFullName: String(row[COLS.clientFullName] || ''),
      responsiblePerson: String(row[COLS.responsiblePerson] || ''),
      statusClio: String(row[COLS.statusClio] || ''),
      currentStatus: String(row[COLS.currentStatus] || ''),
      notes: String(row[COLS.notes] || ''),
      clioPaid: Number(row[COLS.clioPaid]) || 0,
      clioOutstanding: Number(row[COLS.clioOutstanding]) || 0,
      clioBillable: Number(row[COLS.clioBillable]) || 0,
      clioNonBillable: Number(row[COLS.clioNonBillable]) || 0,
      observations: String(row[COLS.observations] || ''),
      area: String(row[COLS.area] || ''),
      openDate: String(row[COLS.openDate] || ''),
      nextStepAndWho: String(row[COLS.nextStepAndWho] || ''),
      lastWaSent: String(row[COLS.lastWaSent] || ''),
      daysSinceLastWa: row[COLS.daysSinceLastWa] || '',
      nextWaDue: String(row[COLS.nextWaDue] || ''),
      sendWaUpdate: String(row[COLS.sendWaUpdate]) === 'true' || String(row[COLS.sendWaUpdate]) === 'TRUE',
      whatsAppPhone: (() => {
        const raw = String(row[COLS.whatsAppPhone] || '');
        // Filter out Google Sheets formula errors
        return raw.startsWith('#ERROR') || raw.startsWith('#REF') || raw.startsWith('#N/A') || raw.startsWith('#VALUE') ? '' : raw;
      })(),
      waMessageSent: String(row[COLS.waMessageSent] || ''),
    });
  }

  return matters;
}

export async function writeCell(tabName: string, cell: string, value: string | number | boolean) {
  const api = await getApi();
  await api.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'!${cell}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[value]],
    },
  });
}

function colToLetter(col: number): string {
  let letter = '';
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode((c % 26) + 65) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

export async function flagForUpdate(rowIndex: number) {
  // sendWaUpdate is column AI (index 34)
  const cell = `${colToLetter(COLS.sendWaUpdate)}${rowIndex}`;
  await writeCell('Ongoing', cell, true);
}

export async function unflagForUpdate(rowIndex: number) {
  const cell = `${colToLetter(COLS.sendWaUpdate)}${rowIndex}`;
  await writeCell('Ongoing', cell, false);
}
