/**
 * GET /api/clio/authorize
 *
 * Redirects to Clio OAuth2 authorization page.
 * Visit this URL to start the Clio connection flow.
 *
 * Inline URL construction avoids build-time crashes if
 * CLIO_CLIENT_ID is not yet set during static analysis.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const clientId = process.env.CLIO_CLIENT_ID;
  const redirectUri = process.env.CLIO_REDIRECT_URI || 'https://pinholaw-ops.vercel.app/api/clio/callback';

  if (!clientId) {
    return NextResponse.json(
      { error: 'CLIO_CLIENT_ID environment variable is not set' },
      { status: 500 },
    );
  }

  const url =
    `https://app.clio.com/oauth/authorize?` +
    `response_type=code&` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(url);
}
