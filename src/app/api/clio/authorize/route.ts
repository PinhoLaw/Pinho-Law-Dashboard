/**
 * GET /api/clio/authorize
 *
 * Redirects to Clio OAuth2 authorization page.
 * Visit this URL to start the Clio connection flow.
 */

import { NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/clio';

export async function GET() {
  const url = getAuthorizationUrl();
  return NextResponse.redirect(url);
}
