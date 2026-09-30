"use client";

import { useState } from "react";
import { Store, Loader2, Search } from "lucide-react";
import { normalizeStoreUrl } from "@/lib/url";
import { messageFor } from "@/lib/errors";

export default function StoreInput({ onSubmit, loading }) {
  const [value, setValue] = useState("");
  const [includeCollections, setIncludeCollections] = useState(false);
  const [error, setError] = useState(null);

  function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    const normalized = normalizeStoreUrl(value);
    if (!normalized.ok) {
      setError(messageFor("INVALID_URL"));
      return;
    }
    setError(null);
    setValue(normalized.hostname);
    onSubmit(normalized.origin, { includeCollections });
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="store-url" className="block text-sm font-medium text-ink">
          Enter Shopify Store URL
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Store
              className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              id="store-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://example-store.com"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "store-url-error" : "store-url-hint"}
              className={`h-11 w-full rounded-lg border bg-surface pl-10 pr-3 text-[15px] text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 disabled:bg-canvas disabled:text-ink-soft ${
                error
                  ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                  : "border-line-strong focus:border-brand focus:ring-brand-soft"
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            {loading ? "Fetching..." : "Fetch Products"}
          </button>
        </div>

        {error ? (
          <p id="store-url-error" role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        ) : (
          <p id="store-url-hint" className="mt-2 text-xs text-ink-faint">
            Works with or without https://. Only publicly accessible catalog data is retrieved.
          </p>
        )}

        <label className="mt-3 flex cursor-pointer select-none items-start gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={includeCollections}
            onChange={(e) => setIncludeCollections(e.target.checked)}
            disabled={loading}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[#0b6b4f]"
          />
          <span>
            Also map products to their public collections{" "}
            <span className="text-ink-faint">(slower on large stores)</span>
          </span>
        </label>
      </form>
    </section>
  );
}
