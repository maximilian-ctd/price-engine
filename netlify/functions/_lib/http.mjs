import { PAGE_TIMEOUT_MS } from './config.mjs';

export async function fetchWithTimeout(url, opts = {}, timeout = PAGE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}
