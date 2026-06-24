import { PAGES_PER_PLATFORM } from './config.mjs';
import * as vinted from './scrapers/vinted.mjs';
import * as ebay from './scrapers/ebay.mjs';
import * as vestiaire from './scrapers/vestiaire.mjs';
import * as farfetch from './scrapers/farfetch.mjs';
import * as google from './scrapers/google.mjs';

function dedupe(listings) {
  const seen = new Set();
  return listings.filter(l => {
    const key = l.url || `${l.title}|${l.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runPages(scraper, pages = PAGES_PER_PLATFORM) {
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => scraper(i + 1)));
  return { listings: dedupe(results.flat()), pagesScraped: pages };
}

// Probe Vinted's API with page 1. If it returns items, use the API for pages 2-3.
// If it 401s or returns nothing, fall back to HTML scraping for all pages.
async function scrapeVinted({ brand, productName, diag }) {
  const cookieHeader = await vinted.bootstrapCookies(diag);
  const apiPage1 = await vinted.scrapeApiPage({ brand, productName, page: 1, cookieHeader, diag });
  if (apiPage1.length > 0) {
    const remaining = await Promise.all([2, 3].map(p =>
      vinted.scrapeApiPage({ brand, productName, page: p, cookieHeader, diag })
    ));
    return { listings: dedupe([apiPage1, ...remaining].flat()), pagesScraped: PAGES_PER_PLATFORM };
  }
  diag.push('vinted: falling back to HTML scraping');
  return runPages(page => vinted.scrapeHtmlPage({ brand, productName, page, cookieHeader, diag }));
}

export async function scrapeAll({ brand, category, productName, diag }) {
  const wrapSingle = (promise) => promise.then(listings => ({
    listings: dedupe(listings),
    pagesScraped: 1,
  }));

  const [vintedResult, ebayResult, vestiaireResult, farfetchResult, googleResult] = await Promise.all([
    scrapeVinted({ brand, productName, diag }),
    runPages(page => ebay.scrapePage({ brand, productName, category, page, diag })),
    // Vestiaire ScraperAPI render is slow (~15-25s) — single page is the safe choice.
    wrapSingle(vestiaire.scrapePage({ brand, productName, page: 1, diag })),
    // Farfetch single page returns ~10-30 retail items via ScraperAPI proxy.
    wrapSingle(farfetch.scrapePage({ brand, productName, page: 1, diag })),
    // Google Shopping structured endpoint returns ~40 cross-retailer results in one call.
    wrapSingle(google.scrapeShopping({ brand, productName, diag })),
  ]);
  return {
    vinted: vintedResult,
    ebay: ebayResult,
    vestiaire: vestiaireResult,
    farfetch: farfetchResult,
    google: googleResult,
  };
}
