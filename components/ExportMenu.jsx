"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, FileText, FileSpreadsheet, Loader2, CircleCheck } from "lucide-react";
import { exportProducts } from "@/lib/export";
import { formatNumber } from "@/lib/format";

export default function ExportMenu({ products, hostname }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | preparing | ready | failed
  const wrapRef = useRef(null);
  const resetTimer = useRef(null);

  const variantRows = products.reduce((sum, p) => sum + Math.max(p.variants.length, 1), 0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  function run(format) {
    setOpen(false);
    setStatus("preparing");
    clearTimeout(resetTimer.current);
    // Let the "Preparing export..." state paint before the synchronous build.
    setTimeout(() => {
      try {
        exportProducts(format, products, hostname);
        setStatus("ready");
      } catch (err) {
        console.error(err);
        setStatus("failed");
      }
      resetTimer.current = setTimeout(() => setStatus("idle"), 3000);
    }, 50);
  }

  const busy = status === "preparing";

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm sm:inline" aria-live="polite">
        {status === "preparing" && <span className="text-ink-soft">Preparing export...</span>}
        {status === "ready" && (
          <span className="inline-flex items-center gap-1 text-brand">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            Export ready
          </span>
        )}
        {status === "failed" && <span className="text-red-600">Export failed. Please try again.</span>}
      </span>

      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={busy || !products.length}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          Export
          <ChevronDown className="h-4 w-4 opacity-80" aria-hidden="true" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-lg shadow-black/5"
          >
            <p className="border-b border-line px-4 py-2.5 text-xs text-ink-faint">
              All {formatNumber(products.length)} products, one row per variant ({formatNumber(variantRows)} rows)
            </p>
            <MenuItem icon={FileText} title="Export CSV" hint="Comma-separated, UTF-8" onClick={() => run("csv")} />
            <MenuItem
              icon={FileSpreadsheet}
              title="Export Excel"
              hint="Variants and Products sheets (.xlsx)"
              onClick={() => run("xlsx")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, title, hint, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas focus:bg-canvas focus:outline-none"
    >
      <Icon className="mt-0.5 h-4.5 w-4.5 text-brand" aria-hidden="true" />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-faint">{hint}</span>
      </span>
    </button>
  );
}
