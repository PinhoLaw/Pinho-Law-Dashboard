/**
 * Microsoft Graph API Integration — Outlook Calendar + Execution Blocks
 *
 * Environment Variables:
 *   MSGRAPH_CLIENT_ID     — Azure AD app client ID
 *   MSGRAPH_CLIENT_SECRET — Azure AD app client secret
 *   MSGRAPH_TENANT_ID     — Azure AD tenant ID
 *   MSGRAPH_REFRESH_TOKEN — User refresh token
 *   MSGRAPH_USER_EMAIL    — Target user email (optional, defaults to /me)
 *
 * Capabilities:
 *   - Read Outlook calendar events
 *   - Create/update execution block events
 *   - Detect scheduling conflicts
 *   - Webhook subscriptions for new events
 *   - OAuth2 token management
 *   - Rate limiting with retry
 */

// ─── Configuration ───────────────────────────────────────

const GRAPH_TOKEN_URL = 'https://login.microsoftonline.com';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

const MSGRAPH_CLIENT_ID = process.env.MSGRAPH_CLIENT_ID!;
const MSGRAPH_CLIENT_SECRET = process.env.MSGRAPH_CLIENT_SECRET!;
const MSGRAPH_TENANT_ID = process.env.MSGRAPH_TENANT_ID!;

// ─── Token Cache ─────────────────────────────────────────

interface GraphTokenCache {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

let graphTokenCache: GraphTokenCache | null = null;

// ─── Rate Limiter ────────────────────────────────────────

class GraphRateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private readonly maxConcurrent = 4; // Graph is stricter
  private readonly minDelay = 100;
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
    if (this.queue.length > 0) this.queue.shift()!();
  }
}

const graphRateLimiter = new GraphRateLimiter();

// ─── OAuth2 ──────────────────────────────────────────────

export function getGraphAuthorizationUrl(redirectUri: string): string {
  return (
    `${GRAPH_TOKEN_URL}/${MSGRAPH_TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(MSGRAPH_CLIENT_ID)}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent('Calendars.ReadWrite offline_access')}`
  );
}

export async function exchangeGraphCode(code: string, redirectUri: string): Promise<GraphTokenCache> {
  const body = new URLSearchParams({
    client_id: MSGRAPH_CLIENT_ID,
    client_secret: MSGRAPH_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: 'Calendars.ReadWrite offline_access',
  });

  const res = await fetch(`${GRAPH_TOKEN_URL}/${MSGRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Graph token exchange failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  graphTokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return graphTokenCache;
}

async function refreshGraphToken(): Promise<string> {
  const refreshToken = graphTokenCache?.refresh_token || process.env.MSGRAPH_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('No Graph refresh token. Complete OAuth2 flow first.');

  const body = new URLSearchParams({
    client_id: MSGRAPH_CLIENT_ID,
    client_secret: MSGRAPH_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'Calendars.ReadWrite offline_access',
  });

  const res = await fetch(`${GRAPH_TOKEN_URL}/${MSGRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Graph token refresh failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  graphTokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return graphTokenCache.access_token;
}

async function getGraphToken(): Promise<string> {
  if (graphTokenCache && graphTokenCache.expires_at > Date.now() + 60_000) {
    return graphTokenCache.access_token;
  }
  return refreshGraphToken();
}

// ─── HTTP Client with Retry ──────────────────────────────

async function graphRequest<T = Record<string, unknown>>(opts: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  retries?: number;
}): Promise<T> {
  const { method, path, body, retries = 3 } = opts;

  await graphRateLimiter.acquire();
  try {
    const token = await getGraphToken();

    const res = await fetch(`${GRAPH_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && retries > 0) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10);
      const backoff = retryAfter * 1000 * (4 - retries);
      console.log(`[Graph] Rate limited. Backing off ${backoff}ms`);
      await sleep(backoff);
      return graphRequest({ ...opts, retries: retries - 1 });
    }

    if (res.status >= 500 && retries > 0) {
      const backoff = 3000 * (4 - retries);
      await sleep(backoff);
      return graphRequest({ ...opts, retries: retries - 1 });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph ${method} ${path} failed (${res.status}): ${text}`);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  } finally {
    graphRateLimiter.release();
  }
}

// ─── Calendar: Read Events ───────────────────────────────

export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  location?: { displayName: string };
  categories: string[];
  bodyPreview: string;
  organizer?: { emailAddress: { name: string; address: string } };
}

/**
 * Read calendar events for a date range.
 */
export async function readCalendarEvents(
  startDate: string,
  endDate: string,
): Promise<OutlookEvent[]> {
  const userPath = process.env.MSGRAPH_USER_EMAIL
    ? `/users/${process.env.MSGRAPH_USER_EMAIL}`
    : '/me';

  const data = await graphRequest<{ value: OutlookEvent[] }>({
    method: 'GET',
    path: `${userPath}/calendarView?startDateTime=${startDate}T00:00:00Z&endDateTime=${endDate}T23:59:59Z&$orderby=start/dateTime&$top=100`,
  });

  return data.value || [];
}

/**
 * Get events for today.
 */
export async function getTodayEvents(): Promise<OutlookEvent[]> {
  const today = new Date().toISOString().split('T')[0];
  return readCalendarEvents(today, today);
}

/**
 * Get events for the current week.
 */
