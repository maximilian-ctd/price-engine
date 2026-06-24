# price-engine

Standalone API that aggregates fashion prices across five sources:

| Source              | Type      | Notes                                                    |
| ------------------- | --------- | -------------------------------------------------------- |
| **Vinted**          | C2C used  | Direct API with cookie bootstrap; HTML fallback          |
| **eBay**            | mixed     | Direct fetch, ScraperAPI retry on 403/429                |
| **Vestiaire**       | curated used | ScraperAPI render (CloudFlare)                        |
| **Farfetch**        | retail new | ScraperAPI proxy (Akamai); EUR pricing                  |
| **Google Shopping** | aggregator | ScraperAPI structured endpoint; ~40 results in one call |

Deployed as a Netlify Function; CORS-enabled so any frontend can consume it.

## API

```
POST /.netlify/functions/scrape-prices
Content-Type: application/json
```

### Request

| Field         | Type    | Required | Notes                                              |
| ------------- | ------- | -------- | -------------------------------------------------- |
| `brand`       | string  | one of   | e.g. `"Hermès"` — used as exact match where possible |
| `productName` | string  | one of   | e.g. `"Birkin 30"`                                 |
| `category`    | string  | no       | e.g. `"Taschen"` — appended to eBay query          |
| `bypassCache` | boolean | no       | Skip cache lookup, force fresh scrape              |

At least one of `brand` or `productName` is required.

### Response

```json
{
  "vinted":    { "listings": [...], "pagesScraped": 3 },
  "ebay":      { "listings": [...], "pagesScraped": 3 },
  "vestiaire": { "listings": [...], "pagesScraped": 1 },
  "farfetch":  { "listings": [...], "pagesScraped": 1 },
  "google":    { "listings": [...], "pagesScraped": 1 },
  "meta": {
    "query":        { "brand": "Hermès", "category": "Taschen", "productName": "Birkin 30" },
    "counts":       { "vinted": 73, "ebay": 121, "vestiaire": 15, "farfetch": 8, "google": 40 },
    "durationMs":   16500,
    "cached":       false,
    "diagnostics":  ["vinted home: HTTP 200", "ebay p1: 60 items", "..."]
  }
}
```

Each listing has at minimum: `platform`, `title`, `price`, `currency`, `url`. Some platforms also return `image`, `condition`, `size`, `city`, `brand`.

`X-Cache: HIT` or `MISS` header indicates cache state. Cache TTL is 24h. `meta.cacheAgeMinutes` is included on hits.

## Environment variables

| Name              | Required        | Purpose                                                              |
| ----------------- | --------------- | -------------------------------------------------------------------- |
| `SCRAPER_API_KEY` | for Vestiaire / Farfetch / Google | [ScraperAPI](https://www.scraperapi.com/) key |

Without `SCRAPER_API_KEY` the function still returns Vinted; eBay survives only when its IP isn't blocked (no fallback); Vestiaire/Farfetch/Google return empty and report `"<platform>: scraperapi DISABLED"` in `diagnostics`.

**Cost per fresh search** (cache miss): ~2 credits (eBay retries) + 10 (Vestiaire render) + 1 (Farfetch) + 5 (Google) ≈ **18 credits**.

## Local development

```sh
npm install
npm run dev   # netlify dev — http://localhost:8888
```

Test the function:

```sh
curl -X POST http://localhost:8888/.netlify/functions/scrape-prices \
  -H "Content-Type: application/json" \
  -d '{"brand":"Hermès","category":"Taschen","productName":"Birkin 30"}'
```

## Deployment

The repo is wired to Netlify — push to `main` and a deploy runs automatically.

To set up a fresh Netlify site:
1. Create a new project on Netlify, connect this GitHub repo
2. Build settings stay at defaults (Netlify reads `netlify.toml`)
3. Add `SCRAPER_API_KEY` under **Project configuration → Environment variables**

## Architecture

```
netlify/functions/
├── scrape-prices.mjs      # Thin HTTP handler: parse body, check cache, orchestrate, write cache
└── _lib/                   # Netlify ignores _-prefixed dirs as endpoints
    ├── config.mjs          # UA, page counts, Vinted brand IDs, cache version
    ├── http.mjs            # fetchWithTimeout
    ├── price-parser.mjs    # parsePrice — DE/EN thousand- and decimal-separator handling
    ├── cache.mjs           # Netlify Blobs wrapper
    ├── orchestrator.mjs    # Runs all three platforms in parallel
    └── scrapers/
        ├── vinted.mjs      # Cookie bootstrap, API endpoint, HTML fallback
        ├── ebay.mjs        # .s-card selectors (2024+); ScraperAPI retry on 403
        ├── vestiaire.mjs   # ScraperAPI render=true (CloudFlare bypass)
        ├── farfetch.mjs    # ScraperAPI proxy, /de/ catalog (EUR pricing)
        └── google.mjs      # ScraperAPI structured Google Shopping endpoint
```

Cache version (`CACHE_VERSION` in `config.mjs`) acts as a key prefix — bump it whenever the response shape changes to invalidate all entries at once.
