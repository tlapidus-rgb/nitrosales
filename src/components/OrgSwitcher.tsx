"use client";

// ══════════════════════════════════════════════════════════════
// OrgSwitcher — Selector de cliente en sidebar (S60 EXT-2 BIS)
// ══════════════════════════════════════════════════════════════
// Dropdown sticky arriba del sidebar para que admin (Tomy) cambie
// rapidamente entre orgs sin tener que ir a /control/onboardings.
//
// Comportamiento:
//  - Solo se renderiza si user es internal admin (chequea via session).
//  - Muestra el nombre de la org actual (real o viewing).
//  - Click → popup con lista de todas las orgs.
//  - Seleccionar otra → POST /api/admin/view-as-org → reload.
//  - Si esta viendo una org distinta a la propia, "Volver a mi cuenta"
//    al principio.
// ══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, Building2, Check, ArrowLeft } from "lucide-react";

type Org = { id: string; name: string; slug: string };

export function OrgSwitcher() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.isInternalUser === true;
  const viewingAsOrgId = (session?.user as any)?.viewingAsOrg as string | undefined;
  const realOrgId = (session?.user as any)?.realOrganizationId as string | undefined;
  const realOrgName = (session?.user as any)?.realOrganizationName as string | undefined;
  const orgName = (session?.user as any)?.organizationName as string | undefined;
  const currentOrgId = viewingAsOrgId || (session?.user as any)?.organizationId;

  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cargar lista de orgs al abrir
  useEffect(() => {
    if (!open || orgs.length > 0 || !isAdmin) return;
    setLoading(true);
    fetch("/api/admin/orgs-list")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setOrgs(data.orgs || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, orgs.length, isAdmin]);

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!isAdmin) return null;

  const switchTo = async (orgId: string | null) => {
    if (switching) return;
    setSwitching(true);
    try {
      if (orgId === null || orgId === realOrgId) {
        // Salir del view-as
        await fetch("/api/admin/view-as-org", { method: "DELETE" });
      } else {
        await fetch("/api/admin/view-as-org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId }),
        });
      }
      window.location.href = "/";
    } catch {
      setSwitching(false);
    }
  };

  const displayName = orgName || realOrgName || "Cuenta";
  const isViewing = !!viewingAsOrgId && viewingAsOrgId !== realOrgId;

  // Build initial letter avatar
  const initial = (displayName || "?").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative px-3 pt-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors ${
          isViewing
            ? "bg-blue-50 border-blue-200 hover:bg-blue-100"
            : "bg-white border-gray-200 hover:border-gray-300"
        } ${switching ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold ${
              isViewing ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {initial}
          </span>
          <div className="min-w-0 text-left">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 leading-none mb-0.5">
              {isViewing ? "Viendo como" : "Cuenta"}
            </div>
            <div className="text-xs font-semibold text-gray-900 truncate">{displayName}</div>
          </div>
        </div>
        <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-3 right-3 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto py-1">
          {/* Volver a mi cuenta — solo si esta viewing una org distinta */}
          {isViewing && (
            <>
              <button
                type="button"
                onClick={() => switchTo(null)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 transition-colors text-blue-600"
              >
                <ArrowLeft size={14} />
                <span className="font-medium">Volver a {realOrgName || "mi cuenta"}</span>
              </button>
              <div className="border-t border-gray-100 my-1" />
            </>
          )}

          {/* Loading */}
          {loading && (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">Cargando…</div>
          )}

          {/* Lista de orgs */}
          {!loading && orgs.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                Cambiar a cliente
              </div>
              {orgs.map((org) => {
                const isCurrent = org.id === currentOrgId;
                const isReal = org.id === realOrgId;
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => !isCurrent && switchTo(org.id)}
                    disabled={isCurrent}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                      isCurrent
                        ? "bg-gray-50 text-gray-400 cursor-default"
                        : "hover:bg-gray-50 text-gray-700 cursor-pointer"
                    }`}
                  >
                    <span className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-gray-600">
                      {(org.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 text-left truncate">{org.name}</span>
                    {isReal && (
                      <span className="text-[9px] uppercase tracking-wide text-blue-500 font-semibold">tuya</span>
                    )}
                    {isCurrent && <Check size={12} className="text-emerald-500" />}
                  </button>
                );
              })}
            </>
          )}

          {!loading && orgs.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">Sin orgs disponibles</div>
          )}
        </div>
      )}
    </div>
  );
}
