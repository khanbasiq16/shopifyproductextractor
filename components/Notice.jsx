import { AlertCircle, AlertTriangle, X } from "lucide-react";

const TONES = {
  error: {
    wrap: "border-red-200 bg-red-50 text-red-800",
    icon: AlertCircle,
  },
  warning: {
    wrap: "border-amber-200 bg-amber-50 text-amber-900",
    icon: AlertTriangle,
  },
};

export default function Notice({ tone = "error", title, children, onDismiss }) {
  const { wrap, icon: Icon } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl border px-4 py-3.5 ${wrap}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 h-7 w-7 shrink-0 rounded-md p-1 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
