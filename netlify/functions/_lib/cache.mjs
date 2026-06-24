import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { CACHE_TTL_MS, CACHE_VERSION } from './config.mjs';

const STORE_NAME = 'scrape-cache';

export function buildCacheKey({ brand = '', category = '', productName = '' }) {
  const hash = createHash('sha256')
    .update(`${brand}|${category}|${productName}`.toLowerCase().trim())
    .digest('hex')
    .slice(0, 16);
  return `${CACHE_VERSION}-${hash}`;
}

export function openStore() {
  try {
    return getStore(STORE_NAME);
  } catch {
    return null;
  }
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
