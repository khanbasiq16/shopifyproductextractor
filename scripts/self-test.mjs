/**
 * Offline self-test: exercises detection, pagination, normalization,
 * search/filter/sort and both export formats against a mocked storefront.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { inspectStore, fetchCatalogPage } from "../lib/shopify.js";
import { normalizeStoreUrl, storeSlug } from "../lib/url.js";
import { normalizeProduct } from "../lib/normalize.js";
import { buildCsv, buildWorkbook, exportFilename, variantRows } from "../lib/export.js";
import { buildSearchIndex, filterProducts, sortProducts, catalogStats, filterOptions, EMPTY_FILTERS } from "../lib/catalog-view.js";

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.stack}`);
    process.exitCode = 1;
  }
}

/* ---------------- mock storefront ---------------- */
function makeProduct(i) {
  const multi = i % 3 === 0;
  return {
    id: 1000 + i,
    title: i === 5 ? "=HYPERLINK(\"x\")" : `Product ${i}`,
    handle: `product-${i}`,
    body_html: `<p>Great <strong>item</strong> &amp; more ${i}</p><ul><li>Soft</li></ul>`,
    published_at: "2026-01-01T00:00:00-05:00",
    created_at: "2025-12-01T00:00:00-05:00",
    updated_at: "2026-02-01T00:00:00-05:00",
    vendor: i % 2 ? "Acme" : "Globex",
    product_type: i % 4 ? "Shirts" : "",
    tags: ["cotton", "summer"],
    variants: multi
      ? ["Small", "Medium", "Large"].map((s, k) => ({
          id: 5000 + i * 10 + k, title: `${s} / Black`, option1: s, option2: "Black", option3: null,
          sku: `SKU-${i}-${k}`, available: k !== 2, price: (20 + k).toFixed(2),
          compare_at_price: k === 0 ? "30.00" : null, grams: 200,
        }))
      : [{ id: 5000 + i * 10, title: "Default Title", option1: "Default Title", sku: i % 5 ? `SKU-${i}` : "",
           available: i % 7 !== 0, price: `${10 + (i % 50)}.99`, compare_at_price: null }],
    images: i % 4 === 1 ? [] : [{ id: 1, src: `//cdn.shopify.com/s/files/p${i}.jpg`, position: 1 }],
    options: [],
  };
}
const ALL = Array.from({ length: 537 }, (_, i) => makeProduct(i + 1));

let mode = "normal";
const calls = [];
const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...headers } });
const SHOPIFY_HOME = '<html><head><title>Example Store</title><script>Shopify.shop = "example.myshopify.com"; Shopify.theme = {};</script><link href="//cdn.shopify.com/x.css"></head></html>';

globalThis.fetch = async (url) => {
  const u = new URL(url);
  calls.push(u.pathname + u.search);
  const page = Number(u.searchParams.get("page") || 1);
  const slice = (list) => list.slice((page - 1) * 250, page * 250);

  if (mode === "notshopify") {
    if (u.pathname === "/") return html("<html><title>Blog</title><body>Hello</body></html>");
    return html("Not found", 404);
  }
  if (mode === "password") {
    if (u.pathname === "/") return new Response(null, { status: 302, headers: { location: "/password" } });
    if (u.pathname === "/password") return html(SHOPIFY_HOME);
    if (u.pathname.endsWith("products.json")) return new Response(null, { status: 302, headers: { location: "/password" } });
    return html("", 404);
  }
  if (mode === "ratelimit") {
    if (u.pathname === "/") return html(SHOPIFY_HOME);
    if (u.pathname.endsWith("products.json")) return json({}, 429, { "retry-after": "0.01" });
    return html("", 404);
  }
  if (mode === "private-redirect") {
    return new Response(null, { status: 301, headers: { location: "http://127.0.0.1/admin" } });
  }

  // normal / fallback / empty / wwwredirect
  if (mode === "wwwredirect" && u.hostname === "example.com") {
    return new Response(null, { status: 301, headers: { location: `https://www.example.com${u.pathname}${u.search}` } });
  }
  if (u.pathname === "/") return html(SHOPIFY_HOME, 200, { "x-shopid": "123" });
  if (u.pathname === "/meta.json") return json({ name: "Example Store", currency: "USD", myshopify_domain: "example.myshopify.com" });
  if (u.pathname === "/products.json") {
    if (mode === "fallback") return html("Not found", 404);
    return json({ products: mode === "empty" ? [] : slice(ALL) });
  }
  if (u.pathname === "/collections/all/products.json") return json({ products: slice(ALL) });
  return html("Not found", 404);
};

