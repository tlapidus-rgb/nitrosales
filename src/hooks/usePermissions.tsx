// ═══════════════════════════════════════════════════════════════════
// usePermissions — Fase 7 QA enforcement
// ═══════════════════════════════════════════════════════════════════
// Context + hook para consumir permisos del user logueado desde
// cualquier componente. Fetches /api/me/permissions una sola vez por
// sesion (cacheado en context).
//
// Uso:
//   const { canAccess, loading, role } = usePermissions();
//   if (!canAccess("finanzas_pulso", "read")) return null;
//
// O componente declarativo:
//   <PermissionGate section="settings_billing" level="read">
//     <Link href="/settings/billing">Billing</Link>
//   </PermissionGate>
// ═══════════════════════════════════════════════════════════════════

"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type AccessLevel = "none" | "read" | "write" | "admin";
type Section = string;

interface PermissionsData {
  authenticated: boolean;
  role: Role | null;
  customRoleId: string | null;
  permissions: Record<Section, AccessLevel>;
  loading: boolean;
  canAccess: (section: Section, level?: AccessLevel) => boolean;
  refresh: () => void;
}

const LEVEL_ORDER: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

const PermissionsContext = createContext<PermissionsData>({
  authenticated: false,
  role: null,
  customRoleId: null,
  permissions: {},
  loading: true,
  canAccess: () => false,
  refresh: () => {},
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<{
    authenticated: boolean;
    role: Role | null;
    customRoleId: string | null;
    permissions: Record<Section, AccessLevel>;
  }>({
    authenticated: false,
    role: null,
    customRoleId: null,
    permissions: {},
  });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/me/permissions", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (active) {
          setData({
            authenticated: json.authenticated ?? false,
            role: json.role ?? null,
            customRoleId: json.customRoleId ?? null,
            permissions: json.permissions ?? {},
          });
        }
      } catch {
        // Silent fail — en caso de error asumimos "sin permisos"
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tick]);

  const canAccess = (section: Section, level: AccessLevel = "read"): boolean => {
    // Si todavia no cargaron, devolver TRUE para evitar flash de "sin acceso"
    // en la carga inicial. La UI real se va a filtrar cuando llegue la data.
    if (loading) return true;
    if (!data.authenticated) return false;
    const userLevel = data.permissions[section] ?? "none";
    return LEVEL_ORDER[userLevel] >= LEVEL_ORDER[level];
  };

  const refresh = () => setTick((t) => t + 1);

  return (
    <PermissionsContext.Provider
      value={{ ...data, loading, canAccess, refresh }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

export function PermissionGate({
  section,
  level = "read",
  children,
  fallback = null,
}: {
  section: Section;
  level?: AccessLevel;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { canAccess } = usePermissions();
  return canAccess(section, level) ? <>{children}</> : <>{fallback}</>;
}

// ─────────────────────────────────────────────────────────────
// Mapping href -> section key (para sidebar nav)
// ─────────────────────────────────────────────────────────────
export function hrefToSection(href: string): Section | null {
  if (href.startsWith("/finanzas/pulso")) return "pulso";
  if (href.startsWith("/finanzas/estado")) return "estado";
  if (href.startsWith("/finanzas/costos")) return "costos";
  if (href.startsWith("/finanzas/escenarios")) return "escenarios";
  if (href.startsWith("/finanzas/fiscal")) return "fiscal";
  if (href.startsWith("/orders")) return "orders";
  if (href.startsWith("/products")) return "products";
  if (href.startsWith("/mercadolibre")) return "mercadolibre";
  if (href.startsWith("/campaigns")) return "campaigns";
  if (href.startsWith("/bondly")) return "bondly";
  if (href.startsWith("/aura")) return "aura";
  if (href.startsWith("/competitors")) return "competencia";
  if (href.startsWith("/alertas")) return "alertas";
  if (href === "/settings" || href.startsWith("/settings/organizacion")) return "settings_org";
  if (href.startsWith("/settings/team")) return "settings_team";
  if (href.startsWith("/settings/integraciones")) return "settings_integrations";
  if (href.startsWith("/settings/billing")) return "settings_billing";
  if (href.startsWith("/settings/seguridad")) return "settings_security";
  if (href.startsWith("/settings/api-keys")) return "settings_api_keys";
  // /nitropixel, /chat, /dashboard, /sinapsis, /boveda, /pixel, /seo,
  // /rentabilidad, /memory -> no mapeadas, siempre visibles.
  return null;
}

/**
 * Wrapper para NavItems de sidebar: si tiene section mapeada y no
 * hay permiso `read`, no renderiza. Si section es null (item publico
 * o no mapeado todavia), renderiza siempre.
 */
export function NavItemGate({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const { canAccess } = usePermissions();
  const section = hrefToSection(href);
  if (section === null) return <>{children}</>;
  return canAccess(section, "read") ? <>{children}</> : null;
}
