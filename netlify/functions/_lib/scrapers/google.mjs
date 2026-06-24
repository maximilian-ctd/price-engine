import { fetchWithTimeout } from '../http.mjs';

// Google Shopping via ScraperAPI's structured endpoint.
// One call returns ~40 results across retailers (Farfetch, Sotheby's, Catawiki,
// independent boutiques, etc.) — broad coverage, no pagination needed.
// Costs 5 credits per request. Disabled without SCRAPER_API_KEY.
export async function scrapeShopping({ brand, productName, diag }) {
  const scraperKey = process.env.SCRAPER_API_KEY;
  if (!scraperKey) {
    diag.push('google: scraperapi DISABLED — skipping');
    return [];
  }
  diag.push('google: scraperapi enabled');

  const q = `${brand} ${productName}`.trim();
  const url = `https://api.scraperapi.com/structured/google/shopping?api_key=${scraperKey}&query=${encodeURIComponent(q)}&country=de`;

  try {
    const res = await fetchWithTimeout(url, {}, 20000);
    diag.push(`google: HTTP ${res.status}`);
    if (!res.ok) return [];

    const data = await res.json();
    const results = data.shopping_results || [];
    const listings = results.map(r => {
      // ScraperAPI rewrites outbound product links to go through its proxy.
      // Strip the wrapper to surface the real merchant URL.
      let rawLink = r.link || '';
      try {
        const u = new URL(rawLink);
        const inner = u.searchParams.get('url');
        if (inner) rawLink = decodeURIComponent(inner);
      } catch { /* keep raw */ }

      return {
        platform: 'google',
        title: r.title || '',
        price: typeof r.extracted_price === 'number' ? r.extracted_price : 0,
        currency: 'EUR',
        url: rawLink || undefined,
        image: typeof r.thumbnail === 'string' && r.thumbnail.startsWith('http') ? r.thumbnail : undefined,
        source: r.source || undefined,   // e.g. "farfetch.com", "Sotheby's"
      };
    }).filter(l => l.price > 0);

    diag.push(`google: ${listings.length} items`);
    return listings;
  } catch (e) {
    diag.push(`google: error ${e.message}`);
    return [];
  }
}
