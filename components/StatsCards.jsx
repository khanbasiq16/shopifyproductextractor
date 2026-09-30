import { Package, Layers, CircleCheck, Building2 } from "lucide-react";
import { formatNumber } from "@/lib/format";

export default function StatsCards({ stats }) {
  const items = [
    { label: "Total Products", value: stats.products, icon: Package },
    { label: "Total Variants", value: stats.variants, icon: Layers },
    { label: "Available Products", value: stats.available, icon: CircleCheck },
    { label: "Vendors", value: stats.vendors, icon: Building2 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-xl border border-line bg-surface px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">{label}</p>
            <Icon className="h-4 w-4 text-ink-faint" aria-hidden="true" />
          </div>
          <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-ink">{formatNumber(value)}</p>
        </div>
      ))}
    </div>
  );
}
