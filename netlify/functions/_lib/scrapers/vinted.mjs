import * as cheerio from 'cheerio';
import { UA, VINTED_BRAND_IDS } from '../config.mjs';
import { fetchWithTimeout } from '../http.mjs';
import { parsePrice } from '../price-parser.mjs';

// Vinted's API returns 401 without session cookies. Fetch the homepage first to
// pick up `access_token_web` (and the DataDome bot-protection token), then reuse
// those cookies for API calls. Browser dedup behavior: last value per name wins.
export async function bootstrapCookies(diag) {
  try {
    const res = await fetchWithTimeout('https://www.vinted.de/', {
      headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9' },
    }, 6000);
    diag.push(`vinted home: HTTP ${res.status}`);

    let raw = [];
    if (typeof res.headers.getSetCookie === 'function') raw = res.headers.getSetCookie();
    if (!raw.length) {
      const all = res.headers.get('set-cookie');
      if (all) raw = all.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    }

    const byName = new Map();
    for (const c of raw) {
      const first = c.split(';')[0].trim();
      const eq = first.indexOf('=');
      if (eq <= 0) continue;
      byName.set(first.slice(0, eq), first);
    }
    diag.push(`vinted home: ${byName.size} unique cookies (${raw.length} raw)`);
    return [...byName.values()].join('; ');
  } catch (e) {
    diag.push(`vinted home: error ${e.message}`);
    return '';
  }
}

// Primary path: structured JSON from Vinted's catalog API.
export async function scrapeApiPage({ brand, productName, page, cookieHeader, diag }) {
  const brandId = VINTED_BRAND_IDS[brand];
  const q = `${brand} ${productName}`.trim();
  const brandParam = brandId ? `&brand_ids[]=${brandId}` : '';
  const url = `https://www.vinted.de/api/v2/catalog/items?search_text=${encodeURIComponent(q)}${brandParam}&per_page=40&page=${page}&order=relevance`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'de-DE,de;q=0.9',
        'Referer': 'https://www.vinted.de/',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
    });
    diag.push(`vinted p${page}: HTTP ${res.status}`);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.items || [];
    diag.push(`vinted p${page}: ${items.length} items`);
    return items.map(it => ({
      platform: 'vinted',
      title: it.title || '',
      price: parseFloat(it.price?.amount ?? it.total_item_price?.amount ?? 0),
      currency: it.price?.currency_code || 'EUR',
      url: it.url || (it.path ? `https://www.vinted.de${it.path}` : undefined),
      image: it.photo?.url || it.photo?.full_size_url,
      brand: it.brand_title,
      size: it.size_title,
      condition: it.status,
      city: it.user?.city,
    })).filter(l => l.price > 0);
  } catch (e) {
    diag.push(`vinted p${page}: error ${e.message}`);
    return [];
  }
}

// Fallback: parse the HTML search page. Used when the API path keeps returning
// 401 (e.g. cookies didn't propagate or DataDome rejected the session).
export async function scrapeHtmlPage({ brand, productName, page, cookieHeader, diag }) {
  const brandId = VINTED_BRAND_IDS[brand];
  const q = `${brand} ${productName}`.trim();
  const brandParam = brandId ? `&brand_ids[]=${brandId}` : '';
  const url = `https://www.vinted.de/catalog?search_text=${encodeURIComponent(q)}${brandParam}&page=${page}&order=relevance`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
    }, 10000);
    diag.push(`vinted-html p${page}: HTTP ${res.status}`);
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const listings = [];
    $('div[data-testid^="product-item-id-"]').each((_, el) => {
      const $el = $(el);
      const idMatch = ($el.attr('data-testid') || '').match(/product-item-id-(\d+)/);
      const id = idMatch?.[1];
      const title = $el.find('[data-testid$="--description-title"]').first().text().trim()
                 || $el.find('.new-item-box__title').first().text().trim();
      const priceText = $el.find('[data-testid$="--price-text"]').first().text().trim()
                    || $el.find('.new-item-box__summary--compact').first().text().trim();
      const price = parsePrice(priceText);
      const href = $el.find('a').first().attr('href');
      if (!price) return;
      listings.push({
        platform: 'vinted',
        title: title || `Vinted ${id}`,
        price,
        currency: 'EUR',
        url: href?.startsWith('http') ? href : href ? `https://www.vinted.de${href}` : (id ? `https://www.vinted.de/items/${id}` : undefined),
        image: $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src'),
      });
    });
    diag.push(`vinted-html p${page}: ${listings.length} items`);
    return listings;
  } catch (e) {
    diag.push(`vinted-html p${page}: error ${e.message}`);
    return [];
  }
}
