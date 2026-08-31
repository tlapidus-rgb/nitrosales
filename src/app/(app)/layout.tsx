"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AurumProvider } from "@/components/aurum/AurumContext";
import FloatingAurum from "@/components/aurum/FloatingAurum";
import { PermissionsProvider, NavItemGate, NavGroupGate, PathnameGuard } from "@/hooks/usePermissions";
import AlertsBadge from "@/components/alerts/AlertsBadge";
import { PixelInstallBanner } from "@/components/PixelInstallBanner";
import { AdsAuthBanner } from "@/components/AdsAuthBanner";
import { AutoSectionGuard } from "@/components/AutoSectionGuard";
import { ImpersonateBanner } from "@/components/ImpersonateBanner";
import { ViewAsOrgBanner } from "@/components/ViewAsOrgBanner";
import OnboardingGate from "@/components/OnboardingGate";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { LivePulse } from "@/components/enterprise/ui";
import { PageLoader } from "@/components/PageLoader";

// NitroPixel es el único item premium sin `children` en NAV_GROUPS (sus sub-pantallas
// vivían hardcodeadas en la premium-card). En el sidebar sobrio siempre-expandido las
// mostramos como hijos normales.
const PIXEL_CHILDREN = [
  { href: "/pixel/analytics", label: "Analytics" },
  { href: "/pixel", label: "Atribución" },
  { href: "/pixel/canales", label: "Canales" },
  { href: "/pixel/journeys", label: "Journeys" },
  { href: "/pixel/configuracion", label: "Configuración" },
];

type NavItem = {
  href: string;
  label: string;
  icon: string;
  children?: { href: string; label: string; group?: string }[];
  premium?: { badge: string; description: string };
};