console.log("URL normalization");
await test("accepts bare domain", () => {
  assert.deepEqual(normalizeStoreUrl("example-store.com"), { ok: true, origin: "https://example-store.com", hostname: "example-store.com" });
});
await test("accepts https URL with path and trims", () => {
  assert.equal(normalizeStoreUrl("  HTTPS://Example-Store.com/collections/x?y=1 ").origin, "https://example-store.com");
});
await test("rejects invalid input", () => {
  for (const bad of ["", "not a url", "localhost", "192.168.1.1", "ftp://x.com", "https://user:pw@x.com", "x", "https://x.com:8080"]) {
    assert.equal(normalizeStoreUrl(bad).ok, false, bad);
  }
});
await test("filename slug", () => {
  assert.equal(storeSlug("www.example-store.com"), "example-store");
  assert.equal(exportFilename("example-store.com", "xlsx", new Date(2026, 8, 29)), "shopify-products-example-store-2026-09-29.xlsx");
});

console.log("Detection and fetching");
let firstResult;
await test("valid store: detect, first page, currency", async () => {
  mode = "normal";
  firstResult = await inspectStore("example.com");
  assert.equal(firstResult.store.source, "products");
  assert.equal(firstResult.store.currency, "USD");
  assert.equal(firstResult.store.name, "Example Store");
  assert.equal(firstResult.products.length, 250);
  assert.equal(firstResult.hasMore, true);
});
let allProducts = [];
await test("pagination retrieves every product (537)", async () => {
  allProducts = [...firstResult.products];
  let page = 1, hasMore = firstResult.hasMore;
  while (hasMore) {
    page++;
    const r = await fetchCatalogPage({ storeUrl: firstResult.store.origin, source: "products", page, currency: "USD" });
    allProducts.push(...r.products);
    hasMore = r.hasMore;
  }
  assert.equal(allProducts.length, 537);
  assert.equal(new Set(allProducts.map((p) => p.id)).size, 537);
});
await test("follows redirect to www and adopts canonical origin", async () => {
  mode = "wwwredirect";
  const r = await inspectStore("https://example.com");
  assert.equal(r.store.origin, "https://www.example.com");
  assert.ok(r.products[0].url.startsWith("https://www.example.com/products/"));
});
await test("falls back to /collections/all/products.json", async () => {
  mode = "fallback";
  const r = await inspectStore("example.com");
  assert.equal(r.store.source, "collections-all");
  assert.equal(r.products.length, 250);
});
const expectCode = async (input, code) => {
  await assert.rejects(inspectStore(input), (e) => e.code === code || assert.fail(`expected ${code}, got ${e.code}`));
};
await test("non-Shopify site -> NOT_SHOPIFY", async () => { mode = "notshopify"; await expectCode("example.com", "NOT_SHOPIFY"); });
await test("password-protected store -> PROTECTED", async () => { mode = "password"; await expectCode("example.com", "PROTECTED"); });
await test("rate limited -> RATE_LIMITED", async () => { mode = "ratelimit"; await expectCode("example.com", "RATE_LIMITED"); });
await test("no products -> NO_PRODUCTS", async () => { mode = "empty"; await expectCode("example.com", "NO_PRODUCTS"); });
await test("invalid URL -> INVALID_URL", async () => { await expectCode("not a url", "INVALID_URL"); });
await test("redirect to private address is refused", async () => { mode = "private-redirect"; await expectCode("example.com", "INVALID_URL"); });
await test("unresolvable domain -> STORE_UNAVAILABLE", async () => {
  mode = "normal";
  await expectCode("this-domain-should-not-exist-9f8e7d.com", "STORE_UNAVAILABLE");
});

