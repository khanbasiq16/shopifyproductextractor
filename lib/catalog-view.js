/**
 * Pure helpers for search / filter / sort / stats over normalized products.
 * Kept separate from components so they are easy to test.
 */

export const EMPTY_FILTERS = { vendor: "", productType: "", availability: "", collection: "" };

export function buildSearchIndex(products) {
  const index = new Map();
  for (const p of products) {
    index.set(
      p.id,
      [p.title, p.vendor, p.productType, p.handle, ...p.skus].join("\n").toLowerCase(),
    );
  }
  return index;
}

export function filterProducts(products, index, query, filters) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return products.filter((p) => {
    if (filters.vendor && p.vendor !== filters.vendor) return false;
    if (filters.productType && p.productType !== filters.productType) return false;
    if (filters.availability && p.availability !== filters.availability) return false;
    if (filters.collection && !p.collections.includes(filters.collection)) return false;
    if (terms.length) {
      const haystack = index.get(p.id) || "";
      for (const t of terms) if (!haystack.includes(t)) return false;
    }
    return true;
  });
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function sortProducts(products, { key, dir }) {
  const sign = dir === "desc" ? -1 : 1;
  const numeric = key === "price" || key === "compareAtPrice" || key === "variantCount";
  return [...products].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const aEmpty = av === null || av === undefined || av === "";
    const bEmpty = bv === null || bv === undefined || bv === "";
    // Missing values always sort last, regardless of direction.
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const cmp = numeric ? av - bv : collator.compare(String(av), String(bv));
    return cmp * sign || collator.compare(a.title, b.title);
  });
}

function countBy(products, pick) {
  const counts = new Map();
  for (const p of products) {
    const values = [].concat(pick(p));
    for (const v of values) {
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => collator.compare(a[0], b[0]));
}

export function filterOptions(products) {
  const order = ["available", "partial", "sold_out", "unknown"];
  return {
    vendors: countBy(products, (p) => p.vendor),
    types: countBy(products, (p) => p.productType),
    collections: countBy(products, (p) => p.collections),
    availability: countBy(products, (p) => p.availability).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    ),
  };
}

export function catalogStats(products) {
  const vendors = new Set();
  let variants = 0;
  let available = 0;
  for (const p of products) {
    variants += p.variantCount;
    if (p.availability === "available" || p.availability === "partial") available++;
    if (p.vendor) vendors.add(p.vendor.toLowerCase());
  }
  return { products: products.length, variants, available, vendors: vendors.size };
}
