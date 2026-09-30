import { ShoppingBag } from "lucide-react";

export default function EmptyState() {
  return (
    <section className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center sm:py-24">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <ShoppingBag className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-ink">Extract Shopify Products</h2>
      <p className="mt-1.5 max-w-md text-sm text-ink-soft">
        Enter a public Shopify store URL above to view its product catalog.
      </p>
    </section>
  );
}
