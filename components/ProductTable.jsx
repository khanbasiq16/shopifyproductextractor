"use client";

import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ExternalLink, SearchX } from "lucide-react";
import ProductImage from "./ProductImage";
import AvailabilityBadge from "./AvailabilityBadge";
import TablePagination from "./TablePagination";
import { formatMoney, formatNumber } from "@/lib/format";

const SORTABLE = {
  title: "Product name",
  vendor: "Vendor",
  price: "Price",
  compareAtPrice: "Compare-at price",
  variantCount: "Variant count",
};

function priceLabel(p) {
  const min = formatMoney(p.price, p.currency);
  if (min === null) return "-";
  if (p.maxPrice !== null && p.maxPrice !== p.price) {
    return `${min} \u2013 ${formatMoney(p.maxPrice, p.currency)}`;
  }
  return min;
}

function skuLabel(p) {
  if (!p.skus.length) return "-";
  return p.skus.length > 1 ? `${p.skus[0]} +${p.skus.length - 1}` : p.skus[0];
}

function SortHeader({ field, sort, onSort, children, align = "left" }) {
  const active = sort.key === field;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 rounded hover:text-ink ${active ? "text-ink" : ""}`}
      >
        {children}
        <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-50"}`} aria-hidden="true" />
      </button>
    </th>
  );
}

function StaticHeader({ children, align = "left", className = "" }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </th>
  );
}

function VariantList({ product }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="text-ink-faint">
          <tr>
            <th className="py-1.5 pr-3 text-left font-medium">Variant</th>
            <th className="py-1.5 pr-3 text-left font-medium">SKU</th>
            <th className="py-1.5 pr-3 text-right font-medium">Price</th>
            <th className="py-1.5 pr-3 text-right font-medium">Compare at</th>
            <th className="py-1.5 pr-3 text-left font-medium">Availability</th>
            <th className="py-1.5 text-left font-medium">Variant ID</th>
          </tr>
        </thead>
        <tbody className="tabular text-ink">
          {product.variants.map((v) => (
            <tr key={v.id} className="border-t border-line/70">
              <td className="py-1.5 pr-3">{v.title}</td>
              <td className="py-1.5 pr-3 text-ink-soft">{v.sku || "-"}</td>
              <td className="py-1.5 pr-3 text-right">{formatMoney(v.price, product.currency) ?? "-"}</td>
              <td className="py-1.5 pr-3 text-right text-ink-soft">
                {v.compareAtPrice && v.compareAtPrice > (v.price ?? 0)
                  ? formatMoney(v.compareAtPrice, product.currency)
                  : "-"}
              </td>
              <td className="py-1.5 pr-3">
                <AvailabilityBadge
                  value={v.available === true ? "available" : v.available === false ? "sold_out" : "unknown"}
                />
              </td>
              <td className="py-1.5 text-ink-faint">{v.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProductTable({
  rows,
  total,
  sort,
  onSort,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onSortChange,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (total === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-14 text-center">
        <SearchX className="h-7 w-7 text-ink-faint" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-ink">No products match your search or filters</p>
        <p className="mt-1 text-sm text-ink-soft">Try a different search term or clear the filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {/* Mobile: sort control + cards */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 md:hidden">
        <label htmlFor="mobile-sort" className="text-sm text-ink-soft">
          Sort
        </label>
        <select
          id="mobile-sort"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(":");
            onSortChange({ key, dir });
          }}
          className="h-9 flex-1 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
        >
          {Object.entries(SORTABLE).flatMap(([key, label]) => [
            <option key={`${key}:asc`} value={`${key}:asc`}>
              {label} (ascending)
            </option>,
            <option key={`${key}:desc`} value={`${key}:desc`}>
              {label} (descending)
            </option>,
          ])}
        </select>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((p) => (
          <li key={p.id} className="px-4 py-3.5">
            <div className="flex gap-3">
              <ProductImage src={p.image} alt={p.title} size={52} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-ink">{p.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {[p.vendor, p.productType].filter(Boolean).join(", ") || p.handle}
                </p>
                <div className="tabular mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  <span className="font-medium text-ink">{priceLabel(p)}</span>
                  {p.compareAtPrice !== null && (
                    <span className="text-ink-faint line-through">{formatMoney(p.compareAtPrice, p.currency)}</span>
                  )}
                  <AvailabilityBadge value={p.availability} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
                  <button type="button" onClick={() => toggle(p.id)} className="inline-flex items-center gap-1 hover:text-ink">
                    {formatNumber(p.variantCount)} {p.variantCount === 1 ? "variant" : "variants"}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${expanded.has(p.id) ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand">
                      View <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            {expanded.has(p.id) && (
              <div className="mt-3 rounded-lg bg-canvas p-3">
                <VariantList product={p} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="border-b border-line bg-canvas text-xs text-ink-soft">
            <tr>
              <StaticHeader className="w-16">Image</StaticHeader>
              <SortHeader field="title" sort={sort} onSort={onSort}>
                Product
              </SortHeader>
              <SortHeader field="vendor" sort={sort} onSort={onSort}>
                Vendor
              </SortHeader>
              <StaticHeader>Type</StaticHeader>
              <SortHeader field="price" sort={sort} onSort={onSort} align="right">
                Price
              </SortHeader>
              <SortHeader field="compareAtPrice" sort={sort} onSort={onSort} align="right">
                Compare Price
              </SortHeader>
              <SortHeader field="variantCount" sort={sort} onSort={onSort} align="right">
                Variants
              </SortHeader>
              <StaticHeader>SKU</StaticHeader>
              <StaticHeader>Availability</StaticHeader>
              <StaticHeader>Product URL</StaticHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => {
              const isOpen = expanded.has(p.id);
              return (
                <Fragment key={p.id}>
                  <tr className="align-middle hover:bg-canvas/60">
                    <td className="px-3 py-2.5">
                      <ProductImage src={p.image} alt={p.title} size={44} />
                    </td>
                    <td className="max-w-[320px] px-3 py-2.5">
                      <p className="line-clamp-2 font-medium text-ink" title={p.title}>
                        {p.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-faint" title={p.handle}>
                        {p.handle}
                      </p>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-ink-soft" title={p.vendor}>
                      {p.vendor || "-"}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-ink-soft" title={p.productType}>
                      {p.productType || "-"}
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-medium text-ink">
                      {priceLabel(p)}
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-ink-faint">
                      {p.compareAtPrice !== null ? (
                        <span className="line-through">{formatMoney(p.compareAtPrice, p.currency)}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => toggle(p.id)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} variants for ${p.title}`}
                        className="tabular inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ink hover:bg-canvas"
                      >
                        {formatNumber(p.variantCount)}
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-ink-soft" title={p.skus.join(", ")}>
                      {skuLabel(p)}
                    </td>
                    <td className="px-3 py-2.5">
                      <AvailabilityBadge value={p.availability} />
                    </td>
                    <td className="px-3 py-2.5">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-brand hover:text-brand-strong hover:underline"
                        >
                          View product
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-canvas/70">
                      <td />
                      <td colSpan={9} className="px-3 pb-3 pt-1">
                        <VariantList product={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
