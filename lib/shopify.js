/**
 * Server-only: public Shopify storefront access.
 *
 * Uses only endpoints that Shopify storefronts expose publicly to any visitor:
 *   /products.json                         primary catalog feed (250 per page)
 *   /collections/all/products.json         fallback catalog feed
 *   /meta.json, /cart.js                   store name / currency
 *   /collections.json                      public collection list
 *   /collections/<handle>/products.json    products in a public collection
 *
 * If a store answers with a password page, a login redirect, a 401/403,
 * or a bot challenge, we stop and report that the catalog is restricted.
 */
import { safeFetch, tryParseJson, NetworkError } from "./http.js";
import { normalizeStoreUrl } from "./url.js";
import { normalizeProducts } from "./normalize.js";
import { StoreError } from "./errors.js";

export const PAGE_SIZE = 250;

export const CATALOG_SOURCES = {
  products: (page) => `/products.json?limit=${PAGE_SIZE}&page=${page}`,
  "collections-all": (page) => `/collections/all/products.json?limit=${PAGE_SIZE}&page=${page}`,
};

/* ------------------------------------------------------------------ */
/* Response classification                                             */
/* ------------------------------------------------------------------ */

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function isChallenge(res) {
  const h = res.headers;
  if (h.get("cf-mitigated") === "challenge") return true;
  if (res.status === 403 || res.status === 503) {
    const body = (res.text || "").slice(0, 20000).toLowerCase();
    return (
      body.includes("challenge-platform") ||
      body.includes("cf-chl") ||
      body.includes("captcha") ||
      body.includes("attention required")
    );
  }
  return false;
}

function isAccessRestricted(res) {
  const path = pathOf(res.url);
  return (
    res.status === 401 ||
    res.status === 403 ||
    path.startsWith("/password") ||
    path.startsWith("/account/login") ||
    isChallenge(res)
  );
}

/**
 * @returns {{ kind: "ok", products: any[] } | { kind: "restricted" | "rate_limited" | "missing" | "error" }}
 */
function classifyCatalogResponse(res) {
  if (res.status === 429 || res.status === 430) return { kind: "rate_limited" };
  if (isAccessRestricted(res)) return { kind: "restricted" };
  if (res.status === 404) return { kind: "missing" };
  if (res.status >= 500) return { kind: "error" };
  if (res.status === 200) {
    const json = tryParseJson(res.text);
    if (json && Array.isArray(json.products)) return { kind: "ok", products: json.products };
  }
  return { kind: "missing" };
}

function networkToStoreError(err) {
  if (err instanceof StoreError) return err;
  if (err instanceof NetworkError && err.kind === "blocked") {
    return new StoreError("INVALID_URL", 400, err.message);
  }
  return new StoreError("STORE_UNAVAILABLE", 502, err && err.message);
}

/* ------------------------------------------------------------------ */
/* Shopify detection                                                   */
/* ------------------------------------------------------------------ */

const HEADER_SIGNALS = [
  (h) => h.has("x-shopid"),
  (h) => h.has("x-shopify-stage"),
  (h) => h.has("x-sorting-hat-shopid"),
  (h) => h.has("x-shardid") && h.has("x-storefront-renderer-rendered"),
  (h) => /shopify/i.test(h.get("powered-by") || ""),
  (h) => /_shopify_|cart_currency|secure_customer_sig|localization=/i.test(h.get("set-cookie") || ""),
];

const BODY_SIGNALS = [
  /cdn\.shopify\.com/i,
  /\/cdn\/shop\//i,
  /Shopify\.shop\s*=/i,
  /Shopify\.theme\s*=/i,
  /[a-z0-9-]+\.myshopify\.com/i,
  /shopify-section/i,
  /shopify-features/i,
  /window\.ShopifyAnalytics/i,
];

function detectSignals(homepage) {
  const result = { header: 0, body: 0 };
  if (!homepage) return result;
  for (const test of HEADER_SIGNALS) if (test(homepage.headers)) result.header++;
  const body = homepage.text || "";
  for (const re of BODY_SIGNALS) if (re.test(body)) result.body++;
  return result;
}

