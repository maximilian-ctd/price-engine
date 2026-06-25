import * as cheerio from 'cheerio';
import { UA } from '../config.mjs';
import { fetchWithTimeout } from '../http.mjs';
import { parsePrice } from '../price-parser.mjs';

// Farfetch is behind Akamai bot protection — direct requests get 403.
// Always route through ScraperAPI (1 credit/req, no render needed for SSR HTML).
// /de/ path returns prices in EUR; uses /women/ as the default catalog (the
// site has separate /men/ and /kids/ trees but /women/ catches the bulk of
// luxury bags + accessories the engine is built for).
export async function scrapePage({ brand, productName, page, diag }) {
  const scraperKey = process.env.SCRAPER_API_KEY;
  if (!scraperKey) {
    diag.push('farfetch: scraperapi DISABLED — skipping');
    return [];
  }
  if (page === 1) diag.push('farfetch: scraperapi enabled');

  const q = `${brand} ${productName}`.trim();
  const target = `https://www.farfetch.com/de/shopping/women/items.aspx?q=${encodeURIComponent(q)}&page=${page}`;
  const url = `https://api.scraperapi.com/?api_key=${scraperKey}&url=${encodeURIComponent(target)}`;

  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 15000);
    diag.push(`farfetch p${page}: HTTP ${res.status}`);
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const listings = [];

    $('[data-testid="product-card"]').each((_, el) => {
      const $el = $(el);
      // Farfetch uses data-component (not data-testid) for the actual brand/description.
      // The data-testid="product-card-label-primary" is the "Neue Saison"/sale badge — not the title.
      const brandText = $el.find('[data-component="ProductCardBrandName"]').first().text().trim();
      const descText = $el.find('[data-component="ProductCardDescription"]').first().text().trim();
      const title = [brandText, descText].filter(Boolean).join(' — ').trim()
                 || $el.find('img').first().attr('alt')?.trim()
                 || '';
      const price = parsePrice($el.find('[data-component="PriceBrief"], [data-testid="product-card-price"]').first().text());
      if (!price) return;
      const href = $el.find('a[data-component="ProductCardLink"], a').first().attr('href');
      listings.push({
        platform: 'farfetch',
        title: title || 'Farfetch item',
        price,
        currency: 'EUR',
        url: href?.startsWith('http') ? href : href ? `https://www.farfetch.com${href}` : undefined,
        image: $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src'),
        brand: brandText || undefined,
      });
    });

    diag.push(`farfetch p${page}: ${listings.length} items`);
    return listings;
  } catch (e) {
    diag.push(`farfetch p${page}: error ${e.message}`);
    return [];
  }
}
