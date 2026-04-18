"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";

/* ══════════════════════════════════════════════
   EXPORT MENU — dropdown con PDF / Excel.
   Fase 2e — exporta el P&L Estado de Resultados.
   ══════════════════════════════════════════════ */

export type ExportMenuProps = {
  onPDF: () => void;
  onExcel: () => Promise<void> | void;
  disabled?: boolean;
};

export default function ExportMenu({ onPDF, onExcel, disabled = false }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click afuera o ESC → cerrar.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handlePDF = () => {
    setOpen(false);
    // Pequeño delay para que el menu desaparezca antes del print preview del browser.
    setTimeout(() => onPDF(), 120);
  };

  const handleExcel = async () => {
    setOpen(false);
    setBusy(true);
    try {
      await onExcel();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Exportar P&L"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{busy ? "Generando…" : "Exportar"}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-52 z-30 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden"
          style={{ boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(15, 23, 42, 0.04)" }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handlePDF}
            className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition"
          >
            <FileText className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-slate-700">PDF</p>
              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                Imprimir o guardar como PDF
              </p>
            </div>
          </button>

          <div className="border-t border-slate-100" />

          <button
            type="button"
            role="menuitem"
            onClick={handleExcel}
            disabled={busy}
            className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-slate-700">Excel (.xlsx)</p>
              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                P&L + composición + costos manuales
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
