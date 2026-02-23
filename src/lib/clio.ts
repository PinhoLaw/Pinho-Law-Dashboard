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
 * Uses standard OAuth2 form-urlencoded body params as per Clio documentation.
 */
export async function exchangeCodeForToken(code: string) {
  console.log('[Clio] Exchanging code for token...');
  console.log('[Clio] Client ID:', CLIO_CLIENT_ID?.substring(0, 8) + '...');
  console.log('[Clio] Redirect URI:', CLIO_REDIRECT_URI);
  console.log('[Clio] Code:', code.substring(0, 10) + '... (' + code.length + ' chars)');

  // Standard OAuth2: client credentials in body (per Clio docs)
  const body = new URLSearchParams();
  body.append('client_id', CLIO_CLIENT_ID);
  body.append('client_secret', CLIO_CLIENT_SECRET);
  body.append('grant_type', 'authorization_code');
  body.append('code', code);
  body.append('redirect_uri', CLIO_REDIRECT_URI);

  const res = await fetch(CLIO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[Clio] Token exchange failed:', res.status, errorBody);
    throw new Error(
      `Clio token exchange failed (HTTP ${res.status}): ${errorBody}\n` +
      `Client ID prefix: ${CLIO_CLIENT_ID?.substring(0, 8)}...\n` +
      `Redirect URI: ${CLIO_REDIRECT_URI}\n` +
      `Code prefix: ${code.substring(0, 10)}...`
    );
  }

  const data = await res.json();
  console.log('[Clio] Token exchange successful! Token type:', data.token_type);
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
 * Sleep helper
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an authenticated GET request to Clio API v4
 * Includes automatic retry on 429 rate limit errors
 */
export async function clioGet(path: string, params: Record<string, string> = {}, retries = 3): Promise<Record<string, unknown>> {
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

  // Handle rate limiting with retry
  if (res.status === 429 && retries > 0) {
    const retryHeader = res.headers.get('Retry-After');
    const waitSeconds = retryHeader ? parseInt(retryHeader, 10) : 20;
    console.log(`[Clio] Rate limited. Waiting ${waitSeconds}s before retry (${retries} left)...`);
    await sleep(waitSeconds * 1000);
    return clioGet(path, params, retries - 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clio API ${res.status}: ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Paginate through all results for a Clio API endpoint.
 * Adds a small delay between pages to avoid hitting Clio's rate limit (50 req/s).
 */
export async function clioGetAll(path: string, params: Record<string, string> = {}) {
  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 200;
  let page = 0;

  while (true) {
    // Throttle: wait 250ms between pages (max ~4 req/s per dataset)
    if (page > 0) await sleep(250);

    const data = await clioGet(path, { ...params, limit: String(limit), offset: String(offset) });
    const items = (data.data || []) as Record<string, unknown>[];
    results.push(...items);
    if (items.length < limit) break;
    offset += limit;
    page++;
  }

  return results;
}

/**
 * Make an authenticated POST request to Clio API v4.
 * Includes automatic retry on 429 rate limit errors.
 */
export async function clioPost(
  path: string,
  body: Record<string, unknown>,
  retries = 3
): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const url = `${CLIO_API_BASE}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 && retries > 0) {
    const retryHeader = res.headers.get('Retry-After');
    const waitSeconds = retryHeader ? parseInt(retryHeader, 10) : 20;
    console.log(`[Clio] Rate limited on POST. Waiting ${waitSeconds}s (${retries} retries left)...`);
    await sleep(waitSeconds * 1000);
    return clioPost(path, body, retries - 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clio API POST ${res.status}: ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Get the Clio authorization URL for the OAuth2 flow
 */
export function getAuthorizationUrl(): string {
  return `https://app.clio.com/oauth/authorize?response_type=code&client_id=${CLIO_CLIENT_ID}&redirect_uri=${encodeURIComponent(CLIO_REDIRECT_URI)}`;
}
