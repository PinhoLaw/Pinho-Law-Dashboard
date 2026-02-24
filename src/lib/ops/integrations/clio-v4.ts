/**
 * Clio V4 API Integration — Secure OAuth2, Rate Limiting, Retry Logic
 *
 * Environment Variables:
 *   CLIO_CLIENT_ID       — OAuth2 client ID
 *   CLIO_CLIENT_SECRET   — OAuth2 client secret
 *   CLIO_REDIRECT_URI    — OAuth2 redirect URI
 *   CLIO_REFRESH_TOKEN   — Long-lived refresh token
 *
 * Capabilities:
 *   - Create/update tasks on Clio matters
 *   - Create/update time entries from JSON state
 *   - Full OAuth2 lifecycle (exchange, refresh)
 *   - Rate limiting (50 req/s) with exponential backoff
 *   - Automatic retry on 429/5xx
 */

// ─── Configuration ───────────────────────────────────────

const CLIO_TOKEN_URL = 'https://app.clio.com/oauth/token';
const CLIO_API_BASE = 'https://app.clio.com/api/v4';

const CLIO_CLIENT_ID = process.env.CLIO_CLIENT_ID!;
const CLIO_CLIENT_SECRET = process.env.CLIO_CLIENT_SECRET!;
const CLIO_REDIRECT_URI = process.env.CLIO_REDIRECT_URI || 'http://localhost:3000/api/clio/callback';

// ─── Token Cache ─────────────────────────────────────────

interface TokenCache {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

let tokenCache: TokenCache | null = null;

// ─── Rate Limiter ────────────────────────────────────────

class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private readonly maxConcurrent = 10;
  private readonly minDelay = 25; // ms between requests (40/s max)
  private lastRequest = 0;

  async acquire(): Promise<void> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.running++;

    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await sleep(this.minDelay - elapsed);
    }
    this.lastRequest = Date.now();
  }

  release(): void {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }
}

const rateLimiter = new RateLimiter();

// ─── OAuth2 ──────────────────────────────────────────────

export function getClioAuthorizationUrl(): string {
  return (
    `https://app.clio.com/oauth/authorize?` +
    `response_type=code&` +
    `client_id=${encodeURIComponent(CLIO_CLIENT_ID)}&` +
    `redirect_uri=${encodeURIComponent(CLIO_REDIRECT_URI)}`
  );
}

