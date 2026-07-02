// Post-processing filters to reduce false positives from platform search engines
// that don't strictly respect the query (eBay, Google Shopping, Farfetch often
// return items matching only one word of a multi-word query).

// Accent-fold and lowercase — handles "Hermès" ↔ "Hermes", "Céline" ↔ "Celine".
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Known abbreviations / alternate spellings that should also count as a match.
// Extend when a brand keeps slipping through with valid but non-canonical names.
const BRAND_ALIASES = {
  'louis vuitton': ['lv'],
  'yves saint laurent': ['ysl', 'saint laurent'],
  'saint laurent': ['ysl'],
  'dolce & gabbana': ['d&g', 'dolce gabbana'],
  'bottega veneta': ['bv', 'bottega'],
  'alexander mcqueen': ['mcqueen'],
  'brunello cucinelli': ['cucinelli'],
};

function matchesBrand(listing, brand) {
  if (!brand) return true;
  const b = normalize(brand);
  const needles = [b, ...(BRAND_ALIASES[b] || [])];

  if (listing.brand) {
    const brandField = normalize(listing.brand);
    if (needles.some(n => brandField.includes(n))) return true;
  }
  if (listing.title) {
    const title = normalize(listing.title);
    if (needles.some(n => title.includes(n))) return true;
  }
  return false;
}

export function filterByBrand(platformResult, brand, diag, platformName) {
  if (!brand || !platformResult?.listings) return platformResult;
  const before = platformResult.listings.length;
  const filtered = platformResult.listings.filter(l => matchesBrand(l, brand));
  const dropped = before - filtered.length;
  if (dropped > 0) diag.push(`${platformName}: brand filter dropped ${dropped}/${before}`);
  return { ...platformResult, listings: filtered };
}
