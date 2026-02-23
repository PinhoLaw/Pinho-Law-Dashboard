// Clio API client for the dashboard (server-side only)
// Tries body params first (per Clio docs), then Basic Auth as fallback

const CLIO_TOKEN_URL = 'https://app.clio.com/oauth/token';
const CLIO_API_BASE = 'https://app.clio.com/api/v4';

const CLIO_CLIENT_ID = process.env.CLIO_CLIENT_ID!;
const CLIO_CLIENT_SECRET = process.env.CLIO_CLIENT_SECRET!;
const CLIO_REDIRECT_URI = process.env.CLIO_REDIRECT_URI || 'https://pinholaw-dashboard.vercel.app/api/clio/callback';

// In-memory token cache (per serverless invocation)
let cachedToken: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
} | null = null;

/**
 * Exchange an authorization code for access + refresh tokens.
 * Tries body-params method first, then Basic Auth fallback.
 */
export async function exchangeCodeForToken(code: string) {
  // Method 1: client_id + client_secret in body (per Clio docs)
  const bodyParams = new URLSearchParams({
    client_id: CLIO_CLIENT_ID,
    client_secret: CLIO_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: CLIO_REDIRECT_URI,
  });

  let res = await fetch(CLIO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
  });

  // Method 2: Basic Auth fallback
  if (!res.ok) {
    const basicCreds = Buffer.from(`${CLIO_CLIENT_ID}:${CLIO_CLIENT_SECRET}`).toString('base64');
    res = await fetch(CLIO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicCreds}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CLIO_REDIRECT_URI,
      }).toString(),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clio token exchange failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_at: Date.now() + (data.expires_in * 1000),
  };
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string) {
  const bodyParams = new URLSearchParams({
    client_id: CLIO_CLIENT_ID,
    client_secret: CLIO_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  let res = await fetch(CLIO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
  });

  if (!res.ok) {
    const basicCreds = Buffer.from(`${CLIO_CLIENT_ID}:${CLIO_CLIENT_SECRET}`).toString('base64');
    res = await fetch(CLIO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicCreds}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clio token refresh failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_at: Date.now() + (data.expires_in * 1000),
  };
}

/**
 * Get a valid access token — uses env vars, refreshes if needed
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 60000) {
    return cachedToken.access_token;
  }

  const envRefresh = process.env.CLIO_REFRESH_TOKEN;
  if (!envRefresh) {
    throw new Error('CLIO_REFRESH_TOKEN not set. Complete OAuth2 authorization first.');
  }

  const refreshed = await refreshAccessToken(envRefresh);
  cachedToken = refreshed;
  return refreshed.access_token;
}

/**
 * Make an authenticated GET request to Clio API v4
 */
export async function clioGet(path: string, params: Record<string, string> = {}) {
  const token = await getAccessToken();
  const url = new URL(`${CLIO_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clio API ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Paginate through all results for a Clio API endpoint
 */
export async function clioGetAll(path: string, params: Record<string, string> = {}) {
  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const data = await clioGet(path, { ...params, limit: String(limit), offset: String(offset) });
    const items = (data.data || []) as Record<string, unknown>[];
    results.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }

  return results;
}

/**
 * Get the Clio authorization URL for the OAuth2 flow
 */
export function getAuthorizationUrl(): string {
  return `https://app.clio.com/oauth/authorize?response_type=code&client_id=${CLIO_CLIENT_ID}&redirect_uri=${encodeURIComponent(CLIO_REDIRECT_URI)}`;
}
