"use client";

/**
 * Client hook that drives catalog retrieval page by page through the API
 * routes, so progress is live and every server call stays short.
 */
import { useCallback, useRef, useState } from "react";
import { messageFor } from "./errors.js";

const envNumber = (value, fallback, min) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

const REQUEST_DELAY = envNumber(process.env.NEXT_PUBLIC_REQUEST_DELAY_MS, 600, 250);
const MAX_PAGES = envNumber(process.env.NEXT_PUBLIC_MAX_PAGES, 100, 1);
const MAX_COLLECTIONS = envNumber(process.env.NEXT_PUBLIC_MAX_COLLECTIONS, 150, 1);
const MAX_PAGES_PER_COLLECTION = 40;
const RATE_LIMIT_BACKOFF = [3000, 7000, 15000];

class ApiError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/** POST JSON with polite retry on rate limits and one retry on network hiccups. */
async function callApi(path, body, signal, onWait) {
  let networkRetried = false;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      if (!networkRetried) {
        networkRetried = true;
        await sleep(1500, signal);
        continue;
      }
      throw new ApiError("STORE_UNAVAILABLE");
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON: handled below */
    }

    if (data?.ok) return data;
    const code = data?.error?.code || (res.status === 429 ? "RATE_LIMITED" : "UNKNOWN");

    if (code === "RATE_LIMITED" && attempt < RATE_LIMIT_BACKOFF.length) {
      const wait = RATE_LIMIT_BACKOFF[attempt];
      onWait?.(wait);
      await sleep(wait, signal);
      continue;
    }
    throw new ApiError(code);
  }
}

const INITIAL = {
  status: "idle", // idle | loading | done | error
  store: null,
  products: [],
  error: null, // { code, message }
  warning: null,
  fetchedAt: null,
  progress: null, // { phase, count, page, detail }
};

export function useCatalog() {
  const [state, setState] = useState(INITIAL);
  const controllerRef = useRef(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState(INITIAL);
  }, []);

  const fetchCatalog = useCallback(async (storeInput, { includeCollections = false } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    const displayHost = storeInput.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    setState({
      ...INITIAL,
      status: "loading",
      progress: { phase: "connecting", count: 0, page: 0, host: displayHost, detail: null },
    });

    const byId = new Map();
    const products = [];
    let store = null;
    let warning = null;

    const addProducts = (list) => {
      let added = 0;
      for (const p of list) {
        if (byId.has(p.id)) continue;
        byId.set(p.id, p);
        products.push(p);
        added++;
      }
      return added;
    };

    const setProgress = (patch) =>
      setState((s) => (s.status === "loading" ? { ...s, progress: { ...s.progress, ...patch } } : s));

    const onWait = (ms) =>
      setProgress({ detail: `The store is limiting requests. Retrying in ${Math.round(ms / 1000)}s...` });

    try {
      // Page 1: validation, Shopify detection, source discovery.
      const first = await callApi("/api/products", { storeUrl: storeInput }, signal, onWait);
      store = first.store;
      addProducts(first.products);
      setProgress({ phase: "fetching", count: products.length, page: 1, host: store.hostname, detail: null });

      // Remaining pages.
      let page = 1;
      let hasMore = first.hasMore;
      while (hasMore && page < MAX_PAGES) {
        await sleep(REQUEST_DELAY, signal);
        page++;
        let res;
        try {
          res = await callApi(
            "/api/products",
            { storeUrl: store.origin, page, source: store.source, currency: store.currency },
            signal,
            onWait,
          );
        } catch (err) {
          if (err?.name === "AbortError") throw err;
          warning = `Retrieval stopped after ${products.length.toLocaleString()} products. ${messageFor(err.code)}`;
          break;
        }
        const added = addProducts(res.products);
        setProgress({ count: products.length, page, detail: null });
        // Stop if the store keeps returning the same page.
        hasMore = res.hasMore && added > 0;
      }
      if (hasMore && page >= MAX_PAGES) {
        warning = `Stopped at the configured limit of ${MAX_PAGES} pages (${products.length.toLocaleString()} products).`;
      }

      // Optional: map public collections onto products.
      let collectionsMapped = false;
      if (includeCollections) {
        const result = await mapCollections(store, byId, signal, setProgress, onWait);
        collectionsMapped = result.mapped;
        if (result.warning && !warning) warning = result.warning;
      }

      setState({
        status: "done",
        store: { ...store, collectionsMapped },
        products,
        error: null,
        warning,
        fetchedAt: new Date().toISOString(),
        progress: null,
      });
    } catch (err) {
      // A newer request replaced this one: leave its state alone.
      if (controllerRef.current !== controller) return;
      if (err?.name === "AbortError") {
        // Cancelled by the user: keep whatever was fetched.
        if (products.length && store) {
          setState({
            status: "done",
            store,
            products,
            error: null,
            warning: `Retrieval was cancelled after ${products.length.toLocaleString()} products.`,
            fetchedAt: new Date().toISOString(),
            progress: null,
          });
        } else {
          setState(INITIAL);
        }
        return;
      }
      const code = err instanceof ApiError ? err.code : "UNKNOWN";
      setState({ ...INITIAL, status: "error", error: { code, message: messageFor(code) } });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  return { ...state, fetchCatalog, cancel, reset };
}

async function mapCollections(store, byId, signal, setProgress, onWait) {
  setProgress({ phase: "collections", detail: "Loading public collections..." });
  const collections = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await callApi("/api/collections", { action: "list", storeUrl: store.origin, page }, signal, onWait);
      collections.push(...res.collections.filter((c) => c.handle !== "all"));
      if (!res.hasMore || collections.length >= MAX_COLLECTIONS) break;
      await sleep(REQUEST_DELAY, signal);
    }
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { mapped: false, warning: "Collections could not be retrieved for this store." };
  }

  const targets = collections.slice(0, MAX_COLLECTIONS);
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    setProgress({ detail: `Mapping collections: ${i + 1} of ${targets.length}` });
    for (let page = 1; page <= MAX_PAGES_PER_COLLECTION; page++) {
      await sleep(REQUEST_DELAY, signal);
      let res;
      try {
        res = await callApi(
          "/api/collections",
          { action: "products", storeUrl: store.origin, handle: c.handle, page },
          signal,
          onWait,
        );
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        return {
          mapped: true,
          warning: `Collections were only partly mapped (${i} of ${targets.length}) because the store limited requests.`,
        };
      }
      for (const id of res.productIds) {
        const product = byId.get(id);
        if (product && !product.collections.includes(c.title)) product.collections.push(c.title);
      }
      if (!res.hasMore) break;
    }
  }
  const capped =
    collections.length > MAX_COLLECTIONS
      ? `Only the first ${MAX_COLLECTIONS} collections were mapped.`
      : null;
  return { mapped: targets.length > 0, warning: capped };
}
