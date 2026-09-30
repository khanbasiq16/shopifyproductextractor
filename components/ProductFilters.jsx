import { X } from "lucide-react";
import { AVAILABILITY_LABEL } from "@/lib/format";

function Select({ id, label, value, onChange, options, allLabel }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-soft">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ProductFilters({ options, filters, onChange, onClear, activeCount }) {
  const set = (key) => (value) => onChange({ ...filters, [key]: value });
  const withCount = (list) => list.map(([value, count]) => ({ value, label: `${value || "(none)"} (${count})` }));

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          id="filter-vendor"
          label="Vendor"
          value={filters.vendor}
          onChange={set("vendor")}
          options={withCount(options.vendors)}
          allLabel="All vendors"
        />
        <Select
          id="filter-type"
          label="Product type"
          value={filters.productType}
          onChange={set("productType")}
          options={withCount(options.types)}
          allLabel="All types"
        />
        <Select
          id="filter-availability"
          label="Availability"
          value={filters.availability}
          onChange={set("availability")}
          options={options.availability.map(([value, count]) => ({
            value,
            label: `${AVAILABILITY_LABEL[value]} (${count})`,
          }))}
          allLabel="Any availability"
        />
        {options.collections.length > 0 && (
          <Select
            id="filter-collection"
            label="Collection"
            value={filters.collection}
            onChange={set("collection")}
            options={withCount(options.collections)}
            allLabel="All collections"
          />
        )}
      </div>
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Clear filters
        </button>
      )}
    </div>
  );
}
