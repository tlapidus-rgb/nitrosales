// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/section-overrides
// ══════════════════════════════════════════════════════════════
// Panel admin para activar/poner-en-mantenimiento secciones
// globalmente o por organización.
//
// Layout:
//   - Tabla: filas = secciones, columnas = orgs
//   - Primera columna: GLOBAL (override default para todas)
//   - Click en una celda → toggle ACTIVE / MAINTENANCE / (sin override)
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Wrench, Minus, Loader2 } from "lucide-react";

interface Section { key: string; label: string; path: string; }
interface Org { id: string; name: string; slug: string; overrides: Record<string, "ACTIVE" | "MAINTENANCE">; }

type Status = "ACTIVE" | "MAINTENANCE" | null;

const STATUS_CYCLE: Record<string, Status> = {
  "null": "ACTIVE",
  "ACTIVE": "MAINTENANCE",
  "MAINTENANCE": null,
};

export default function SectionOverridesPage() {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [globalOverrides, setGlobalOverrides] = useState<Record<string, Status>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/section-overrides").then((x) => x.json());
      if (r?.ok) {
        setSections(r.sections || []);
        setOrgs(r.orgs || []);
        setGlobalOverrides(r.globalOverrides || {});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cycleCell = async (scope: "GLOBAL" | "ORG", sectionKey: string, orgId?: string) => {
    const cellKey = `${scope}-${orgId || "global"}-${sectionKey}`;
    setSavingCell(cellKey);
    try {
      // Calcular siguiente status
      const current: Status = scope === "GLOBAL"
        ? globalOverrides[sectionKey] || null
        : (orgs.find((o) => o.id === orgId)?.overrides?.[sectionKey] as Status) || null;
      const next = STATUS_CYCLE[String(current)];

      const body: any = { scope, sectionKey, status: next };
      if (scope === "ORG") body.orgId = orgId;

      await fetch("/api/admin/section-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Update local state
      if (scope === "GLOBAL") {
        setGlobalOverrides((prev) => {
          const cp = { ...prev };
          if (next === null) delete cp[sectionKey];
          else cp[sectionKey] = next;
          return cp;
        });
      } else {
        setOrgs((prev) =>
          prev.map((o) => {
            if (o.id !== orgId) return o;
            const cp = { ...o.overrides };
            if (next === null) delete cp[sectionKey];
            else cp[sectionKey] = next;
            return { ...o, overrides: cp };
          })
        );
      }
    } finally {
      setSavingCell(null);
    }
  };

  const renderCell = (status: Status, isSaving: boolean, onClick: () => void) => {
    let bg = "bg-slate-100 hover:bg-slate-200";
    let icon: any = <Minus className="h-4 w-4 text-slate-400" />;
    let label = "Sin override";

    if (status === "ACTIVE") {
      bg = "bg-emerald-100 hover:bg-emerald-200";
      icon = <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      label = "Activa";
    } else if (status === "MAINTENANCE") {
      bg = "bg-amber-100 hover:bg-amber-200";
      icon = <Wrench className="h-4 w-4 text-amber-600" />;
      label = "Mantenimiento";
    }

    return (
      <button
        type="button"
        disabled={isSaving}
        onClick={onClick}
        className={`flex items-center gap-1.5 rounded-lg ${bg} px-2 py-1.5 text-[10px] font-medium text-slate-700 transition w-full justify-center disabled:opacity-50`}
        title={`${label} (click para cambiar)`}
      >
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <Link href="/control" className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver al panel
      </Link>

      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-900 mb-1">Bloqueo de secciones</h1>
        <p className="text-[13px] text-slate-600">
          Controlá qué secciones ven los clientes. Click en una celda para ciclar entre los 3 estados.
        </p>

        {/* Leyenda explicativa expandida */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Minus className="h-4 w-4 text-slate-400" />
              <strong className="text-[12px] text-slate-900">Sin override</strong>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              <strong>Modo automático.</strong> El sistema decide solo según las integraciones
              del cliente. Si falta Meta → bloquea Campañas Meta. Si Meta está conectado → la deja activa. Es el default.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <strong className="text-[12px] text-emerald-900">Activa (forzada)</strong>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              <strong>Siempre visible</strong>, aunque falte la integración.
              Caso raro. La sección se ve aunque no tenga datos.
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-amber-600" />
              <strong className="text-[12px] text-amber-900">Mantenimiento</strong>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              <strong>Nunca visible</strong>: cliente ve cartel "en mantenimiento".
              Útil para secciones que estás puliendo y no querés mostrar todavía.
            </p>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-slate-500">
          <strong>Override por org tiene prioridad sobre global.</strong> Si poneś Aura globalmente
          en Mantenimiento pero EMDJ en Activa, EMDJ la ve activa y los demás bloqueada.
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando…
        </div>
      )}

      {!loading && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-3 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[200px]">
                  Sección
                </th>
                <th className="text-center px-3 py-3 font-semibold text-blue-700 min-w-[140px] border-l border-slate-200 bg-blue-50">
                  GLOBAL
                </th>
                {orgs.map((org) => (
                  <th key={org.id} className="text-center px-3 py-3 font-semibold text-slate-700 min-w-[140px] border-l border-slate-200">
                    <div className="truncate" title={org.name}>{org.name}</div>
                    <div className="text-[9px] font-normal text-slate-500 truncate">{org.slug}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((s, idx) => (
                <tr key={s.key} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="px-3 py-2 sticky left-0 bg-inherit">
                    <div className="font-semibold text-slate-900">{s.label}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{s.path}</div>
                  </td>
                  <td className="px-2 py-2 border-l border-slate-200 bg-blue-50/30">
                    {renderCell(
                      globalOverrides[s.key] || null,
                      savingCell === `GLOBAL-global-${s.key}`,
                      () => cycleCell("GLOBAL", s.key)
                    )}
                  </td>
                  {orgs.map((org) => (
                    <td key={org.id} className="px-2 py-2 border-l border-slate-200">
                      {renderCell(
                        (org.overrides?.[s.key] as Status) || null,
                        savingCell === `ORG-${org.id}-${s.key}`,
                        () => cycleCell("ORG", s.key, org.id)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-[11px] text-slate-500 leading-relaxed">
        <strong>Cómo funciona:</strong> Sin override → la sección sigue el comportamiento automático
        (bloqueada si falta integración). <strong>Activa</strong> → la fuerza activa aunque falte
        integración. <strong>Mantenimiento</strong> → la oculta con cartel "en mantenimiento" sin
        importar el estado de las integraciones. <strong>Override por org tiene prioridad sobre global.</strong>
      </div>
    </div>
  );
}
