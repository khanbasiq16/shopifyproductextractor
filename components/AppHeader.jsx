import { ShoppingBag, ShieldCheck } from "lucide-react";

export default function AppHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Shopify Product Extractor</h1>
            <p className="mt-0.5 text-sm text-ink-soft">
              Enter a Shopify store URL to fetch and export its publicly available products.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-soft">
          <ShieldCheck className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
          Public Shopify Catalog
        </span>
      </div>
    </header>
  );
}
