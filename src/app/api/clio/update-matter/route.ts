import { NextRequest, NextResponse } from 'next/server';
import { clioPatch, clioGet } from '@/lib/clio';

/**
 * PATCH /api/clio/update-matter
 * Update a matter in Clio. Accepts matter ID and fields to update.
 *
 * Body: { id: number, description?: string, status?: string, practiceArea?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, description, status, practiceArea } = body;

    if (!id) {
      return NextResponse.json({ error: 'Matter ID is required' }, { status: 400 });
    }

    // Build the Clio update payload
    const data: Record<string, unknown> = {};

    if (description !== undefined) {
      data.description = description;
    }

    if (status !== undefined) {
      // Clio uses 'Open', 'Pending', 'Closed'
      data.status = status;
    }

    if (practiceArea !== undefined) {
      // For practice area, we need to look up the ID first
      if (practiceArea === '' || practiceArea === null) {
        data.practice_area = null;
      } else {
        // Look up practice area by name
        const areasResponse = await clioGet('/practice_areas.json', {
          fields: 'id,name',
          query: practiceArea,
        });
        const areas = (areasResponse.data || []) as { id: number; name: string }[];
        const match = areas.find(a => a.name === practiceArea);
        if (match) {
          data.practice_area = { id: match.id };
        } else {
          return NextResponse.json(
            { error: `Practice area "${practiceArea}" not found in Clio` },
            { status: 400 }
          );
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // PATCH the matter in Clio
    const result = await clioPatch(`/matters/${id}.json`, { data });

    return NextResponse.json({
      success: true,
      matter: result.data,
    });
  } catch (error) {
    console.error('[Clio] Update matter error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update matter' },
      { status: 500 }
    );
  }
}
