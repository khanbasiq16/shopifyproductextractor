/**
 * Normalizes public Shopify catalog payloads into one internal shape.
 *
 * Supported input formats:
 *  - Storefront JSON feed   (/products.json, /collections/<handle>/products.json)
 *      prices are decimal strings ("25.00"), images are objects, description is body_html
 *  - AJAX product format    (/products/<handle>.js)
 *      prices are integers in cents, images are URL strings, description is "description"
 *
 * The UI and exports only ever consume the normalized shape below, so adding
 * another public source only requires another branch here.
 */

const ENTITY_MAP = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
  rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", trade: "\u2122",
  reg: "\u00ae", copy: "\u00a9", deg: "\u00b0", eacute: "\u00e9",
};

export function htmlToText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, ent) => {
      const key = ent.toLowerCase();
      if (ENTITY_MAP[key] !== undefined) return ENTITY_MAP[key];
      if (key.startsWith("#x")) {
        const cp = parseInt(key.slice(2), 16);
        return Number.isFinite(cp) ? safeFromCodePoint(cp, m) : m;
      }
      if (key.startsWith("#")) {
        const cp = parseInt(key.slice(1), 10);
        return Number.isFinite(cp) ? safeFromCodePoint(cp, m) : m;
      }
      return m;
    })
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeFromCodePoint(cp, fallback) {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return fallback;
  }
}

function shorten(text, max = 180) {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}\u2026`;
}

function absoluteUrl(src) {
  if (!src || typeof src !== "string") return null;
  if (src.startsWith("//")) return `https:${src}`;
  if (/^https?:\/\//i.test(src)) return src;
  return null;
}

function toNumber(value, inCents) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return inCents ? Math.round(n) / 100 : n;
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === "string") return tags.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

function isAjaxFormat(raw) {
  const firstVariant = Array.isArray(raw.variants) ? raw.variants[0] : null;
  return (
    ("description" in raw && !("body_html" in raw)) ||
    (firstVariant && typeof firstVariant.price === "number") ||
    (Array.isArray(raw.images) && typeof raw.images[0] === "string")
  );
}

/**
 * @param {object} raw public product payload
 * @param {{ origin: string, currency?: string|null }} ctx
 */
export function normalizeProduct(raw, ctx) {
  if (!raw || typeof raw !== "object" || raw.id === undefined) return null;
  const cents = isAjaxFormat(raw);

  const images = (Array.isArray(raw.images) ? raw.images : [])
    .map((img) => absoluteUrl(typeof img === "string" ? img : img && img.src))
    .filter(Boolean);
  const imageById = new Map();
  if (Array.isArray(raw.images)) {
    for (const img of raw.images) {
      if (img && typeof img === "object" && img.id) imageById.set(img.id, absoluteUrl(img.src));
    }
  }

  const variants = (Array.isArray(raw.variants) ? raw.variants : []).map((v, index) => {
    const options = [v.option1, v.option2, v.option3].filter(
      (o) => o !== null && o !== undefined && o !== "",
    );
    const inventory =
      typeof v.inventory_quantity === "number" ? v.inventory_quantity : null;
    let image = null;
    if (v.featured_image) image = absoluteUrl(v.featured_image.src || v.featured_image);
    else if (v.image_id && imageById.has(v.image_id)) image = imageById.get(v.image_id);

    return {
      id: v.id !== undefined ? String(v.id) : `${raw.id}-${index}`,
      title: v.title || options.join(" / ") || "Default Title",
      sku: v.sku ? String(v.sku) : "",
      barcode: v.barcode ? String(v.barcode) : "",
      price: toNumber(v.price, cents),
      compareAtPrice: toNumber(v.compare_at_price, cents),
      available: typeof v.available === "boolean" ? v.available : null,
      inventoryQuantity: inventory,
      options,
      weightGrams: typeof v.grams === "number" ? v.grams : null,
      requiresShipping: typeof v.requires_shipping === "boolean" ? v.requires_shipping : null,
      image,
    };
  });

  const prices = variants.map((v) => v.price).filter((p) => p !== null);
  const compares = variants
    .map((v) => v.compareAtPrice)
    .filter((p) => p !== null && p > 0);

  const price = prices.length ? Math.min(...prices) : toNumber(raw.price, cents);
  const maxPrice = prices.length ? Math.max(...prices) : price;
  let compareAtPrice = compares.length ? Math.max(...compares) : null;
  // A compare-at price that is not above the selling price is not a real discount.
  if (compareAtPrice !== null && price !== null && compareAtPrice <= price) compareAtPrice = null;

  const knownAvailability = variants.filter((v) => v.available !== null);
  let availability = "unknown";
  if (typeof raw.available === "boolean" && !knownAvailability.length) {
    availability = raw.available ? "available" : "sold_out";
  } else if (knownAvailability.length) {
    const availableCount = knownAvailability.filter((v) => v.available).length;
    if (availableCount === 0) availability = "sold_out";
    else if (availableCount === knownAvailability.length) availability = "available";
    else availability = "partial";
  }

  const description = htmlToText(cents ? raw.description : raw.body_html);
  const handle = raw.handle ? String(raw.handle) : "";

  return {
    id: String(raw.id),
    title: raw.title ? String(raw.title) : "Untitled product",
    handle,
    url: handle ? `${ctx.origin}/products/${encodeURIComponent(handle)}` : null,
    vendor: raw.vendor ? String(raw.vendor) : "",
    productType: raw.product_type || raw.type || "",
    tags: parseTags(raw.tags),
    description,
    shortDescription: shorten(description),
    images,
    image: images[0] || null,
    imageCount: images.length,
    variants,
    variantCount: variants.length,
    price,
    maxPrice,
    compareAtPrice,
    currency: ctx.currency || null,
    availability,
    skus: variants.map((v) => v.sku).filter(Boolean),
    createdAt: raw.created_at || null,
    publishedAt: raw.published_at || null,
    updatedAt: raw.updated_at || null,
    collections: [],
  };
}

export function normalizeProducts(list, ctx) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const p = normalizeProduct(raw, ctx);
    if (p) out.push(p);
  }
  return out;
}
