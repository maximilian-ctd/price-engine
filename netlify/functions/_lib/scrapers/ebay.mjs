import * as cheerio from 'cheerio';
import { UA } from '../config.mjs';
import { fetchWithTimeout } from '../http.mjs';
import { parsePrice } from '../price-parser.mjs';

// eBay migrated from `.s-item` to `.s-card` in 2024. We try the new layout first
// and fall back to the legacy one when no cards are matched.
export async function scrapePage({ brand, productName, category, page, diag }) {
  const q = [brand, productName, category].filter(Boolean).join(' ').trim();
  const url = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q)}&_ipg=60&_pgn=${page}`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9' },
    });
    diag.push(`ebay p${page}: HTTP ${res.status}`);
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
