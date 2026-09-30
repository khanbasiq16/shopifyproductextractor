/**
 * URL helpers shared by the client and the server.
 */

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/i;

/**
 * Turns user input like "example-store.com", "https://example-store.com/collections/x"
 * or "  HTTP://Example-Store.com/  " into a canonical https origin.
 *
 * @param {string} input
 * @returns {{ ok: true, origin: string, hostname: string } | { ok: false }}
 */
export function normalizeStoreUrl(input) {
  if (typeof input !== "string") return { ok: false };
  let value = input.trim();
  if (!value || value.length > 2048) return { ok: false };

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false };
  }
  if (parsed.username || parsed.password) return { ok: false };
  if (parsed.port && parsed.port !== "443" && parsed.port !== "80") {
    return { ok: false };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

  // Must look like a public domain name: no bare IPs, no localhost.
  if (!HOSTNAME_RE.test(hostname)) return { ok: false };
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { ok: false };
  }

  // Storefront endpoints are always served over https.
  return { ok: true, origin: `https://${hostname}`, hostname };
}

/** "www.example-store.com" -> "example-store" (used for export filenames). */
export function storeSlug(hostname) {
  const base = String(hostname || "store")
    .replace(/^www\./, "")
    .replace(/\.myshopify\.com$/, "")
    .replace(/\.[a-z]{2,}(\.[a-z]{2})?$/i, "");
  return base.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "store";
}
