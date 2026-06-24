// Shared configuration constants for all scrapers and orchestration.

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const PAGES_PER_PLATFORM = 3;
export const PAGE_TIMEOUT_MS = 8000;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Bump when response shape changes — invalidates all existing cache entries.
export const CACHE_VERSION = 'v3';

// Vinted brand IDs (vinted.de). Used as `brand_ids[]` filter on the search API.
// To add a brand: search for it on vinted.de and inspect the network request to
// /api/v2/catalog/items — the `brand_ids[]` query param holds the numeric ID.
export const VINTED_BRAND_IDS = {
  'Hermès': 4785, 'Hermes': 4785,
  'Chanel': 481,
  'Louis Vuitton': 417,
  'Gucci': 567,
  'Dior': 671,
  'Prada': 3573,
  'Bottega Veneta': 86972,
  'Saint Laurent': 377,
  'Celine': 1443,
  'Balenciaga': 2369,
  'Loewe': 24209,
  'Valentino': 15450529,
  'Burberry': 364,
  'Fendi': 1189,
  'Givenchy': 2371,
  'Miu Miu': 1745,
  'Versace': 2293,
  'Dolce & Gabbana': 1043,
  'Alexander McQueen': 52193,
  'Jacquemus': 168278,
};
