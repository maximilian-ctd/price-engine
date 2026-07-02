import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { CACHE_TTL_MS, CACHE_VERSION } from './config.mjs';

const STORE_NAME = 'scrape-cache';
const VESTIAIRE_STORE = 'vestiaire-cache';
// Vestiaire scrape via ScraperAPI render is flaky. We keep a per-query cache
// of the last successful Vestiaire response — used as a fallback whenever the
// live scrape returns nothing, so the caller gets stale-but-real data instead
// of an empty column when ScraperAPI is slow.
const VESTIAIRE_FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function buildCacheKey({ brand = '', category = '', productName = '' }) {
  const hash = createHash('sha256')
    .update(`${brand}|${category}|${productName}`.toLowerCase().trim())
    .digest('hex')
    .slice(0, 16);
  return `${CACHE_VERSION}-${hash}`;
}

export function openStore() {
  try { return getStore(STORE_NAME); } catch { return null; }
}

export function openVestiaireStore() {
  try { return getStore(VESTIAIRE_STORE); } catch { return null; }
}

export async function readCache(store, key) {
  if (!store) return null;
  const entry = await store.get(key, { type: 'json' });
  if (!entry?.timestamp) return null;
  if (Date.now() - entry.timestamp >= CACHE_TTL_MS) return null;
  return entry;
}

export async function writeCache(store, key, body) {
  if (!store) return;
  await store.setJSON(key, { timestamp: Date.now(), body });
}

export async function readVestiaireFallback(store, key) {
  if (!store) return null;
  const entry = await store.get(key, { type: 'json' });
  if (!entry?.timestamp) return null;
  if (Date.now() - entry.timestamp >= VESTIAIRE_FALLBACK_TTL_MS) return null;
  return entry;
}

export async function writeVestiaireFallback(store, key, listings) {
  if (!store) return;
  await store.setJSON(key, { timestamp: Date.now(), listings });
}
