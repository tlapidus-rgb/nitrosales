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
  kind: TabKind;
}

const TABS: TabDef[] = [
  {
    href: "/settings/organizacion",
    label: "Organización",
    description: "Nombre, logo, dominio",
    icon: Building2,
    kind: "productive",
  },
  {
    href: "/settings/team",
    label: "Team & Permisos",
    description: "Miembros y roles",
    icon: Users,
    kind: "productive",
  },
  {
    href: "/settings/integraciones",
    label: "Integraciones",
    description: "VTEX · MELI · Ads · GSC · GA4",
    icon: Plug,
    kind: "productive",
  },
  {
    href: "/settings/billing",
    label: "Billing",
    description: "Plan y facturación",
    icon: CreditCard,
    kind: "placeholder",
  },
  {
    href: "/settings/seguridad",
    label: "Seguridad",
    description: "Password y logs de acceso",
    icon: ShieldCheck,
    kind: "productive",
  },
  {
    href: "/settings/api-keys",
    label: "API Keys",
    description: "Tokens para integraciones",
    icon: KeyRound,
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
      <div className="relative overflow-hidden rounded-2xl border border-hairline bg-elevated mb-6 p-6">
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-surface text-ink">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">
              Configuración
            </h1>
            <p className="text-[13px] text-ink-60">
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
                className={`group relative flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                  isActive
                    ? "border-hairline bg-ink/5"
                    : "border-transparent bg-transparent hover:bg-ink/[0.03]"
                }`}
                style={{ transition: `all 160ms ${ES}` }}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-ink/40"
                  />
                )}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isActive ? "bg-ink/10 text-ink" : "bg-surface text-ink-60"
                  }`}
                  style={{ transition: `all 160ms ${ES}` }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[13px] font-semibold tracking-tight ${
                        isActive ? "text-ink" : "text-ink-60"
                      }`}
                    >
                      {tab.label}
                    </span>
                    {tab.kind === "placeholder" && (
                      <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-ink-60">
                        Pronto
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-40 truncate">
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
