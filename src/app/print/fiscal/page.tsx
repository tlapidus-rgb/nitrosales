// @ts-nocheck
"use client";

/**
 * /print/fiscal — Fase 6g
 * ─────────────────────────────────────────────────────────────
 * Vista printable del calendario fiscal. Se abre en nueva tab,
 * auto-dispara window.print() y el usuario guarda como PDF.
 *
 * Sin dependencias externas (jspdf, puppeteer). Fuera del route
 * group (app) asi no hereda sidebar.
 *
 * Incluye:
 *   - Portada con regimen + provincia + fecha generacion
 *   - Resumen mensual (vencimientos por mes)
 *   - Tabla completa 12m agrupada por mes
 *   - Footer con URL original + firma NitroSales
 */

import React, { useEffect, useMemo, useState } from "react";

type ExpandedObligation = {
  defaultKey: string;
  name: string;
  category:
    | "MONOTRIBUTO"
    | "IVA"
    | "IIBB"
    | "GANANCIAS"
    | "PERCEPCION_ML"
    | "CUSTOM";
  frequency: string;
  dueDate: string;
  dueDay: number;
  amount: number | null;
  amountSource: string;
  note?: string;
  isInformative: boolean;
};

const CATEGORY_COLOR: Record<ExpandedObligation["category"], string> = {
  MONOTRIBUTO: "#10b981",
  IVA: "#0ea5e9",
  IIBB: "#8b5cf6",
  GANANCIAS: "#f59e0b",
  PERCEPCION_ML: "#f43f5e",
  CUSTOM: "#64748b",
};

const CATEGORY_LABEL: Record<ExpandedObligation["category"], string> = {
  MONOTRIBUTO: "Monotributo",
  IVA: "IVA",
  IIBB: "IIBB",
  GANANCIAS: "Ganancias",
  PERCEPCION_ML: "Ret. ML",
  CUSTOM: "Custom",
};

function fmtARS(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PrintFiscalPage() {
  const [obligations, setObligations] = useState<ExpandedObligation[] | null>(
    null
  );
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/finance/fiscal/calendar?monthsAhead=12");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setObligations(json.obligations ?? []);
        setProfile(json.profile ?? null);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!obligations || error) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* noop */
      }
    }, 650);
    return () => clearTimeout(t);
  }, [obligations, error]);

  const byMonth = useMemo(() => {
    if (!obligations) return [];
    const acc = new Map<string, ExpandedObligation[]>();
    for (const o of obligations) {
      if (o.isInformative) continue;
      const key = o.dueDate.slice(0, 7);
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key)!.push(o);
    }
    return Array.from(acc.entries())
      .map(([month, items]) => ({
        month,
        items: items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        total: items.reduce((s, o) => s + (o.amount ?? 0), 0),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [obligations]);

  if (error) {
    return (
      <div className="min-h-screen bg-white p-10">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <div className="font-semibold">Error</div>
          <div className="mt-1 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!obligations) {
    return (
      <div className="min-h-screen bg-white p-10 text-slate-500">
        Cargando calendario fiscal…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-white p-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <div className="font-semibold">Sin perfil fiscal</div>
          <div className="mt-1 text-sm">
            Configurá tu régimen en <code>/finanzas/costos</code> para generar
            el calendario.
          </div>
        </div>
      </div>
    );
  }

  const regimeLabel =
    profile.taxRegime === "MONOTRIBUTO"
      ? `Monotributo cat. ${profile.monotributoCategory ?? "—"}`
      : "Responsable Inscripto";

  const today = new Date().toLocaleString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const totalEstimated = obligations
    .filter((o) => !o.isInformative && o.amount)
    .reduce((s, o) => s + (o.amount ?? 0), 0);

  return (
    <div className="print-root min-h-screen bg-white p-10 text-slate-900">
      {/* Barra fixed solo en pantalla */}
      <div className="no-print fixed top-3 right-3 z-50 flex items-center gap-2">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          Imprimir / PDF
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cerrar
        </button>
      </div>

      {/* Portada */}
      <header
        className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-white p-8"
        style={{
          background:
            "radial-gradient(ellipse at 85% 0%, rgba(16,185,129,0.06) 0%, transparent 55%)",
        }}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Calendario fiscal · NitroSales
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
          {regimeLabel}
        </h1>
        {profile.province && (
          <div className="mt-1 text-sm text-slate-600">
            Provincia: {profile.province.replace(/_/g, " ")}
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Generado
            </div>
            <div className="mt-0.5 font-semibold tabular-nums">{today}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Horizonte
            </div>
            <div className="mt-0.5 font-semibold tabular-nums">12 meses</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Obligaciones estimadas
            </div>
            <div className="mt-0.5 font-semibold tabular-nums">
              {fmtARS(totalEstimated)}
            </div>
          </div>
        </div>
      </header>

      {/* Tabla por mes */}
      <main className="mt-8 space-y-6">
        {byMonth.map(({ month, items, total }) => {
          const monthLabel = new Date(
            month + "-01T00:00:00"
          ).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
          return (
            <section
              key={month}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
              style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3">
                <h2 className="text-sm font-semibold capitalize tracking-tight text-slate-900">
                  {monthLabel}
                </h2>
                <div className="text-xs tabular-nums text-slate-600">
                  {items.length} vencimiento{items.length !== 1 ? "s" : ""}
                  {total > 0 ? ` · ${fmtARS(total)}` : ""}
                </div>
              </div>
              <table className="w-full text-[12px]">
                <thead className="border-b border-slate-100 bg-slate-50/50 text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Obligación</th>
                    <th className="px-4 py-2">Categoría</th>
                    <th className="px-4 py-2 text-right">Monto</th>
                    <th className="px-4 py-2">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((o, idx) => (
                    <tr key={`${o.defaultKey}-${idx}`}>
                      <td className="px-4 py-2 font-semibold tabular-nums text-slate-900">
                        {fmtDate(o.dueDate)}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{o.name}</td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                          style={{
                            background: `${CATEGORY_COLOR[o.category]}18`,
                            color: CATEGORY_COLOR[o.category],
                          }}
                        >
                          {CATEGORY_LABEL[o.category]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                        {o.amount ? fmtARS(o.amount) : "A calcular"}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">
                        {o.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </main>

      <footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] text-slate-400">
        <div className="flex items-center justify-between">
          <div>Generado por NitroSales · nitrosales.vercel.app/finanzas/fiscal</div>
          <div>Fuente de datos: fiscalProfile + fiscal-calendar.ts</div>
        </div>
      </footer>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-root {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