export async function getWeekEvents(): Promise<OutlookEvent[]> {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  return readCalendarEvents(
    startOfWeek.toISOString().split('T')[0],
    endOfWeek.toISOString().split('T')[0],
  );
}

// ─── Calendar: Execution Blocks ──────────────────────────

/**
 * Create a protected execution block (SOP §6).
 * These are calendar events marked with a special category.
 */
export async function createExecutionBlock(opts: {
  date: string; // YYYY-MM-DD
  startHour: number; // 9
  endHour: number; // 12
  title?: string;
  matterId?: string;
}): Promise<OutlookEvent> {
  const userPath = process.env.MSGRAPH_USER_EMAIL
    ? `/users/${process.env.MSGRAPH_USER_EMAIL}`
    : '/me';

  const data = await graphRequest<OutlookEvent>({
    method: 'POST',
    path: `${userPath}/events`,
    body: {
      subject: opts.title || `[EXECUTION BLOCK] ${opts.matterId || 'Deep Work'}`,
      start: {
        dateTime: `${opts.date}T${String(opts.startHour).padStart(2, '0')}:00:00`,
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: `${opts.date}T${String(opts.endHour).padStart(2, '0')}:00:00`,
        timeZone: 'America/New_York',
      },
      categories: ['PinhoLaw Execution Block'],
      showAs: 'busy',
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
      body: {
        contentType: 'Text',
        content: `Protected execution block — SOP §6. ${opts.matterId ? `Matter: ${opts.matterId}` : 'Do not schedule over this time.'}`,
      },
    },
  });

  return data;
}

/**
 * Find all execution blocks in a date range.
 */
export async function getExecutionBlocks(
  startDate: string,
  endDate: string,
): Promise<OutlookEvent[]> {
  const events = await readCalendarEvents(startDate, endDate);
  return events.filter(e =>
    e.categories?.includes('PinhoLaw Execution Block') ||
    e.subject?.includes('[EXECUTION BLOCK]')
  );
}

// ─── Conflict Detection ─────────────────────────────────

/**
 * Check if a proposed time slot conflicts with existing events.
 */
export async function checkConflicts(
  date: string,
  startHour: number,
  endHour: number,
): Promise<{ hasConflict: boolean; conflicts: OutlookEvent[] }> {
  const events = await readCalendarEvents(date, date);

  const proposedStart = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00`);
  const proposedEnd = new Date(`${date}T${String(endHour).padStart(2, '0')}:00:00`);

  const conflicts = events.filter(event => {
    const eventStart = new Date(event.start.dateTime);
    const eventEnd = new Date(event.end.dateTime);
    return eventStart < proposedEnd && eventEnd > proposedStart;
  });

  return { hasConflict: conflicts.length > 0, conflicts };
}

// ─── Webhook Subscription ────────────────────────────────

/**
 * Create a webhook subscription for new calendar events.
 * Graph webhooks expire and need renewal.
 */
export async function createCalendarWebhook(
  notificationUrl: string,
  clientState: string = 'pinholaw-calendar-webhook',
): Promise<Record<string, unknown>> {
  const expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

  return graphRequest({
    method: 'POST',
    path: '/subscriptions',
    body: {
      changeType: 'created,updated,deleted',
      notificationUrl,
      resource: process.env.MSGRAPH_USER_EMAIL
        ? `/users/${process.env.MSGRAPH_USER_EMAIL}/events`
        : '/me/events',
      expirationDateTime: expiration.toISOString(),
      clientState,
    },
  });
}

/**
 * Renew a webhook subscription before it expires.
 */
export async function renewCalendarWebhook(subscriptionId: string): Promise<Record<string, unknown>> {
  const expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  return graphRequest({
    method: 'PATCH',
    path: `/subscriptions/${subscriptionId}`,
    body: {
      expirationDateTime: expiration.toISOString(),
    },
  });
}

// ─── Webhook Handler ─────────────────────────────────────

export interface GraphWebhookNotification {
  changeType: 'created' | 'updated' | 'deleted';
  clientState: string;
  resource: string;
  resourceData: {
    id: string;
    '@odata.type': string;
  };
  subscriptionId: string;
  tenantId: string;
}

/**
 * Validate and parse a Graph webhook notification.
 * Graph sends a validation request first (with validationToken query param).
 */
export function handleGraphWebhookValidation(validationToken: string): string {
  return validationToken; // Return as-is for validation handshake
}

/**
 * Process a calendar webhook notification.
 * Fetches the full event data and returns it.
 */
export async function processCalendarWebhook(
  notification: GraphWebhookNotification,
): Promise<{
  changeType: string;
  event: OutlookEvent | null;
}> {
  if (notification.changeType === 'deleted') {
    return { changeType: 'deleted', event: null };
  }

  // Fetch the full event
  const userPath = process.env.MSGRAPH_USER_EMAIL
    ? `/users/${process.env.MSGRAPH_USER_EMAIL}`
    : '/me';
  const eventId = notification.resourceData.id;

  try {
    const event = await graphRequest<OutlookEvent>({
      method: 'GET',
      path: `${userPath}/events/${eventId}`,
    });
    return { changeType: notification.changeType, event };
  } catch (err) {
    console.error(`[Graph] Failed to fetch event ${eventId}:`, err);
    return { changeType: notification.changeType, event: null };
  }
}

// ─── Utility ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
