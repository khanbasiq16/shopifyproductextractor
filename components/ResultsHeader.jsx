import { Search, SlidersHorizontal, X, Clock, RefreshCw } from "lucide-react";
import ExportMenu from "./ExportMenu";
import { formatDateTime, formatNumber } from "@/lib/format";

export default function ResultsHeader({
  store,
  totalProducts,
  fetchedAt,
  query,
  onQueryChange,
  filtersOpen,
  onToggleFilters,
  activeFilterCount,
  products,
  onRefresh,
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h2 className="truncate text-2xl font-semibold tracking-tight text-ink sm:text-[28px]" title={store.hostname}>
          {store.hostname}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
          <span className="tabular font-medium text-ink">
            {formatNumber(totalProducts)} {totalProducts === 1 ? "Product" : "Products"} found
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Last fetched: {formatDateTime(fetchedAt)}
          </span>
          {store.currency && <span>Currency: {store.currency}</span>}
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 font-medium text-brand hover:text-brand-strong"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search products..."
            aria-label="Search products by title, vendor, type, SKU or handle"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <button
            type="button"
            onClick={onToggleFilters}
            aria-expanded={filtersOpen}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
              filtersOpen || activeFilterCount
                ? "border-brand bg-brand-soft text-brand-strong"
                : "border-line-strong bg-surface text-ink hover:bg-canvas"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <span className="tabular rounded-full bg-brand px-1.5 text-xs font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <ExportMenu products={products} hostname={store.hostname} />
        </div>
      </div>
    </div>
  );
}
