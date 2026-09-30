"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import StoreInput from "@/components/StoreInput";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import Notice from "@/components/Notice";
import StatsCards from "@/components/StatsCards";
import ResultsHeader from "@/components/ResultsHeader";
import ProductFilters from "@/components/ProductFilters";
import ProductTable from "@/components/ProductTable";
import { useCatalog } from "@/lib/useCatalog";
import {
  EMPTY_FILTERS,
  buildSearchIndex,
  catalogStats,
  filterOptions,
  filterProducts,
  sortProducts,
} from "@/lib/catalog-view";

const ERROR_TITLES = {
  INVALID_URL: "Invalid URL",
  STORE_UNAVAILABLE: "Store unavailable",
  NOT_SHOPIFY: "Not a Shopify store",
  NO_PRODUCTS: "No products",
  PROTECTED: "Catalog restricted",
  RATE_LIMITED: "Too many requests",
  UNKNOWN: "Something went wrong",
};

export default function HomePage() {
  const catalog = useCatalog();
  const { status, store, products, error, warning, fetchedAt, progress } = catalog;

  const [lastRequest, setLastRequest] = useState(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState({ key: "title", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [warningDismissed, setWarningDismissed] = useState(false);

  const deferredQuery = useDeferredValue(query);

  function startFetch(url, options) {
    setLastRequest({ url, options });
    setQuery("");
    setFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
    setPage(1);
    setWarningDismissed(false);
    catalog.fetchCatalog(url, options);
  }

  const searchIndex = useMemo(() => buildSearchIndex(products), [products]);
  const options = useMemo(() => filterOptions(products), [products]);
  const stats = useMemo(() => catalogStats(products), [products]);

  const visible = useMemo(() => {
    const filtered = filterProducts(products, searchIndex, deferredQuery, filters);
    return sortProducts(filtered, sort);
  }, [products, searchIndex, deferredQuery, filters, sort]);

  // Return to page 1 whenever the result set changes shape.
  useEffect(() => {
    setPage(1);
  }, [deferredQuery, filters, sort, pageSize]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice((safePage - 1) * pageSize, safePage * pageSize);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  function handleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "title" || key === "vendor" ? "asc" : "desc" },
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <StoreInput onSubmit={startFetch} loading={status === "loading"} />

        {status === "idle" && <EmptyState />}

        {status === "loading" && <LoadingState progress={progress} onCancel={catalog.cancel} />}

        {status === "error" && error && (
          <Notice tone="error" title={ERROR_TITLES[error.code] || ERROR_TITLES.UNKNOWN}>
            {error.message}
          </Notice>
        )}

        {status === "done" && store && (
          <section className="flex flex-col gap-5" aria-label="Results">
            {warning && !warningDismissed && (
              <Notice tone="warning" onDismiss={() => setWarningDismissed(true)}>
                {warning}
              </Notice>
            )}

            <ResultsHeader
              store={store}
              totalProducts={products.length}
              fetchedAt={fetchedAt}
              query={query}
              onQueryChange={setQuery}
              filtersOpen={filtersOpen}
              onToggleFilters={() => setFiltersOpen((o) => !o)}
              activeFilterCount={activeFilterCount}
              products={products}
              onRefresh={() => lastRequest && startFetch(store.origin, lastRequest.options)}
            />

            <StatsCards stats={stats} />

            {filtersOpen && (
              <ProductFilters
                options={options}
                filters={filters}
                onChange={setFilters}
                onClear={() => setFilters(EMPTY_FILTERS)}
                activeCount={activeFilterCount}
              />
            )}

            <ProductTable
              rows={pageRows}
              total={visible.length}
              sort={sort}
              onSort={handleSort}
              onSortChange={setSort}
              page={safePage}
              pageSize={pageSize}
              onPageChange={(p) => {
                setPage(p);
                if (typeof window !== "undefined") {
                  document.querySelector('[aria-label="Results"]')?.scrollIntoView({ block: "start" });
                }
              }}
              onPageSizeChange={setPageSize}
            />
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-[1400px] px-4 pb-8 text-xs text-ink-faint sm:px-6 lg:px-8">
        Reads only publicly accessible storefront data. Not affiliated with Shopify.
      </footer>
    </div>
  );
}
