import { AVAILABILITY_LABEL } from "@/lib/format";

const STYLES = {
  available: "bg-brand-soft text-brand-strong",
  partial: "bg-amber-50 text-amber-800",
  sold_out: "bg-red-50 text-red-700",
  unknown: "bg-canvas text-ink-soft",
};

export default function AvailabilityBadge({ value }) {
  const key = STYLES[value] ? value : "unknown";
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[key]}`}>
      {AVAILABILITY_LABEL[key]}
    </span>
  );
}
