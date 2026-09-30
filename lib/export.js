/**
 * Builds CSV / XLSX exports from ALL fetched products (never just the visible page).
 * Detailed exports use one row per variant so no variant data is lost.
 */
import { buildXlsx } from "./xlsx.js";
import { storeSlug } from "./url.js";
import { todayStamp, AVAILABILITY_LABEL } from "./format.js";

function variantAvailability(v) {
  if (v.available === true) return "Available";
  if (v.available === false) return "Sold Out";
  return "Unknown";
}

/** Column definitions for the detailed (one row per variant) export. */
const VARIANT_COLUMNS = [
  { header: "Product ID", width: 16, get: (p) => p.id },
  { header: "Title", width: 36, get: (p) => p.title },
  { header: "Handle", width: 28, get: (p) => p.handle },
  { header: "Product URL", width: 44, get: (p) => p.url },
  { header: "Vendor", width: 20, get: (p) => p.vendor },
  { header: "Product Type", width: 20, get: (p) => p.productType },
  { header: "Tags", width: 30, get: (p) => p.tags.join(", ") },
  { header: "Collections", width: 30, get: (p) => (p.collections || []).join(", ") },
  { header: "Description", width: 50, get: (p) => p.description },
  { header: "Short Description", width: 40, get: (p) => p.shortDescription },
  { header: "Price", width: 11, get: (p, v) => (v ? v.price : p.price) },
  { header: "Compare At Price", width: 16, get: (p, v) => (v ? v.compareAtPrice : p.compareAtPrice) },
  { header: "Currency", width: 10, get: (p) => p.currency },
  { header: "Variant Count", width: 13, get: (p) => p.variantCount },
  { header: "Variant ID", width: 16, get: (p, v) => (v ? v.id : "") },
  { header: "Variant Title", width: 24, get: (p, v) => (v ? v.title : "") },
  { header: "Option Values", width: 24, get: (p, v) => (v ? v.options.join(" / ") : "") },
  { header: "SKU", width: 18, get: (p, v) => (v ? v.sku : "") },
  { header: "Barcode", width: 16, get: (p, v) => (v ? v.barcode : "") },
  { header: "Availability", width: 13, get: (p, v) => (v ? variantAvailability(v) : AVAILABILITY_LABEL[p.availability]) },
  { header: "Inventory Quantity", width: 17, get: (p, v) => (v && v.inventoryQuantity !== null ? v.inventoryQuantity : null) },
  { header: "Weight (g)", width: 11, get: (p, v) => (v ? v.weightGrams : null) },
  { header: "Variant Image", width: 40, get: (p, v) => (v ? v.image : "") },
  { header: "Main Image", width: 40, get: (p) => p.image },
  { header: "Image Count", width: 12, get: (p) => p.imageCount },
  { header: "Image URLs", width: 50, get: (p) => p.images.join(" | ") },
  { header: "Created At", width: 22, get: (p) => p.createdAt },
  { header: "Published At", width: 22, get: (p) => p.publishedAt },
  { header: "Updated At", width: 22, get: (p) => p.updatedAt },
];

/** Column definitions for the summary (one row per product) sheet. */
const PRODUCT_COLUMNS = [
  { header: "Product ID", width: 16, get: (p) => p.id },
  { header: "Title", width: 36, get: (p) => p.title },
  { header: "Handle", width: 28, get: (p) => p.handle },
  { header: "Product URL", width: 44, get: (p) => p.url },
  { header: "Vendor", width: 20, get: (p) => p.vendor },
  { header: "Product Type", width: 20, get: (p) => p.productType },
  { header: "Tags", width: 30, get: (p) => p.tags.join(", ") },
  { header: "Collections", width: 30, get: (p) => (p.collections || []).join(", ") },
  { header: "Min Price", width: 11, get: (p) => p.price },
  { header: "Max Price", width: 11, get: (p) => p.maxPrice },
  { header: "Compare At Price", width: 16, get: (p) => p.compareAtPrice },
  { header: "Currency", width: 10, get: (p) => p.currency },
  { header: "Variant Count", width: 13, get: (p) => p.variantCount },
  { header: "SKUs", width: 30, get: (p) => p.skus.join(", ") },
  { header: "Availability", width: 18, get: (p) => AVAILABILITY_LABEL[p.availability] },
  { header: "Main Image", width: 40, get: (p) => p.image },
  { header: "Image Count", width: 12, get: (p) => p.imageCount },
  { header: "Created At", width: 22, get: (p) => p.createdAt },
  { header: "Published At", width: 22, get: (p) => p.publishedAt },
];

export function variantRows(products) {
  const rows = [];
  for (const p of products) {
    if (!p.variants.length) {
      rows.push(VARIANT_COLUMNS.map((c) => c.get(p, null)));
      continue;
    }
    for (const v of p.variants) rows.push(VARIANT_COLUMNS.map((c) => c.get(p, v)));
  }
  return rows;
}

function productRows(products) {
  return products.map((p) => PRODUCT_COLUMNS.map((c) => c.get(p)));
}

/* ------------------------------ CSV ------------------------------- */
function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value);
  // Neutralise spreadsheet formula injection from store-supplied text.
  if (/^[=+@\t\r]/.test(text) || /^-[^\d]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCsv(products) {
  const lines = [VARIANT_COLUMNS.map((c) => csvCell(c.header)).join(",")];
  for (const row of variantRows(products)) lines.push(row.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 correctly.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function buildWorkbook(products) {
  return buildXlsx([
    { name: "Variants", columns: VARIANT_COLUMNS, rows: variantRows(products) },
    { name: "Products", columns: PRODUCT_COLUMNS, rows: productRows(products) },
  ]);
}

export function exportFilename(hostname, ext, date = new Date()) {
  return `shopify-products-${storeSlug(hostname)}-${todayStamp(date)}.${ext}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * @param {"csv"|"xlsx"} format
 * @param {object[]} products all fetched products
 * @param {string} hostname
 */
export function exportProducts(format, products, hostname) {
  if (format === "csv") {
    const blob = new Blob([buildCsv(products)], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, exportFilename(hostname, "csv"));
    return;
  }
  downloadBlob(buildWorkbook(products), exportFilename(hostname, "xlsx"));
}