export async function exchangeCodeForToken(code: string): Promise<TokenCache> {
  const body = new URLSearchParams({
    client_id: CLIO_CLIENT_ID,
    client_secret: CLIO_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: CLIO_REDIRECT_URI,
  });

  const res = await fetch(CLIO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clio token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return tokenCache;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenCache?.refresh_token || process.env.CLIO_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('No refresh token available. Complete OAuth2 flow first.');

  const body = new URLSearchParams({
    client_id: CLIO_CLIENT_ID,
    client_secret: CLIO_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(CLIO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clio token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.access_token;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expires_at > Date.now() + 60_000) {
    return tokenCache.access_token;
  }
  return refreshAccessToken();
}

// ─── HTTP Client with Retry ──────────────────────────────

interface ClioRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  retries?: number;
}

async function clioRequest<T = Record<string, unknown>>(opts: ClioRequestOptions): Promise<T> {
  const { method, path, params, body, retries = 3 } = opts;

  await rateLimiter.acquire();
  try {
    const token = await getAccessToken();
    const url = new URL(`${CLIO_API_BASE}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Rate limiting with exponential backoff
    if (res.status === 429 && retries > 0) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '20', 10);
      const backoff = retryAfter * 1000 * (4 - retries); // exponential
      console.log(`[Clio] Rate limited. Backing off ${backoff}ms (${retries} retries left)`);
      await sleep(backoff);
      return clioRequest({ ...opts, retries: retries - 1 });
    }

    // Server errors with retry
    if (res.status >= 500 && retries > 0) {
      const backoff = 2000 * (4 - retries);
      console.log(`[Clio] Server error ${res.status}. Retry in ${backoff}ms`);
      await sleep(backoff);
      return clioRequest({ ...opts, retries: retries - 1 });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Clio API ${method} ${path} failed (${res.status}): ${text}`);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  } finally {
    rateLimiter.release();
  }
}

// ─── Task Operations ─────────────────────────────────────

export interface ClioTask {
  id?: number;
  name: string;
  description?: string;
  due_at?: string; // ISO 8601
  priority?: 'High' | 'Normal' | 'Low';
  status?: 'pending' | 'complete';
  assignee?: { id: number };
  matter?: { id: number };
}

/**
 * Create a task on a Clio matter from JSON state data.
 */
export async function createClioTask(task: ClioTask): Promise<{ data: ClioTask & { id: number } }> {
  return clioRequest({
    method: 'POST',
    path: '/tasks.json',
    body: {
      data: {
        name: task.name,
        description: task.description || '',
        due_at: task.due_at,
        priority: task.priority || 'Normal',
        status: task.status || 'pending',
        assignee: task.assignee,
        matter: task.matter,
      },
    },
  });
}

/**
 * Update an existing Clio task.
 */
export async function updateClioTask(taskId: number, updates: Partial<ClioTask>): Promise<{ data: ClioTask }> {
  return clioRequest({
    method: 'PATCH',
    path: `/tasks/${taskId}.json`,
    body: { data: updates },
  });
}

// ─── Time Entry Operations ───────────────────────────────

export interface ClioTimeEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  quantity: number; // hours
  rate?: number;
  total?: number;
  type: 'TimeEntry';
  note: string;
  matter: { id: number };
  user?: { id: number };
}

/**
 * Create a time entry on a Clio matter from billing JSON data.
 */
export async function createClioTimeEntry(entry: {
  date: string;
  hours: number;
  rate: number;
  description: string;
  matter_id: number;
  user_id?: number;
}): Promise<{ data: ClioTimeEntry & { id: number } }> {
  return clioRequest({
    method: 'POST',
    path: '/activities.json',
    body: {
      data: {
        date: entry.date,
        quantity: entry.hours,
        rate: entry.rate,
        total: entry.hours * entry.rate,
        type: 'TimeEntry',
        note: entry.description,
        matter: { id: entry.matter_id },
        ...(entry.user_id ? { user: { id: entry.user_id } } : {}),
      },
    },
  });
}

/**
 * Update an existing Clio time entry.
 */
export async function updateClioTimeEntry(
  entryId: number,
  updates: Partial<{
    date: string;
    quantity: number;
    rate: number;
    note: string;
  }>,
): Promise<{ data: ClioTimeEntry }> {
  return clioRequest({
    method: 'PATCH',
    path: `/activities/${entryId}.json`,
    body: { data: updates },
  });
}

// ─── Matter Operations ───────────────────────────────────

/**
 * Get a Clio matter by ID with full fields.
 */
export async function getClioMatter(matterId: number): Promise<Record<string, unknown>> {
  return clioRequest({
    method: 'GET',
    path: `/matters/${matterId}.json`,
    params: {
      fields: 'id,display_number,description,status,client{id,name},responsible_attorney{id,name},open_date,close_date',
    },
  });
}

/**
 * List all matters with pagination.
 */
export async function listClioMatters(params?: {
  status?: 'Open' | 'Closed' | 'Pending';
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = params?.limit || 200;

  while (true) {
    const reqParams: Record<string, string> = {
      fields: 'id,display_number,description,status,client{id,name},responsible_attorney{id,name}',
      limit: String(limit),
      offset: String(offset),
    };
    if (params?.status) reqParams.status = params.status;

    const data = await clioRequest<{ data: Record<string, unknown>[] }>({
      method: 'GET',
      path: '/matters.json',
      params: reqParams,
    });

    results.push(...(data.data || []));
    if ((data.data?.length || 0) < limit) break;
    offset += limit;
    await sleep(250); // rate limit buffer
  }

  return results;
}

// ─── Webhook Handler ─────────────────────────────────────

export interface ClioWebhookPayload {
  type: string;
  data: {
    id: number;
    type: string;
    [key: string]: unknown;
  };
  event: string;
  created_at: string;
}

/**
 * Verify and parse a Clio webhook payload.
 * Clio webhooks use HMAC-SHA256 for signature verification.
 */
export async function verifyClioWebhook(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const secret = process.env.CLIO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[Clio] No webhook secret configured, skipping verification');
    return true;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    hexToBuffer(signature),
    encoder.encode(rawBody),
  );

  return valid;
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

// ─── Utility ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
