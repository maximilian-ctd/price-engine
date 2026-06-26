import * as cheerio from 'cheerio';
import { UA } from '../config.mjs';
import { fetchWithTimeout } from '../http.mjs';
import { parsePrice } from '../price-parser.mjs';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchEbay(target, page, diag) {
  // Try direct first (free). If blocked (403/429), retry via ScraperAPI when configured.
  const direct = await fetchWithTimeout(target, { headers: BROWSER_HEADERS });
  diag.push(`ebay p${page}: HTTP ${direct.status}`);
  if (direct.ok) return direct;

  const key = process.env.SCRAPER_API_KEY;
  if (!key || ![403, 429].includes(direct.status)) return direct;

  // Only retry page 1 via ScraperAPI — pages 2/3 are skipped to stay within the
  // free plan's concurrency limit (5) shared with Vestiaire/Farfetch/Google.
  // Page 1 still returns ~60 items which is plenty for pricing analysis.
  if (page !== 1) {
    diag.push(`ebay p${page}: skipped (page 2+ retries disabled to save ScraperAPI concurrency)`);
    return direct;
  }

  const proxied = await fetchWithTimeout(
    `https://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent(target)}`,
    { headers: { 'User-Agent': UA } },
    15000
  );
  diag.push(`ebay p${page}: scraperapi retry HTTP ${proxied.status}`);
  return proxied;
}

// eBay migrated from `.s-item` to `.s-card` in 2024. We try the new layout first
// and fall back to the legacy one when no cards are matched.
export async function scrapePage({ brand, productName, category, page, diag }) {
  const q = [brand, productName, category].filter(Boolean).join(' ').trim();
  const url = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q)}&_ipg=60&_pgn=${page}`;

  try {
    const res = await fetchEbay(url, page, diag);
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const listings = [];

    $('.s-card').each((_, el) => {
      const $el = $(el);
      const title = $el.find('.s-card__title, .su-styled-text.primary.bold, [role="heading"]').first().text().trim();
      const price = parsePrice($el.find('.s-card__price').first().text());
      const href = $el.find('a.s-card__link, a').first().attr('href');
      if (!title || !price || !href) return;
      if (/^shop on ebay$/i.test(title)) return;
      listings.push({
        platform: 'ebay',
        title,
        price,
        currency: 'EUR',
        url: href,
        image: $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src'),
        condition: $el.find('.s-card__subtitle, .SECONDARY_INFO').first().text().trim() || undefined,
      });
    });

    if (listings.length === 0) {
      $('li.s-item, .s-item').each((_, el) => {
        const $el = $(el);
        const title = $el.find('.s-item__title, [role="heading"]').first().text().trim();
        if (!title || /^shop on ebay$/i.test(title)) return;
        const price = parsePrice($el.find('.s-item__price').first().text());
        if (!price) return;
        listings.push({
          platform: 'ebay',
          title,
          price,
          currency: 'EUR',
          url: $el.find('a.s-item__link').first().attr('href'),
          image: $el.find('.s-item__image-img, img').first().attr('src'),
        });
      });
    }

    diag.push(`ebay p${page}: ${listings.length} items`);
    return listings;
  } catch (e) {
    diag.push(`ebay p${page}: error ${e.message}`);
    return [];
  }
}
