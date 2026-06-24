import { scrapeAll } from './_lib/orchestrator.mjs';
import { buildCacheKey, openStore, readCache, writeCache } from './_lib/cache.mjs';
import { PAGES_PER_PLATFORM } from './_lib/config.mjs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MIN_CACHEABLE_LISTINGS = 5;

function jsonResponse(body, { status = 200, cacheStatus } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(cacheStatus ? { 'X-Cache': cacheStatus } : {}),
    },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand = '', category = '', productName = '', bypassCache = false } = body;
  if (!brand && !productName) {
    return jsonResponse({ error: 'brand or productName required' }, { status: 400 });
  }

  const t0 = Date.now();
  const diag = [];
  const cacheKey = buildCacheKey({ brand, category, productName });
  const store = openStore();

  if (store && !bypassCache) {
    try {
      const entry = await readCache(store, cacheKey);
      if (entry) {
        entry.body.meta = {
          ...entry.body.meta,
          cached: true,
          cacheAgeMinutes: Math.round((Date.now() - entry.timestamp) / 60000),
          responseDurationMs: Date.now() - t0,
        };
        return jsonResponse(entry.body, { cacheStatus: 'HIT' });
      }
    } catch (e) {
      diag.push(`cache read failed: ${e.message}`);
    }
  }

  const { vinted, ebay, vestiaire } = await scrapeAll({ brand, category, productName, diag });

  const responseBody = {
    vinted, ebay, vestiaire,
    meta: {
      query: { brand, category, productName },
      pagesPerPlatform: PAGES_PER_PLATFORM,
      durationMs: Date.now() - t0,
      counts: {
        vinted: vinted.listings.length,
        ebay: ebay.listings.length,
        vestiaire: vestiaire.listings.length,
      },
      diagnostics: diag,
      cached: false,
    },
  };

  const total = vinted.listings.length + ebay.listings.length + vestiaire.listings.length;
  if (store && total >= MIN_CACHEABLE_LISTINGS) {
    try { await writeCache(store, cacheKey, responseBody); }
    catch (e) { diag.push(`cache write failed: ${e.message}`); }
  }

  return jsonResponse(responseBody, { cacheStatus: 'MISS' });
};

export const config = { path: '/.netlify/functions/scrape-prices' };