function extractTitle(html) {
  const m = (html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").replace(/&amp;/g, "&").trim().slice(0, 120) || null;
}

/* ------------------------------------------------------------------ */
/* Public API used by route handlers                                   */
/* ------------------------------------------------------------------ */

/**
 * Validates the input, checks that it is a Shopify store, discovers a working
 * public catalog source and returns the first page of products.
 */
export async function inspectStore(storeUrl) {
  const normalized = normalizeStoreUrl(storeUrl);
  if (!normalized.ok) throw new StoreError("INVALID_URL", 400);

  let origin = normalized.origin;
  let homepage = null;

  // 1. Homepage: follow redirects to the canonical domain and collect signals.
  try {
    homepage = await safeFetch(`${origin}/`, {
      accept: "text/html,application/xhtml+xml",
      maxBytes: 1.5 * 1024 * 1024,
      truncate: true,
      retries: 1,
    });
  } catch (err) {
    // DNS failures and blocked hosts are final. Timeouts may be a slow homepage,
    // so still try the lightweight JSON endpoints before giving up.
    if (err instanceof NetworkError && (err.kind === "dns" || err.kind === "blocked")) {
      throw networkToStoreError(err);
    }
    homepage = null;
  }

  if (homepage) {
    const finalHost = normalizeStoreUrl(homepage.url);
    if (finalHost.ok && finalHost.origin !== origin) {
      // Redirected (e.g. to www.), unless the redirect only went to a password/login page on same site.
      origin = finalHost.origin;
    }
  }

  const signals = detectSignals(homepage);
  const homepageRestricted = homepage ? isAccessRestricted(homepage) : false;

  // 2. Catalog + store metadata in parallel.
  const [metaRes, firstCatalog] = await Promise.all([
    safeFetch(`${origin}/meta.json`, { retries: 0, maxBytes: 256 * 1024 }).catch(() => null),
    findCatalogSource(origin),
  ]);

  const meta = metaRes && metaRes.status === 200 ? tryParseJson(metaRes.text) : null;
  const metaIsShopify = Boolean(meta && (meta.myshopify_domain || meta.shopify_domain));

  const isShopify =
    firstCatalog.kind === "ok" || metaIsShopify || signals.header > 0 || signals.body >= 2;

  if (!homepage && firstCatalog.kind === "network") {
    throw new StoreError("STORE_UNAVAILABLE", 502);
  }

  if (!isShopify) {
    if (homepageRestricted || firstCatalog.kind === "restricted") {
      throw new StoreError("PROTECTED", 403);
    }
    if (firstCatalog.kind === "rate_limited") throw new StoreError("RATE_LIMITED", 429);
    if (!homepage && firstCatalog.kind !== "missing") throw new StoreError("STORE_UNAVAILABLE", 502);
    throw new StoreError("NOT_SHOPIFY", 422);
  }

  if (homepage && pathOf(homepage.url).startsWith("/password")) {
    throw new StoreError("PROTECTED", 403);
  }

  if (firstCatalog.kind === "rate_limited") throw new StoreError("RATE_LIMITED", 429);
  if (firstCatalog.kind !== "ok") throw new StoreError("PROTECTED", 403);

  // 3. Currency: meta.json first, cart.js as a fallback.
  let currency = meta && typeof meta.currency === "string" ? meta.currency : null;
  if (!currency) {
    try {
      const cart = await safeFetch(`${origin}/cart.js`, { retries: 0, maxBytes: 128 * 1024 });
      const cartJson = cart.status === 200 ? tryParseJson(cart.text) : null;
      if (cartJson && typeof cartJson.currency === "string") currency = cartJson.currency;
    } catch {
      /* currency stays unknown */
    }
  }
  if (currency && !/^[A-Z]{3}$/.test(currency)) currency = null;

  const hostname = new URL(origin).hostname;
  const store = {
    origin,
    hostname,
    name: (meta && meta.name) || extractTitle(homepage && homepage.text) || hostname,
    currency,
    source: firstCatalog.source,
  };

  const products = normalizeProducts(firstCatalog.products, { origin, currency });
  if (!products.length) throw new StoreError("NO_PRODUCTS", 404);

  return {
    store,
    products,
    page: 1,
    hasMore: firstCatalog.products.length >= PAGE_SIZE,
  };
}

/** Try each public catalog source until one returns a product feed. */
async function findCatalogSource(origin) {
  let sawRestricted = false;
  let sawRateLimit = false;
  let sawNetwork = false;

  for (const [source, pathFor] of Object.entries(CATALOG_SOURCES)) {
    let res;
    try {
      res = await safeFetch(`${origin}${pathFor(1)}`);
    } catch (err) {
      if (err instanceof NetworkError && err.kind === "blocked") throw networkToStoreError(err);
      sawNetwork = true;
      continue;
    }
    const verdict = classifyCatalogResponse(res);
    if (verdict.kind === "ok") return { kind: "ok", source, products: verdict.products };
    if (verdict.kind === "restricted") sawRestricted = true;
    if (verdict.kind === "rate_limited") sawRateLimit = true;
  }

  if (sawRateLimit) return { kind: "rate_limited" };
  if (sawRestricted) return { kind: "restricted" };
  if (sawNetwork) return { kind: "network" };
  return { kind: "missing" };
}

function checkedOrigin(storeUrl) {
  const normalized = normalizeStoreUrl(storeUrl);
  if (!normalized.ok) throw new StoreError("INVALID_URL", 400);
  return normalized.origin;
}

async function getJson(url) {
  let res;
  try {
    res = await safeFetch(url);
  } catch (err) {
    throw networkToStoreError(err);
  }
  return res;
}

/** Fetch one subsequent catalog page from a known source. */
export async function fetchCatalogPage({ storeUrl, source, page, currency }) {
  const origin = checkedOrigin(storeUrl);
  const pathFor = CATALOG_SOURCES[source];
  if (!pathFor) throw new StoreError("INVALID_URL", 400, "Unknown source");

  const res = await getJson(`${origin}${pathFor(page)}`);
  const verdict = classifyCatalogResponse(res);

  if (verdict.kind === "rate_limited") throw new StoreError("RATE_LIMITED", 429);
  if (verdict.kind === "restricted") throw new StoreError("PROTECTED", 403);
  if (verdict.kind === "error") throw new StoreError("STORE_UNAVAILABLE", 502);
  // Some stores answer past-the-end pages with 404 or HTML instead of [].
  if (verdict.kind === "missing") return { products: [], page, hasMore: false };

  const products = normalizeProducts(verdict.products, {
    origin,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
  });
  return { products, page, hasMore: verdict.products.length >= PAGE_SIZE };
}

/** One page of the public collection list. */
export async function fetchCollectionsPage({ storeUrl, page }) {
  const origin = checkedOrigin(storeUrl);
  const res = await getJson(`${origin}/collections.json?limit=${PAGE_SIZE}&page=${page}`);
  if (res.status === 429 || res.status === 430) throw new StoreError("RATE_LIMITED", 429);
  if (isAccessRestricted(res)) throw new StoreError("PROTECTED", 403);
  const json = res.status === 200 ? tryParseJson(res.text) : null;
  const list = json && Array.isArray(json.collections) ? json.collections : [];
  return {
    collections: list
      .filter((c) => c && c.handle)
      .map((c) => ({ id: String(c.id), handle: String(c.handle), title: c.title || c.handle })),
    page,
    hasMore: list.length >= PAGE_SIZE,
  };
}

/** Product IDs contained in one page of a public collection. */
export async function fetchCollectionProductIds({ storeUrl, handle, page }) {
  const origin = checkedOrigin(storeUrl);
  if (!/^[a-z0-9][a-z0-9\-_.%]*$/i.test(handle || "")) {
    throw new StoreError("INVALID_URL", 400, "Bad handle");
  }
  const res = await getJson(
    `${origin}/collections/${encodeURIComponent(handle)}/products.json?limit=${PAGE_SIZE}&page=${page}`,
  );
  const verdict = classifyCatalogResponse(res);
  if (verdict.kind === "rate_limited") throw new StoreError("RATE_LIMITED", 429);
  if (verdict.kind !== "ok") return { productIds: [], page, hasMore: false };
  return {
    productIds: verdict.products.map((p) => String(p.id)),
    page,
    hasMore: verdict.products.length >= PAGE_SIZE,
  };
}