type NavGroup = {
  label: string | null; // null = no group header (utilities)
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  // ─── Tier 1 — ACTIVOS DIGITALES (el corazón vivo) ───
  {
    label: "ACTIVOS DIGITALES",
    items: [
      {
        href: "/nitropixel",
        label: "NitroPixel",
        icon: "M13 10V3L4 14h7v7l9-11h-7z",
        premium: { badge: "ASSET", description: "Tu activo digital vivo" },
      },
      // Aurum oculto por pedido de Tomy (reunión 08/07/26): no se muestra en
      // ningún lado pero NO se elimina — reactivar descomentando este item.
      // {
      //   href: "/chat",
      //   label: "Aurum",
      //   icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4v12M8 10l4-4 4 4M8 14l4 4 4-4",
      //   premium: { badge: "INTELLIGENCE", description: "Inteligencia dorada del negocio" },
      // },
    ],
  },
  // ─── Tier 2 — CONTROL DE GESTIÓN (día a día ejecutivo) ───
  {
    label: "CONTROL DE GESTIÓN",
    items: [
      {
        href: "/dashboard",
        label: "Centro de Control",
        icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
      },
      {
        href: "/orders",
        label: "Pedidos",
        icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
      },
      {
        href: "/alertas",
        label: "Alertas",
        icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
      },
    ],
  },
  // ─── Tier 3 — FIDELIZACIÓN Y COMUNIDAD (clientes + creadores) ───
  {
    label: "FIDELIZACIÓN Y COMUNIDAD",
    items: [
      {
        href: "/bondly/overview",
        label: "Bondly",
        icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
        premium: {
          badge: "LOYALTY",
          description: "Clientes, LTV y audiencias.",
        },
        children: [
          { href: "/bondly/overview", label: "Overview" },
          { href: "/bondly/senales", label: "Señales", group: "Live" },
          { href: "/bondly/clientes", label: "Clientes", group: "Base" },
          { href: "/bondly/ltv", label: "Lifetime Value", group: "Base" },
          { href: "/bondly/audiencias", label: "Audiencias", group: "Activación" },
        ],
      },
      {
        href: "/aura/inicio",
        label: "Aura",
        icon: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 4a5 5 0 110 10 5 5 0 010-10zm0 3a2 2 0 100 4 2 2 0 000-4z",
        premium: {
          badge: "NEW",
          description: "Tu nuevo canal de ventas.",
        },
        // Separadores de grupo ("CREADORES", "PAGOS", …) quitados por pedido de
        // Tomy (reunión 08/07/26, item 25): lista plana, sin `group`.
        children: [
          { href: "/aura/inicio", label: "Inicio" },
          { href: "/aura/creadores", label: "Creadores" },
          { href: "/aura/creadores/aplicaciones", label: "Aplicaciones" },
          // Lote 2A: concepto de "Campaña" escondido hasta nuevo aviso (Tomy). Se ocultan
          // del nav pero la maquinaria (páginas/endpoints/datos) queda intacta para volver.
          // { href: "/aura/campanas", label: "Campañas" },
          // { href: "/aura/campanas/nueva", label: "Nueva campaña" },
          // Contenido (item 18) y Deals (item 19) ocultos por pedido de Tomy (reunión
          // 08/07/26). Páginas/endpoints intactos; se ocultan solo del nav.
          // { href: "/aura/contenido", label: "Overview" },
          // { href: "/aura/contenido/briefings", label: "Briefings" },
          // { href: "/aura/contenido/aprobaciones", label: "Aprobaciones" },
          // { href: "/aura/deals", label: "Deals" },
          { href: "/aura/pagos", label: "Pagos" },
        ],
      },
    ],
  },
  // ─── Tier 4 — MARKETING DIGITAL (cómo traigo ventas) ───
  {
    label: "MARKETING DIGITAL",
    items: [
      {
        href: "/campaigns",
        label: "Campanas",
        icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z",
        children: [
          { href: "/campaigns", label: "Overview" },
          { href: "/campaigns/creatives", label: "Creativos" },
          { href: "/campaigns/meta", label: "Meta Ads" },
          { href: "/campaigns/google", label: "Google Ads" },
        ],
      },
      {
        href: "/seo",
        label: "SEO",
        icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
      },
      {
        href: "/competitors",
        label: "Competencia",
        icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3",
      },
    ],
  },
  // ─── Tier 5 — COMERCIAL (catálogo + rentabilidad) ───
  {
    label: "COMERCIAL",
    items: [
      {
        href: "/products",
        label: "Productos",
        icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
      },
      {
        href: "/rentabilidad",
        label: "Rentabilidad",
        icon: "M3 3v18h18M7 14l4-4 4 4 6-6",
      },
    ],
  },
  // ─── Tier 6 — MARKETPLACES (venta externa) ───
  {
    label: "MARKETPLACES",
    items: [
      {
        href: "/mercadolibre",
        label: "MercadoLibre",
        icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z",
        children: [
          { href: "/mercadolibre", label: "Dashboard" },
          { href: "/mercadolibre/publicaciones", label: "Publicaciones" },
          { href: "/mercadolibre/reputacion", label: "Reputacion" },
          { href: "/mercadolibre/preguntas", label: "Preguntas" },
        ],
      },
    ],
  },
  // ─── Tier 7 — FINANZAS ───
  {
    label: "FINANZAS",
    items: [
      {
        href: "/finanzas/pulso",
        label: "P&L",
        icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
        children: [
          { href: "/finanzas/pulso", label: "Pulso" },
          { href: "/finanzas/estado", label: "Estado de Resultados" },
          { href: "/finanzas/costos", label: "Costos Operativos" },
          { href: "/finanzas/escenarios", label: "Escenarios" },
          { href: "/finanzas/fiscal", label: "Fiscal" },
        ],
      },
    ],
  },
  // ─── Tier 8 — utilitarios (footer) ───
  {
    label: null,
    items: [
      {
        href: "/settings",
        label: "Configuracion",
        icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
      },
    ],
  },
];


