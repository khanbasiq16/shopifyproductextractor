import { Loader2 } from "lucide-react";
import { formatNumber } from "@/lib/format";

const PHASE_TEXT = {
  connecting: "Checking the store...",
  fetching: "Fetching Shopify products...",
  collections: "Mapping collections...",
};

export default function LoadingState({ progress, onCancel }) {
  const phase = progress?.phase || "connecting";
  return (
    <section
      className="rounded-xl border border-line bg-surface px-6 py-12 sm:py-16"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
        <h2 className="mt-4 text-base font-semibold text-ink">{PHASE_TEXT[phase]}</h2>

        <dl className="mt-6 grid w-full grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line text-left">
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-faint">Store</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-ink" title={progress?.host}>
              {progress?.host || "-"}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-faint">Products found</dt>
            <dd className="tabular mt-0.5 text-sm font-semibold text-ink">
              {formatNumber(progress?.count || 0)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 min-h-5 text-sm text-ink-soft">
          {progress?.detail ||
            (phase === "fetching" && progress?.page
              ? `Fetched ${formatNumber(progress.count)} products (page ${progress.page}). Please wait...`
              : "Please wait...")}
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="mt-5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
