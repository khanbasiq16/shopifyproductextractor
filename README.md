# Shopify Product Extractor

A small Next.js app that fetches the **publicly available** product catalog of any Shopify store, shows it in a searchable, filterable table, and exports every product (one row per variant) to CSV or Excel.

No Shopify API keys, access tokens or store passwords are needed or accepted. The app reads only what the storefront already serves to any visitor.

## Features

- Accepts `example-store.com` or `https://example-store.com/any/path`; the URL is normalized and validated before any request.
- Shopify detection from several public signals: response headers (`x-shopid`, `x-shopify-stage`, `powered-by`, Shopify cookies), page markup (`cdn.shopify.com`, `Shopify.shop`, `myshopify.com`, section markup), `/meta.json`, and whether a product feed is served.
- Full pagination (250 products per request) with live progress, a polite delay between pages, retry with back-off on rate limits, duplicate-page detection and a configurable page cap.
- Fallback catalog source: if `/products.json` is unavailable, `/collections/all/products.json` is used.
- Optional mapping of products to their public collections.
- Summary cards: total products, total variants, available products, vendors.
- Table with image, product, vendor, type, price (range for multi-price products), compare-at price, variants (expandable), SKU, availability and product link.
- Search across title, vendor, type, SKU and handle; filters for vendor, type, availability (and collection when mapped); sorting by name, price, compare-at price, vendor and variant count; 25/50/100 rows per page.
- Card layout with a sort selector on small screens.
- CSV and Excel export of **all** fetched products, not just the visible page.
- Clear, friendly error messages for every failure type. Raw errors are only logged on the server.

## Tech stack

Next.js (App Router), React, JavaScript/JSX only, Tailwind CSS v4, Lucide icons. There are no other runtime dependencies. The Excel writer (`lib/xlsx.js`) is a small built-in module, so no spreadsheet library is needed.

## Installation and local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Other scripts:

```bash
npm run build   # production build
npm start       # run the production build
npm test        # offline self-test (mocked storefront, no network needed)
```

## Environment variables

None are required. To override defaults, copy `.env.example` to `.env.local`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `REQUEST_TIMEOUT_MS` | `15000` | Server timeout for each request to a store |
| `NEXT_PUBLIC_REQUEST_DELAY_MS` | `600` | Pause between catalog pages (minimum 250) |
| `NEXT_PUBLIC_MAX_PAGES` | `100` | Page cap; 100 pages = up to 25,000 products |
| `NEXT_PUBLIC_MAX_COLLECTIONS` | `150` | Collection cap when collection mapping is on |

None of these are secrets. The app does not use any private or paid API.

## How product fetching works

```
Browser                              Next.js API (server)                 Store
-------                              --------------------                 -----
Validate + normalize URL
POST /api/products {storeUrl}  --->  resolve host, refuse private IPs
                                     GET /            (signals, redirects) --->
                                     GET /meta.json   (name, currency)    --->
                                     GET /products.json?limit=250&page=1  --->
                                     (fallback: /collections/all/products.json)
                               <---  store info + page 1 (normalized)
wait, then POST page 2, 3, ... --->  GET the same source for that page    --->
                               <---  normalized products + hasMore
(optional) POST /api/collections ->  /collections.json, /collections/<h>/products.json
```

The browser drives pagination so progress is shown live and every server call stays short, which works well within serverless time limits on Vercel.

All server-side fetching lives in `lib/`:

- `lib/http.js`: safe fetch. It checks DNS so private or internal addresses are refused (SSRF guard), follows redirects manually and checks each hop, enforces timeouts and size limits, and retries 429 responses a limited number of times, honouring `Retry-After`. It sends an honest User-Agent.
- `lib/shopify.js`: detection, source discovery, pagination endpoints, collections.
- `lib/normalize.js`: converts both public product formats (the storefront JSON feed with decimal prices, and the AJAX `.js` format with prices in cents) into one internal shape. The UI never depends on a raw Shopify format.

Normalized product shape:

```js
{
  id, title, handle, url, vendor, productType, tags, description, shortDescription,
  images: [], image, imageCount,
  variants: [{ id, title, sku, barcode, price, compareAtPrice, available,
               inventoryQuantity, options, weightGrams, requiresShipping, image }],
  variantCount, price, maxPrice, compareAtPrice, currency, availability,
  skus, createdAt, publishedAt, updatedAt, collections: []
}
```

`availability` is `available`, `partial` (some variants sold out), `sold_out` or `unknown`.

### Access controls are respected

If a store redirects to its password page or a login page, returns 401 or 403, or serves a bot challenge (for example Cloudflare), the app stops and shows: *This store appears to restrict public product access, so its catalog could not be retrieved.* It never tries to get around passwords, CAPTCHAs, bot protection, rate limits or private APIs, and it never requests customer, order or admin data.

## Export

The **Export** menu offers:

- **Export CSV**: UTF-8 with BOM (opens correctly in Excel), one row per variant.
- **Export Excel**: an `.xlsx` workbook with two sheets. *Variants* has one row per variant. *Products* has one row per product. Each sheet has a frozen, bold header row and autofilter.

Columns include Product ID, Title, Handle, Product URL, Vendor, Product Type, Tags, Collections, Description, Price, Compare At Price, Currency, Variant Count, Variant ID, Variant Title, Option Values, SKU, Barcode, Availability, Inventory Quantity, Main Image, Image Count, Image URLs, Created At, Published At and Updated At.

Files are named `shopify-products-<store>-<YYYY-MM-DD>.csv` or `.xlsx`. The export is built in the browser and downloads automatically. Text cells that start with `=`, `+`, `@` or similar characters are escaped in the CSV, so store-supplied text can't run as a spreadsheet formula.

## Limitations

- Only data the storefront publishes is available. Inventory quantity is almost never public, so that column is usually empty.
- Some stores disable or restrict the public JSON feeds, sit behind bot protection, or use a headless front end on a different domain. These cases are reported as restricted or as not Shopify. Tip: a store's `*.myshopify.com` domain sometimes works when a custom headless domain does not.
- Stores that remove products from the online sales channel won't show those products.
- Shopify rate-limits storefront requests. Very large catalogs take a while because of the delay between pages; if the store keeps limiting requests, you get the products fetched so far plus a warning.
- Prices are shown in the store's default currency, as served to an anonymous visitor.
- Collection mapping makes extra requests for each collection, so it is off by default.
- Please use the tool responsibly and in line with the store's terms of service.

## Deploying to Vercel

1. Push the project to a GitHub, GitLab or Bitbucket repository.
2. In Vercel, choose **Add New > Project** and import the repository. The Next.js framework preset is detected automatically.
3. Optionally, add any variables from `.env.example` under **Settings > Environment Variables**.
4. Deploy.

Or use the CLI:

```bash
npm i -g vercel
vercel
```

The API routes run on the Node.js runtime (`export const runtime = "nodejs"`).

## Project structure

```
app/
  api/products/route.js      store detection + catalog pages
  api/collections/route.js   public collections (optional mapping)
  layout.jsx, page.jsx, globals.css
components/
  AppHeader, StoreInput, StatsCards, ResultsHeader, ProductFilters,
  ProductTable, TablePagination, ProductImage, AvailabilityBadge,
  ExportMenu, LoadingState, EmptyState, Notice
lib/
  http.js, shopify.js, normalize.js      server
  useCatalog.js                          client fetch orchestration
  catalog-view.js                        search / filter / sort / stats
  export.js, xlsx.js                     CSV and Excel export
  url.js, errors.js, format.js, api-response.js
scripts/self-test.mjs                    offline tests
```
