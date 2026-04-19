// @ts-nocheck
"use client";

/**
 * /settings/layout — Fase 7b
 * ─────────────────────────────────────────────────────────────
 * Layout del modulo Configuracion con sidebar de tabs premium a la
 * izquierda + content a la derecha. 6 sub-pages:
 *
 *   Productivas:
 *     /settings/organizacion  (7c)
 *     /settings/team          (7d)
 *     /settings/integraciones (7e)
 *
 *   Placeholders visibles (7f):
 *     /settings/billing
 *     /settings/seguridad
 *     /settings/api-keys
 *
 * Cada tab con icon lucide + accent color consistente con UI_VISION.
 * Active indicator con dot coloreado + background highlight.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Users,
  Plug,
  CreditCard,
  ShieldCheck,
  KeyRound,
  Settings as SettingsIcon,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

type TabKind = "productive" | "placeholder";

interface TabDef {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  accent: string;
  kind: TabKind;
}

const TABS: TabDef[] = [
  {
    href: "/settings/organizacion",
    label: "Organización",
    description: "Nombre, logo, dominio",
    icon: Building2,
    accent: "#0ea5e9",
    kind: "productive",
  },
  {
    href: "/settings/team",
    label: "Team & Permisos",
    description: "Miembros y roles",
    icon: Users,
    accent: "#8b5cf6",
    kind: "productive",
  },
  {
    href: "/settings/integraciones",
    label: "Integraciones",
    description: "VTEX · MELI · Ads · GSC · GA4",
    icon: Plug,
    accent: "#10b981",
    kind: "productive",
  },
  {
    href: "/settings/billing",
    label: "Billing",
    description: "Plan y facturación",
    icon: CreditCard,
    accent: "#f59e0b",
    kind: "placeholder",
  },
  {
    href: "/settings/seguridad",
    label: "Seguridad",
    description: "Password y logs de acceso",
    icon: ShieldCheck,
    accent: "#ef4444",
    kind: "productive",
  },
  {
    href: "/settings/api-keys",
    label: "API Keys",
    description: "Tokens para integraciones",
    icon: KeyRound,
    accent: "#64748b",
    kind: "productive",
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="relative">
      {/* Header comun */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white mb-6 p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 85% 0%, rgba(14,165,233,0.06) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(139,92,246,0.04) 0%, transparent 55%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(14,165,233,0.3) 25%, rgba(139,92,246,0.3) 50%, rgba(16,185,129,0.3) 75%, transparent 100%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "rgba(14,165,233,0.06)",
              border: "1px solid rgba(14,165,233,0.22)",
              color: "#0ea5e9",
            }}
          >
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
              Configuración
            </h1>
            <p className="text-[13px] text-slate-500">
              Tu organización, equipo, integraciones y más.
            </p>
          </div>
        </div>
      </div>

      {/* Grid: sidebar tabs + content */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        {/* Sidebar tabs */}
        <aside className="space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="group relative flex items-start gap-3 rounded-xl border px-3 py-2.5 transition"
                style={{
                  borderColor: isActive
                    ? `${tab.accent}40`
                    : "rgba(226,232,240,0.8)",
                  background: isActive ? `${tab.accent}0a` : "white",
                  transition: `all 160ms ${ES}`,
                  boxShadow: isActive
                    ? `0 1px 2px ${tab.accent}14, 0 4px 12px ${tab.accent}08`
                    : "0 1px 2px rgba(15,23,42,0.03)",
                }}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full"
                    style={{ background: tab.accent }}
                  />
                )}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: isActive
                      ? `${tab.accent}15`
                      : "rgba(241,245,249,0.7)",
                    color: isActive ? tab.accent : "#64748b",
                    transition: `all 160ms ${ES}`,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[13px] font-semibold tracking-tight"
                      style={{
                        color: isActive ? "#0f172a" : "#334155",
                      }}
                    >
                      {tab.label}
                    </span>
                    {tab.kind === "placeholder" && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em]"
                        style={{
                          background: "rgba(148,163,184,0.12)",
                          color: "#64748b",
                        }}
                      >
                        Pronto
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                    {tab.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </aside>

        {/* Content */}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
