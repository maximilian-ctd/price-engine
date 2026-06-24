import * as cheerio from 'cheerio';
import { UA, PAGE_TIMEOUT_MS } from '../config.mjs';
import { fetchWithTimeout } from '../http.mjs';
import { parsePrice } from '../price-parser.mjs';

// Vestiaire is behind CloudFlare — direct requests get a "Just a moment..." 403.
// We need a JS-rendering proxy. ScraperAPI's `render=true` (10 credits/req) works
// on the free plan. Without an API key the function still attempts a direct fetch
// (will fail) and reports it via `diag` so the caller knows to degrade.
export async function scrapePage({ brand, productName, page, diag }) {
  const q = `${brand} ${productName}`.trim();
  const target = `https://www.vestiairecollective.com/search/?q=${encodeURIComponent(q)}&page=${page}`;

  const scraperKey = process.env.SCRAPER_API_KEY;
  if (page === 1) diag.push(`vestiaire: scraperapi ${scraperKey ? 'enabled' : 'DISABLED'}`);
  const url = scraperKey
    ? `https://api.scraperapi.com/?api_key=${scraperKey}&url=${encodeURIComponent(target)}&render=true`
    : target;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9' },
    }, scraperKey ? 22000 : PAGE_TIMEOUT_MS);
    diag.push(`vestiaire p${page}: HTTP ${res.status}`);
    if (!res.ok) return [];
    const html = await res.text();
    if (/Just a moment|cf-chl|cloudflare/i.test(html.slice(0, 2000))) {
      diag.push(`vestiaire p${page}: blocked by CloudFlare`);
      return [];
    }

    // Preferred: structured data from Next.js hydration payload (sometimes empty
    // when the search results are loaded client-side, hence the DOM fallback).
    const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const search = data?.props?.pageProps?.initialState?.search
                   || data?.props?.pageProps?.searchInitialState
                   || {};
        const list = search.products || search.items
                 || data?.props?.pageProps?.products
                 || data?.props?.pageProps?.initialProducts
                 || [];
        const arr = Array.isArray(list) ? list : (list?.items || []);
        const mapped = arr.map(p => ({
          platform: 'vestiaire',
          title: p.name || p.title || p.model?.name || '',
          price: parseFloat(p.price?.cents ? p.price.cents / 100 : (p.price?.amount ?? p.price ?? 0)),
          currency: p.price?.currency || 'EUR',
          url: p.link || p.url || (p.id ? `https://www.vestiairecollective.com/p-${p.id}.shtml` : undefined),
          image: p.pictures?.[0]?.url || p.image?.url || p.pictureUrl,
          brand: p.brand?.name,
          condition: p.condition?.name || p.condition,
          size: p.size?.label,
        })).filter(l => l.price > 0 && l.title);
        if (mapped.length > 0) {
          diag.push(`vestiaire p${page}: ${mapped.length} items (NEXT_DATA)`);
          return mapped;
        }
      } catch {
        diag.push(`vestiaire p${page}: NEXT_DATA parse failed`);
      }
    }

    // DOM fallback: Vestiaire uses CSS-modules; class names contain
    // 'product-card_productCard__' followed by a hash.
    const $ = cheerio.load(html);
    const listings = [];
    $('[class*="product-card_productCard__"]').each((_, el) => {
      const $el = $(el);
      if ($el.parents('[class*="product-card_productCard__"]').length > 0) return;
      const linkLabel = $el.find('a[class*="productLink"], a').first().attr('aria-label')?.trim();
      const imgAlt = $el.find('img').first().attr('alt')?.trim();
      const title = linkLabel
                 || imgAlt
                 || $el.find('[class*="productCard__text__top"], [class*="productCard__title"], [class*="brand"], [class*="description"]').first().text().trim()
                 || '';
      const price = parsePrice(
        $el.find('[class*="productCard__text--price"]:not([class*="regularPrice"])').first().text()
        || $el.find('[class*="productCard__text--price"]').first().text()
      );
      if (!price) return;
      const href = $el.find('a[class*="productLink"], a').first().attr('href');
      listings.push({
        platform: 'vestiaire',
        title: title || 'Vestiaire product',
        price,
        currency: 'EUR',
        url: href?.startsWith('http') ? href : href ? `https://www.vestiairecollective.com${href}` : undefined,
        image: $el.find('img').first().attr('src'),
      });
    });
    diag.push(`vestiaire p${page}: ${listings.length} items (DOM)`);
    return listings;
  } catch (e) {
    diag.push(`vestiaire p${page}: error ${e.message}`);
    return [];
  }
}
