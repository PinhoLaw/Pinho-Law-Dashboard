/**
 * Persistent Clio data cache with stale-while-revalidate pattern.
 *
 * Layers (fastest → slowest):
 *   1. In-memory variable  — survives within a single serverless invocation
 *   2. /tmp filesystem      — survives across warm invocations of the same container
 *   3. Vercel Blob          — survives across cold starts & deployments (persistent)
 *   4. Live Clio API fetch  — ~38 seconds, only as last resort
 *
 * Strategy:
 *   - Every request reads from the fastest available layer instantly
 *   - If data is stale (>5 min), a background revalidation is triggered
 *   - The cron job (/api/clio/refresh) keeps the cache warm at all times
 */

import { put, head, del } from '@vercel/blob';
import * as fs from 'fs';

const TMP_PATH = '/tmp/clio-matters-cache.json';
const BLOB_KEY = 'clio-matters-cache.json';
const STALE_TTL_MS = 5 * 60 * 1000;  // 5 minutes — trigger background refresh after this

// Vercel Blob auto-creates env vars with prefix + key, e.g. BLOB__READ_WRITE_TOKEN
function getBlobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB__READ_WRITE_TOKEN;
}

interface CacheEntry {
  data: string;     // JSON string of the full response body
  fetchedAt: number; // Date.now() when data was fetched from Clio
}

// Layer 1: In-memory
let memoryCache: CacheEntry | null = null;

// Background revalidation lock — prevent multiple simultaneous refreshes
let isRevalidating = false;

/**
 * Read from the fastest available cache layer.
 * Returns { data, fetchedAt, source } or null if no cache exists anywhere.
 */
export async function readCache(): Promise<(CacheEntry & { source: string }) | null> {
  // Layer 1: Memory
  if (memoryCache) {
    return { ...memoryCache, source: 'memory' };
  }

  // Layer 2: /tmp filesystem
  try {
    if (fs.existsSync(TMP_PATH)) {
      const raw = fs.readFileSync(TMP_PATH, 'utf-8');
      const entry: CacheEntry = JSON.parse(raw);
      // Promote to memory
      memoryCache = entry;
      return { ...entry, source: 'tmp' };
    }
  } catch {
    // /tmp read failed, try Blob
  }

  // Layer 3: Vercel Blob
  try {
    const token = getBlobToken();
    if (token) {
      const blobInfo = await head(BLOB_KEY, { token }).catch(() => null);
      if (blobInfo?.url) {
        const res = await fetch(blobInfo.url);
        if (res.ok) {
          const raw = await res.text();
          const entry: CacheEntry = JSON.parse(raw);
          // Promote to memory + /tmp
          memoryCache = entry;
          try { fs.writeFileSync(TMP_PATH, raw); } catch { /* /tmp write fail ok */ }
          return { ...entry, source: 'blob' };
        }
      }
    }
  } catch {
    // Blob read failed
  }

  return null;
}

/**
 * Write data to ALL cache layers.
 */
export async function writeCache(data: string, fetchedAt: number): Promise<void> {
  const entry: CacheEntry = { data, fetchedAt };
  const entryJson = JSON.stringify(entry);

  // Layer 1: Memory
  memoryCache = entry;

  // Layer 2: /tmp
  try {
    fs.writeFileSync(TMP_PATH, entryJson);
  } catch {
    // /tmp write can fail in some environments
  }

  // Layer 3: Vercel Blob (persistent across deploys)
  try {
    const token = getBlobToken();
    if (token) {
      // Delete old blob first, then put new one
      try { await del(BLOB_KEY, { token }); } catch { /* ok */ }
      await put(BLOB_KEY, entryJson, {
        access: 'public',
        token,
        addRandomSuffix: false,
      });
    }
  } catch {
    // Blob write failed — /tmp and memory still work
  }
}

/**
 * Check if cached data is stale (older than STALE_TTL_MS).
 */
export function isStale(fetchedAt: number): boolean {
  return (Date.now() - fetchedAt) > STALE_TTL_MS;
}

/**
 * Returns true if a background revalidation is already in progress.
 */
export function getRevalidationLock(): boolean {
  return isRevalidating;
}

export function setRevalidationLock(val: boolean): void {
  isRevalidating = val;
}
