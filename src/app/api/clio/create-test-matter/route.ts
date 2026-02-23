import { NextResponse } from 'next/server';
import { clioGet, clioPost } from '@/lib/clio';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/clio/create-test-matter
 *
 * Creates an "Ethan Demo" test matter in Clio.
 * Auto-discovers valid practice area, attorney, and client IDs.
 */
export async function POST() {
  try {
    if (!process.env.CLIO_REFRESH_TOKEN) {
      return NextResponse.json({ error: 'Clio not connected' }, { status: 400 });
    }

    console.log('[Test Matter] Fetching practice areas, users, and contacts...');

    // Fetch available practice areas
    const areasRes = await clioGet('/practice_areas', {
      fields: 'id,name',
      limit: '100',
    });
    const areas = (areasRes.data || []) as { id: number; name: string }[];
    console.log(`[Test Matter] Found ${areas.length} practice areas:`, areas.map(a => a.name).join(', '));

    // Fetch available users (attorneys)
    const usersRes = await clioGet('/users', {
      fields: 'id,name,enabled',
      limit: '100',
    });
    const users = (usersRes.data || []) as { id: number; name: string; enabled: boolean }[];
    const enabledUsers = users.filter(u => u.enabled);
    console.log(`[Test Matter] Found ${enabledUsers.length} enabled users:`, enabledUsers.map(u => u.name).join(', '));

    // Fetch a contact to use as client
    const contactsRes = await clioGet('/contacts', {
      fields: 'id,name,type',
      type: 'Person',
      limit: '1',
    });
    const contacts = (contactsRes.data || []) as { id: number; name: string }[];
    const client = contacts[0];

    if (!client) {
      return NextResponse.json({
        error: 'No contacts found in Clio to use as client for test matter',
      }, { status: 400 });
    }

    // Pick first available practice area (prefer "Business" if it exists)
    const practiceArea = areas.find(a => a.name.toLowerCase().includes('business')) || areas[0];
    const attorney = enabledUsers[0];

    // Build the matter creation payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matterData: Record<string, any> = {
      description: 'Ethan Demo',
      status: 'Open',
      client: { id: client.id },
    };

    if (practiceArea) {
      matterData.practice_area = { id: practiceArea.id };
    }
    if (attorney) {
      matterData.responsible_attorney = { id: attorney.id };
    }

    console.log('[Test Matter] Creating matter with:', JSON.stringify({ data: matterData }));

    const result = await clioPost('/matters.json', { data: matterData });

    console.log('[Test Matter] Created successfully:', JSON.stringify(result.data));

    return NextResponse.json({
      success: true,
      message: 'Test matter "Ethan Demo" created in Clio',
      matter: result.data,
      context: {
        client: { id: client.id, name: client.name },
        practiceArea: practiceArea ? { id: practiceArea.id, name: practiceArea.name } : null,
        attorney: attorney ? { id: attorney.id, name: attorney.name } : null,
      },
      nextSteps: [
        'GET /api/clio/refresh — trigger incremental sync to pick up new matter',
        'Visit /matters and search "Ethan Demo" to verify it appears',
      ],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Test Matter] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
