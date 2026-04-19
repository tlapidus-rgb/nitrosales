// @ts-nocheck
"use client";

/**
 * /unauthorized — Fase 7 QA enforcement
 * ─────────────────────────────────────────────────────────────
 * Pagina a la que se redirige cuando un user no tiene permiso para
 * acceder a la seccion. Fetches /api/me/permissions para:
 *   - Mostrar el rol actual (base + custom) sin redirigir a Team.
 *   - Calcular la primera seccion accesible y usarla como destino
 *     del boton "Ir a mi inicio" (evita loops infinitos cuando /
 *     redirige a /dashboard y el user no tiene acceso a eso).
 */

import React, { useEffect, useState } from "react";
import { ShieldAlert, ArrowRight, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

type AccessLevel = "none" | "read" | "write" | "admin";
type Role = "OWNER" | "ADMIN" | "MEMBER";

interface PermissionsData {
  authenticated: boolean;
  role: Role | null;
  customRoleId: string | null;
  permissions: Record<string, AccessLevel>;
  sections: Array<{ key: string; label: string; category: string }>;
}

// Orden de preferencia para el destino "inicio". Las secciones al
// principio de esta lista son mas "home" que las de config.
const HOME_PRIORITY: Array<{ key: string; href: string }> = [
  { key: "pulso", href: "/finanzas/pulso" },
  { key: "dashboard", href: "/dashboard" },
  { key: "estado", href: "/finanzas/estado" },
  { key: "fiscal", href: "/finanzas/fiscal" },
  { key: "costos", href: "/finanzas/costos" },
  { key: "escenarios", href: "/finanzas/escenarios" },
  { key: "rentabilidad", href: "/rentabilidad" },
  { key: "orders", href: "/orders" },
  { key: "products", href: "/products" },
  { key: "mercadolibre", href: "/mercadolibre" },
  { key: "campaigns", href: "/campaigns" },
  { key: "bondly", href: "/bondly/overview" },
  { key: "aura", href: "/aura/inicio" },
  { key: "competencia", href: "/competitors" },
  { key: "alertas", href: "/alertas" },
  { key: "seo", href: "/seo" },
  { key: "aurum", href: "/chat" },
  { key: "nitropixel", href: "/nitropixel" },
  { key: "pixel", href: "/pixel" },
  { key: "sinapsis", href: "/sinapsis" },
  { key: "boveda", href: "/boveda" },
  { key: "memory", href: "/memory" },
  { key: "settings_org", href: "/settings/organizacion" },
];

export default function UnauthorizedPage() {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me/permissions", { cache: "no-store" });
        const json = await res.json();
        setData(json);
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Calcular primera seccion accesible
  const firstAccessible = data?.permissions
    ? HOME_PRIORITY.find(({ key }) => {
        const level = data.permissions[key];
        return level && level !== "none";
      })
    : null;

  const roleLabel = data?.role
    ? { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Editor" }[data.role]
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 0%, rgba(245,158,11,0.08) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              background: "rgba(245,158,11,0.10)",
              color: "#d97706",
              border: "1px solid rgba(245,158,11,0.25)",
            }}
          >
            <ShieldAlert className="h-6 w-6" />
          </div>

          <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">
            Acceso denegado
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Tu rol no tiene permisos para ver esta sección. Si creés que es un
            error, hablá con el Owner de la organización para que te actualice
            los permisos.
          </p>

          {/* Rol actual (visible aunque no sea Admin) */}
          {!loading && roleLabel && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Tu rol actual
              </div>
              <div className="mt-1 font-semibold text-slate-700">
                {roleLabel}
                {data?.customRoleId && (
                  <span className="ml-2 text-[10px] font-normal text-violet-600">
                    con rol custom asignado
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            {firstAccessible ? (
              <a
                href={firstAccessible.href}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Ir a mi inicio
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <div className="text-[11px] text-slate-500">
                Tu rol no tiene acceso a ninguna sección todavía. Pedile al
                Owner que te configure permisos.
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
