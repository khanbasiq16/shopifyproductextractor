/** Display formatting helpers (client side). */

const moneyCache = new Map();

export function formatMoney(value, currency) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const key = currency || "__none__";
  if (!moneyCache.has(key)) {
    let fmt;
    try {
      fmt = currency
        ? new Intl.NumberFormat("en-US", { style: "currency", currency })
        : new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    moneyCache.set(key, fmt);
  }
  return moneyCache.get(key).format(value);
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

export function formatDateTime(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function todayStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const AVAILABILITY_LABEL = {
  available: "Available",
  partial: "Partially available",
  sold_out: "Sold out",
  unknown: "Unknown",
};