export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Sync button removed — syncs run automatically via cron/webhooks.
  // Manual sync available in Settings if needed.

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-canvas text-ink-40">
        <PageLoader label="Cargando" minHeight="100vh" />
      </div>
    );
  }

  if (!session?.user) {
    router.push("/login");
    return null;
  }

  return (
    <OnboardingGate>
    <PermissionsProvider>
    <AurumProvider>
    <div className={`${GeistSans.variable} ${GeistMono.variable} font-geist h-screen bg-canvas text-ink flex overflow-hidden`}>
      {/* Aurum oculto por pedido de Tomy (reunión 08/07/26): botón flotante
          desactivado. El provider/contexto queda para reactivar sin romper nada. */}
      {/* <FloatingAurum /> */}
      {/* Keyframes globales heredados. Los decorativos del look viejo (glow cyan, holo
          arcoíris + veil oscuro, shimmer, órbitas, sinapsis, breath, journey-dot…) se
          eliminaron al migrar al design system enterprise sobrio. Quedan solo los nombres
          que BrandLogo (NITROPIXEL) todavía referencia — NEUTRALIZADOS a inertes para no
          romperlo mientras se migra ese componente. pixelGlow también queda neutralizado
          (sin box-shadow cyan) por la migración concurrente de NitroPixel. */}
      <style jsx global>{`
        /* Neutralizado: era un glow cyan (box-shadow 0 0 30px rgba(6,182,212,.4)). Inerte. */
        @keyframes pixelGlow {
          0%, 100% { box-shadow: none; }
          50% { box-shadow: none; }
        }
        /* Neutralizados a inertes (sin movimiento). Nombres conservados porque
           BrandLogo (NITROPIXEL) aún los referencia vía animation inline. */
        @keyframes pixelBreath {
          0%, 100% { transform: none; opacity: 1; }
        }
        @keyframes pixelOrbit {
          from { transform: none; }
          to { transform: none; }
        }
        @keyframes pixelOrbitReverse {
          from { transform: none; }
          to { transform: none; }
        }
      `}</style>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {/* Sidebar — sobrio, siempre expandido (design system enterprise) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[248px] bg-surface flex flex-col border-r border-hairline transition-transform duration-300 ease-ent lg:translate-x-0 lg:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-4 h-14 shrink-0 flex items-center gap-2.5 border-b border-hairline">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
            <div className="w-7 h-7 rounded-lg bg-ink text-white grid place-items-center font-semibold text-[13px] tracking-tight">N</div>
            <span className="text-[14px] font-semibold text-ink tracking-[-.02em]">NitroSales</span>
          </Link>
        </div>

        {/* Org switcher */}
        <div className="px-3 pt-3">
          <OrgSwitcher />
        </div>

        {/* Navigation — grupos siempre expandidos */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          {NAV_GROUPS.map((group, gi) => {
            const groupHrefs = group.items.flatMap((it) => [it.href, ...(it.children?.map((c) => c.href) ?? [])]);
            return (
              <NavGroupGate key={gi} itemHrefs={groupHrefs}>
                <div className="mb-4">
                  {group.label && (
                    <p className="px-2.5 pb-1 font-geistmono text-[10px] font-medium uppercase tracking-[.11em] text-ink-40 select-none">{group.label}</p>
                  )}
                  {group.items.map((item) => {
                    const kids = item.label === "NitroPixel" ? PIXEL_CHILDREN : (item.children ?? []);
                    const childHrefs = kids.map((c) => c.href);
                    const bestChild = kids.reduce<{ href: string; label: string } | null>(
                      (b, c) =>
                        (pathname === c.href || pathname.startsWith(c.href + "/")) && (!b || c.href.length > b.href.length) ? c : b,
                      null
                    );
                    const parentActive =
                      !bestChild &&
                      (pathname === item.href ||
                        (kids.length === 0 && pathname.startsWith(item.href + "/")) ||
                        (item.label === "NitroPixel" && pathname.startsWith("/nitropixel")));
                    return (
                      <NavItemGate key={item.href} href={item.href} childHrefs={childHrefs}>
                        <div className={kids.length ? "relative pl-1.5 mb-0.5" : "mb-0.5"}>
                          {kids.length > 0 && <span className="absolute left-[13px] top-9 bottom-1 w-px bg-hairline-2" aria-hidden="true" />}
                          <Link
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            aria-current={parentActive ? "page" : undefined}
                            className={`group relative flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-[13px] font-medium tracking-[-.01em] transition-colors duration-150 ease-ent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${
                              parentActive ? "bg-white text-ink shadow-ent-xs" : "text-ink-60 hover:bg-white/70 hover:text-ink"
                            }`}
                          >
                            {parentActive && <span className="absolute left-1 top-2 bottom-2 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 shrink-0 ${parentActive ? "text-ink" : "text-ink-40 group-hover:text-ink-60"}`}>
                              <path d={item.icon} />
                            </svg>
                            <span className="truncate">{item.label}</span>
                            {item.href === "/alertas" && <AlertsBadge />}
                          </Link>
                          {kids.map((child) => {
                            const active = bestChild ? child.href === bestChild.href : false;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => setSidebarOpen(false)}
                                aria-current={active ? "page" : undefined}
                                className={`relative flex items-center pl-6 pr-2.5 h-[30px] rounded-lg text-[12.5px] tracking-[-.01em] transition-colors duration-150 ease-ent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${
                                  active ? "bg-white text-ink font-medium shadow-ent-xs" : "text-ink-60 hover:bg-white/70 hover:text-ink"
                                }`}
                              >
                                {active && <span className="absolute left-2 top-2 bottom-2 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                                <span className="truncate">{child.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </NavItemGate>
                    );
                  })}
                </div>
              </NavGroupGate>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-hairline px-3 py-3 shrink-0">
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div className="w-7 h-7 rounded-lg bg-surface-2 text-ink border border-hairline grid place-items-center text-[12px] font-semibold shrink-0">
              {(session.user.name || session.user.email || "U")[0].toUpperCase()}
            </div>
            <p className="text-[12px] text-ink-60 truncate min-w-0">{session.user.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full text-left text-[12px] text-ink-40 hover:text-ink hover:bg-surface-2 py-1.5 px-2 rounded-lg transition-colors duration-150 ease-ent"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 bg-canvas/85 backdrop-blur-sm border-b border-hairline px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-ink-60 hover:bg-surface transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-[13px] font-medium text-ink">{(session.user as any).organizationName || "Tu negocio"}</span>
          </div>
          <LivePulse status="LIVE" />
        </header>

        {/* Page content — Aurum + NitroPixel routes get full-bleed dark canvas, others get padded light bg */}
        {(() => {
          const aurumLockedRoutes = ["/chat"];
          const aurumScrollRoutes = ["/sinapsis", "/boveda", "/memory"];
          const isAurumLocked = aurumLockedRoutes.some((r) => pathname.startsWith(r));
          const isAurumScroll = aurumScrollRoutes.some((r) => pathname.startsWith(r));
          const isNitropixel = pathname.startsWith("/nitropixel");
          const isJourneys = pathname.startsWith("/pixel/journeys");
          const isPixelAttribution = pathname === "/pixel";
          const isAura = pathname.startsWith("/aura");
          const isAlertas = pathname.startsWith("/alertas");
          return (
            <main
              className={
                isAurumLocked
                  ? "flex-1 p-0 overflow-hidden bg-canvas"
                  : isAurumScroll
                  ? "flex-1 p-0 overflow-y-auto bg-canvas"
                  : isNitropixel
                  ? "flex-1 p-0 overflow-hidden bg-canvas"
                  : isJourneys
                  ? "flex-1 p-0 overflow-y-auto bg-canvas"
                  : isPixelAttribution
                  ? "flex-1 p-0 overflow-y-auto bg-canvas"
                  : isAura
                  ? "flex-1 p-0 overflow-y-auto bg-canvas"
                  : isAlertas
                  ? "flex-1 p-0 overflow-hidden bg-canvas"
                  : "flex-1 p-4 lg:p-6 bg-canvas overflow-y-auto"
              }
            >
              <ImpersonateBanner />
              <ViewAsOrgBanner />
              <PixelInstallBanner />
              <AdsAuthBanner />
              <PathnameGuard pathname={pathname}>
                <AutoSectionGuard>
                  {children}
                </AutoSectionGuard>
              </PathnameGuard>
            </main>
          );
        })()}
      </div>
    </div>
    </AurumProvider>
    </PermissionsProvider>
    </OnboardingGate>
  );
}