console.log("Normalization");
const byId = Object.fromEntries(allProducts.map((p) => [p.id, p]));
await test("multi-variant product", () => {
  const p = byId["1003"];
  assert.equal(p.variantCount, 3);
  assert.equal(p.price, 20);
  assert.equal(p.maxPrice, 22);
  assert.equal(p.compareAtPrice, 30);
  assert.equal(p.availability, "partial");
  assert.deepEqual(p.variants[0].options, ["Small", "Black"]);
  assert.equal(p.variants[0].inventoryQuantity, null);
});
await test("product without images / compare-at", () => {
  const p = byId["1001"];
  assert.equal(p.image, null);
  assert.equal(p.imageCount, 0);
  assert.equal(p.compareAtPrice, null);
});
await test("HTML description to text, protocol-relative images", () => {
  const p = byId["1002"];
  assert.equal(p.description, "Great item & more 2\n- Soft");
  assert.equal(p.image, "https://cdn.shopify.com/s/files/p2.jpg");
});
await test("AJAX .js format (prices in cents) normalizes the same way", () => {
  const p = normalizeProduct({
    id: 9, title: "Ajax", handle: "ajax", description: "<p>Hi</p>", vendor: "V", type: "T",
    tags: "a, b", available: true, price: 1999, images: ["//cdn.shopify.com/a.jpg"],
    variants: [{ id: 1, title: "One", price: 1999, compare_at_price: 2999, available: true, sku: "A1" }],
  }, { origin: "https://s.com", currency: "EUR" });
  assert.equal(p.price, 19.99);
  assert.equal(p.compareAtPrice, 29.99);
  assert.equal(p.productType, "T");
  assert.deepEqual(p.tags, ["a", "b"]);
  assert.equal(p.availability, "available");
  assert.equal(p.currency, "EUR");
});

console.log("Search, filters, sorting, stats");
const index = buildSearchIndex(allProducts);
await test("search by title / sku / handle / vendor", () => {
  assert.equal(filterProducts(allProducts, index, "Product 10", EMPTY_FILTERS).some((p) => p.id === "1010"), true);
  assert.equal(filterProducts(allProducts, index, "sku-3-2", EMPTY_FILTERS).length, 1);
  assert.equal(filterProducts(allProducts, index, "product-537", EMPTY_FILTERS).length, 1);
  assert.equal(filterProducts(allProducts, index, "globex", EMPTY_FILTERS).every((p) => p.vendor === "Globex"), true);
});
await test("filters combine", () => {
  const r = filterProducts(allProducts, index, "", { ...EMPTY_FILTERS, vendor: "Acme", availability: "sold_out" });
  assert.ok(r.length > 0);
  assert.ok(r.every((p) => p.vendor === "Acme" && p.availability === "sold_out"));
});
await test("sort by price desc, nulls last", () => {
  const s = sortProducts(allProducts, { key: "price", dir: "desc" });
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].price >= s[i].price);
  const c = sortProducts(allProducts, { key: "compareAtPrice", dir: "asc" });
  assert.notEqual(c[0].compareAtPrice, null);
  assert.equal(c[c.length - 1].compareAtPrice, null);
});
await test("natural sort by name", () => {
  const s = sortProducts(allProducts.filter((p) => /^Product \d+$/.test(p.title)), { key: "title", dir: "asc" });
  assert.equal(s[0].title, "Product 1");
  assert.equal(s[1].title, "Product 2");
});
await test("stats and filter options", () => {
  const st = catalogStats(allProducts);
  assert.equal(st.products, 537);
  assert.equal(st.variants, 537 + 179 * 2);
  assert.equal(st.vendors, 2);
  const o = filterOptions(allProducts);
  assert.equal(o.types.length, 1); // empty product types are excluded
});

console.log("Exports");
mkdirSync("/tmp/spe-test", { recursive: true });
await test("CSV: one row per variant, escaping, formula guard", () => {
  const csv = buildCsv(allProducts);
  const lines = csv.trim().split("\r\n");
  assert.ok(csv.startsWith("\uFEFFProduct ID,Title,Handle"));
  assert.equal(variantRows(allProducts).length, 537 + 179 * 2);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(lines.length > 895); // descriptions contain quoted newlines
  writeFileSync("/tmp/spe-test/out.csv", csv);
});
await test("XLSX builds", async () => {
  const blob = buildWorkbook(allProducts);
  writeFileSync("/tmp/spe-test/out.xlsx", Buffer.from(await blob.arrayBuffer()));
});

console.log(`\n${passed} tests passed${process.exitCode ? ", some FAILED" : ""}.`);
