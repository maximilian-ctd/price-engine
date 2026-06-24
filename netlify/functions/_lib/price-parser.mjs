// Parse a price string into a number, handling DE ("1.234,56") and EN ("1,234.56")
// formats. Returns 0 for unparseable input.
export function parsePrice(text) {
  if (!text) return 0;
  const m = text.replace(/\s/g, '').match(/([\d.,]+)/);
  if (!m) return 0;
  const raw = m[1];
  let normalized;
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  if (hasComma && hasDot) {
    // Mixed separators — last separator wins as the decimal marker.
    normalized = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (hasComma) {
    // "1234,56" DE decimal vs "1,234" EN thousand — 3 digits after comma = thousand.
    const parts = raw.split(',');
    normalized = parts[parts.length - 1].length === 3 ? raw.replace(/,/g, '') : raw.replace(',', '.');
  } else if (hasDot) {
    // "1.234" DE thousand vs "1.23" EN decimal — 3 digits after dot = thousand.
    const parts = raw.split('.');
    normalized = parts[parts.length - 1].length === 3 ? raw.replace(/\./g, '') : raw;
  } else {
    normalized = raw;
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}
