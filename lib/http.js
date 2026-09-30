/**
 * Server-only HTTP helper for talking to public storefronts.
 *
 * - Resolves every hostname and refuses private/internal addresses (SSRF guard).
 * - Follows redirects manually so every hop is checked.
 * - Enforces a timeout and a response size cap.
 * - Retries politely on HTTP 429, honouring Retry-After (capped).
 *
 * It deliberately does NOT try to get past bot protection, CAPTCHAs,
 * password pages or any other access control. Those responses are
 * returned as-is so the caller can report them to the user.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

const USER_AGENT =
  "ShopifyProductExtractor/1.0 (public catalog viewer; respects robots and rate limits)";
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = Number(process.env.REQUEST_TIMEOUT_MS) || 15000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export class NetworkError extends Error {
  constructor(kind, message) {
    super(message || kind);
    this.kind = kind; // "dns" | "blocked" | "timeout" | "network" | "too_large" | "redirects"
  }
}

function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("fc") || v.startsWith("fd")) return true;
    if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) {
    throw new NetworkError("blocked", "IP addresses are not accepted");
  }
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new NetworkError("dns", "Hostname could not be resolved");
  }
  if (!records.length || records.some((r) => isPrivateIp(r.address))) {
    throw new NetworkError("blocked", "Hostname resolves to a non-public address");
  }
}

async function readBody(response, maxBytes, truncate) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      if (truncate) break;
      throw new NetworkError("too_large", "Response exceeded size limit");
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} url absolute https URL
 * @param {{ accept?: string, timeout?: number, maxBytes?: number, retries?: number, readBody?: boolean, truncate?: boolean }} [opts]
 * @returns {Promise<{ status: number, headers: Headers, url: string, text: string, redirects: string[] }>}
 */
export async function safeFetch(url, opts = {}) {
  const {
    accept = "application/json",
    timeout = DEFAULT_TIMEOUT,
    maxBytes = DEFAULT_MAX_BYTES,
    retries = 2,
    readBody: shouldRead = true,
    truncate = false,
  } = opts;

  for (let attempt = 0; ; attempt++) {
    const result = await fetchFollowingRedirects(url, { accept, timeout, maxBytes, shouldRead, truncate });
    if (result.status !== 429 || attempt >= retries) return result;

    const retryAfter = Number(result.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 4000)
      : 1200 * (attempt + 1);
    await sleep(wait);
  }
}

async function fetchFollowingRedirects(startUrl, { accept, timeout, maxBytes, shouldRead, truncate }) {
  let current = startUrl;
  const redirects = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new NetworkError("blocked", "Unsupported protocol");
    }
    await assertPublicHost(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept,
          "Accept-Language": "en-US,en;q=0.8",
        },
        cache: "no-store",
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === "AbortError") throw new NetworkError("timeout", "Request timed out");
      throw new NetworkError("network", "Connection failed");
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      clearTimeout(timer);
      try {
        await response.body?.cancel();
      } catch {}
      const next = new URL(response.headers.get("location"), current).toString();
      redirects.push(next);
      current = next;
      continue;
    }

    try {
      const text = shouldRead ? await readBody(response, maxBytes, truncate) : "";
      return { status: response.status, headers: response.headers, url: current, text, redirects };
    } catch (err) {
      if (err instanceof NetworkError) throw err;
      if (err && err.name === "AbortError") throw new NetworkError("timeout", "Request timed out");
      throw new NetworkError("network", "Connection interrupted");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new NetworkError("redirects", "Too many redirects");
}

/** Parse JSON without throwing. */
export function tryParseJson(text) {
  if (!text) return null;
  const trimmed = text.trimStart();
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
