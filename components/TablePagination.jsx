import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";

export const PAGE_SIZES = [25, 50, 100];

export default function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
      <p className="tabular">
        Showing {formatNumber(start)}&ndash;{formatNumber(end)} of {formatNumber(total)} products
      </p>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-brand focus:outline-none"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-surface text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="tabular min-w-20 text-center">
            {formatNumber(page)} / {formatNumber(pageCount)}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-surface text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
