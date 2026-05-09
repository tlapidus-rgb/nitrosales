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
  if (href.startsWith("/rentabilidad")) return "rentabilidad";
  if (href.startsWith("/orders")) return "orders";
  if (href.startsWith("/products")) return "products";
  if (href.startsWith("/mercadolibre")) return "mercadolibre";
  if (href.startsWith("/campaigns")) return "campaigns";
  if (href.startsWith("/bondly")) return "bondly";
  if (href.startsWith("/aura")) return "aura";
  if (href.startsWith("/competitors")) return "competencia";
  if (href.startsWith("/alertas")) return "alertas";
  if (href.startsWith("/seo")) return "seo";
  if (href.startsWith("/nitropixel")) return "nitropixel";
  if (href.startsWith("/pixel")) return "pixel";
  if (href.startsWith("/dashboard")) return "dashboard";
  if (href.startsWith("/chat")) return "aurum";
  if (href.startsWith("/sinapsis")) return "sinapsis";
  if (href.startsWith("/boveda")) return "boveda";
  if (href.startsWith("/memory")) return "memory";
  if (href === "/settings" || href.startsWith("/settings/organizacion")) return "settings_org";
  if (href.startsWith("/settings/team")) return "settings_team";
  if (href.startsWith("/settings/integraciones")) return "settings_integrations";
  if (href.startsWith("/settings/billing")) return "settings_billing";
  if (href.startsWith("/settings/seguridad")) return "settings_security";
  if (href.startsWith("/settings/api-keys")) return "settings_api_keys";
  // /login, /accept-invite, /unauthorized, etc. -> publicas
  return null;
}

/**
 * Hook de guard para paginas: si el user logueado no tiene permiso,
 * redirige a /unauthorized.
 */
export function useRequirePermission(
  section: Section,
  level: AccessLevel = "read"
): { loading: boolean; allowed: boolean } {
  const { canAccess, loading, authenticated } = usePermissions();
  const [allowed, setAllowed] = React.useState(true);

  React.useEffect(() => {
    if (loading) return;
    if (!authenticated) return;
    const ok = canAccess(section, level);
    setAllowed(ok);
    if (!ok && typeof window !== "undefined") {
      window.location.href = "/unauthorized";
    }
  }, [loading, authenticated, section, level, canAccess]);

  return { loading, allowed };
}

/**
 * Guard automatico por ruta: derivado del pathname via hrefToSection.
 * Montarlo una sola vez en el layout de (app) para que proteja
 * TODAS las paginas automaticamente sin tocar cada una.
 */
export function PathnameGuard({
  pathname,
  children,
}: {
  pathname: string;
  children: React.ReactNode;
}) {
  const { canAccess, loading, authenticated } = usePermissions();

  React.useEffect(() => {
    if (loading || !authenticated) return;
    const section = hrefToSection(pathname);
    if (section === null) return; // pagina publica dentro de (app)
    const ok = canAccess(section, "read");
    if (!ok && typeof window !== "undefined") {
      window.location.href = "/unauthorized";
    }
  }, [pathname, loading, authenticated, canAccess]);

  return <>{children}</>;
}

/**
 * Wrapper para NavItems de sidebar: si tiene section mapeada y no
 * hay permiso `read`, no renderiza. Si section es null (item publico),
 * renderiza siempre.
 *
 * Si se pasan `childHrefs`, el item se muestra si alguno de los
 * children es accesible (aunque el padre no lo sea). Esto sirve
 * para agrupadores como "Finanzas" cuyo href default apunta a
 * /finanzas/pulso pero el user quizas solo tiene acceso a /fiscal.
 */
export function NavItemGate({
  href,
  childHrefs,
  children,
}: {
  href: string;
  childHrefs?: string[];
  children: React.ReactNode;
}) {
  const { canAccess, loading } = usePermissions();
  // S60 EXT-2 BIS+++++++++++ — sidebar lee el section status.
  // Si la seccion esta en MAINTENANCE, atenuamos + badge + bloqueamos clicks.
  const { sections: sectionStatusMap } = useSectionStatusForNav();

  // Durante loading, no renderizamos nada. Evita flash de items que
  // despues se ocultan. El sidebar aparece "de una" cuando los
  // permisos terminan de cargar.
  if (loading) return null;

  const parentSection = hrefToSection(href);

  // ¿Esta en mantenimiento? — usamos el href para ubicar la seccion.
  // (sectionStatusMap viene cacheado del hook, no hay extra fetch)
  const sectionConfigKey = findSectionConfigKeyByPath(href);
  const isMaintenance =
    sectionConfigKey != null &&
    sectionStatusMap?.[sectionConfigKey]?.status === "MAINTENANCE";

  const wrapMaintenance = (node: React.ReactNode) =>
    isMaintenance ? (
      <div
        className="relative"
        style={{ opacity: 0.5, pointerEvents: "none", filter: "saturate(0.4)" }}
      >
        {node}
        <span
          aria-label="En mantenimiento"
          className="absolute top-1 right-1 z-10 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
          style={{
            background: "rgba(251, 191, 36, 0.2)",
            color: "#FCD34D",
            border: "1px solid rgba(251, 191, 36, 0.4)",
            pointerEvents: "none",
          }}
        >
          Mantenimiento
        </span>
      </div>
    ) : (
      <>{node}</>
    );

  // 1. Parent tiene section y el user lo puede ver -> mostrar (con o sin maintenance)
  if (parentSection !== null && canAccess(parentSection, "read")) {
    return wrapMaintenance(children);
  }

  // 2. Parent sin section (publico) -> mostrar
  if (parentSection === null && (!childHrefs || childHrefs.length === 0)) {
    return wrapMaintenance(children);
  }

  // 3. Tiene children -> mostrar si alguno es accesible
  if (childHrefs && childHrefs.length > 0) {
    const anyChildVisible = childHrefs.some((c) => {
      const sec = hrefToSection(c);
      if (sec === null) return true; // child publico
      return canAccess(sec, "read");
    });
    if (anyChildVisible) return wrapMaintenance(children);
  }

  return null;
}

// ────────────────────────────────────────────────────────────────
// Helper interno: lee section status sin generar dependencia circular
// con SectionGuard. Mantenemos el cache modulo-level del hook
// useSectionStatus (mismo shape).
// ────────────────────────────────────────────────────────────────
function useSectionStatusForNav() {
  const [sections, setSections] = React.useState<Record<string, { status: string }>>({});
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/me/section-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok) return;
        setSections(d.sections || {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return { sections };
}

/** Mapea href del nav → section key del config. */
function findSectionConfigKeyByPath(href: string): string | null {
  // Import diferido para evitar dependencia circular en build
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SECTIONS } = require("@/lib/sections/config");
  const exact = SECTIONS.find((s: any) => s.path === href);
  if (exact) return exact.key;
  const prefix = SECTIONS.find((s: any) => href.startsWith(s.path + "/"));
  return prefix?.key || null;
}

/**
 * Wrapper para grupos de nav (con titulo + items). Si ninguno de los
 * hrefs del grupo es accesible, oculta el grupo ENTERO (incluido el
 * titulo). Durante loading, tambien oculta.
 */
export function NavGroupGate({
  itemHrefs,
  children,
}: {
  itemHrefs: string[];
  children: React.ReactNode;
}) {
  const { canAccess, loading } = usePermissions();

  if (loading) return null;

  const anyVisible = itemHrefs.some((h) => {
    const sec = hrefToSection(h);
    if (sec === null) return true; // item publico
    return canAccess(sec, "read");
  });

  if (!anyVisible) return null;
  return <>{children}</>;
}
