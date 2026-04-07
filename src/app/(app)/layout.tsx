"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  children?: { href: string; label: string }[];
  premium?: { badge: string; badgeColor: string; glowColor: string; description: string };
};

type NavGroup = {
  label: string | null; // null = no group header (utilities)
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "OPERACIONES",
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
        href: "/analytics",
        label: "Analytics",
        icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      },
    ],
  },
  {
    label: "CATALOGO",
    items: [
      {
        href: "/products",
        label: "Productos",
        icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
      },
    ],
  },
  {
    label: "MARKETING Y ADQUISICION",
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
    ],
  },
  {
    label: "NITRO CREATORS",
    items: [
      {
        href: "/influencers",
        label: "Influencers",
        icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
        children: [
          { href: "/influencers", label: "Overview" },
          { href: "/influencers/manage", label: "Gestionar" },
          { href: "/influencers/campaigns", label: "Campañas" },
          { href: "/influencers/applications", label: "Aplicaciones" },
          { href: "/influencers/leaderboard", label: "Leaderboard" },
          { href: "/influencers/analytics", label: "Analytics" },
        ],
      },
      {
        href: "/influencers/briefings",
        label: "Contenido",
        icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
        children: [
          { href: "/influencers/briefings", label: "Briefings" },
          { href: "/influencers/content", label: "Aprobaciones" },
          { href: "/influencers/ugc", label: "UGC Library" },
          { href: "/influencers/seeding", label: "Product Seeding" },
        ],
      },
    ],
  },
  {
    label: "CLIENTES",
    items: [
      {
        href: "/customers",
        label: "Clientes",
        icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
        children: [
          { href: "/customers", label: "Segmentacion" },
        ],
      },
    ],
  },
  {
    label: "CANALES",
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
      {
        href: "/competitors",
        label: "Competencia",
        icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3",
      },
    ],
  },
  {
    label: "HERRAMIENTAS",
    items: [
      {
        href: "/chat",
        label: "Aurum",
        icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4v12M8 10l4-4 4 4M8 14l4 4 4-4",
        premium: { badge: "INTELLIGENCE", badgeColor: "#fbbf24", glowColor: "rgba(251,191,36,0.22)", description: "Inteligencia dorada del negocio" },
      },
      {
        href: "/pixel",
        label: "NitroPixel",
        icon: "M13 10V3L4 14h7v7l9-11h-7z",
        premium: { badge: "LIVE", badgeColor: "#22c55e", glowColor: "rgba(34,197,94,0.15)", description: "Tracking en tiempo real" },
      },
      {
        href: "/customers/ltv",
        label: "Lifetime Value",
        icon: "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
        premium: { badge: "AI", badgeColor: "var(--nitro-orange)", glowColor: "rgba(255,94,26,0.12)", description: "Prediccion inteligente" },
      },
      {
        href: "/audiences",
        label: "Audience Sync",
        icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
        premium: { badge: "SYNC", badgeColor: "#8b5cf6", glowColor: "rgba(139,92,246,0.12)", description: "Meta & Google audiences" },
      },
    ],
  },
  {
    label: "FINANZAS",
    items: [
      {
        href: "/finanzas",
        label: "P&L",
        icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
        children: [
          { href: "/finanzas", label: "Estado de Resultados" },
          { href: "/finanzas/costos", label: "Costos Operativos" },
        ],
      },
    ],
  },
  {
    label: null,
    items: [
      {
        href: "/alertas",
        label: "Alertas",
        icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
      },
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
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-nitro-bg flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-nitro-orange animate-pulse-live" />
          <p className="text-nitro-text2 font-mono text-sm tracking-wider uppercase">Cargando</p>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    router.push("/login");
    return null;
  }

  function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    fetch("/api/sync/trigger", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setSyncResult(data.ok ? "ok" : "error");
        setTimeout(() => setSyncResult(null), 3000);
      })
      .catch(() => setSyncResult("error"))
      .finally(() => setSyncing(false));
  }

  return (
    <div className="h-screen bg-nitro-bg flex overflow-hidden">
      {/* Aurum global animations */}
      <style jsx global>{`
        @keyframes aurumShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .aurum-shimmer {
          animation: aurumShimmer 4.5s ease-in-out infinite;
        }
        @keyframes aurumOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes aurumBreath {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.04); opacity: 1; }
        }
        @keyframes aurumFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes aurumFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes aurumPulseRing {
          0% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.7; }
        }
        @keyframes aurumTextCycle {
          0%, 20% { opacity: 0; transform: translateY(6px); }
          25%, 45% { opacity: 1; transform: translateY(0); }
          50%, 100% { opacity: 0; transform: translateY(-6px); }
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
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-nitro-bg2 flex flex-col transition-transform duration-500 ease-nitro lg:translate-x-0 lg:static border-r border-nitro-border ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-nitro-border">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: "var(--nitro-gradient)" }}
            >
              <span className="text-nitro-bg">N</span>
            </div>
            <span className="font-headline text-lg tracking-tight text-white">
              NITRO<span style={{ color: "var(--nitro-orange)" }}>SALES</span>
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {/* Group separator + label */}
              {gi > 0 && <div className="my-3 mx-3 border-t border-nitro-border/40" />}
              {group.label && (
                <p
                  className={`px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] select-none ${
                    group.label === "HERRAMIENTAS" || group.label === "NITRO CREATORS"
                      ? "text-nitro-orange/70"
                      : "text-nitro-muted/60"
                  }`}
                  style={
                    group.label === "HERRAMIENTAS" || group.label === "NITRO CREATORS"
                      ? {
                          background: "linear-gradient(90deg, var(--nitro-orange), #f59e0b)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          letterSpacing: "0.2em",
                        }
                      : undefined
                  }
                >
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                // Content routes that belong to "Contenido" not "Influencers"
                const contentRoutes = ["/influencers/briefings", "/influencers/content", "/influencers/ugc", "/influencers/seeding"];
                const isContentRoute = contentRoutes.some(r => pathname.startsWith(r));
                // Aurum-specific routes: /chat, /sinapsis, /boveda, /memory all activate Aurum
                const aurumRoutes = ["/chat", "/sinapsis", "/boveda", "/memory"];
                const isAurumRoute = item.label === "Aurum" && aurumRoutes.some(r => pathname.startsWith(r));
                const isActive =
                  // Aurum umbrella activation
                  isAurumRoute ||
                  // Check if any child matches exactly
                  (item.children?.some(c => pathname === c.href || pathname.startsWith(c.href))) ||
                  // Or direct match
                  pathname === item.href ||
                  // Or prefix match, but exclude content routes from influencers parent, and exclude Aurum (handled above)
                  (item.href !== "/dashboard" && item.href !== "/influencers" && item.label !== "Aurum" && pathname.startsWith(item.href)) ||
                  // Influencers only active when NOT on a content route
                  (item.href === "/influencers" && pathname.startsWith("/influencers") && !isContentRoute);
                const hasChildren = item.children && item.children.length > 0;

                // ═══ Premium tool cards (Aurum, NitroPixel, LTV) ═══
                if (item.premium) {
                  const isAurum = item.label === "Aurum";
                  const aurumSubItems = isAurum
                    ? [
                        {
                          href: "/sinapsis",
                          label: "Sinapsis",
                          sublabel: "Memoria viva",
                          iconPath:
                            "M8 3v4m0 0l-2.5 2.5M8 7l2.5 2.5M16 21v-4m0 0l-2.5-2.5M16 17l2.5-2.5M3 12h4m0 0l2.5-2.5M7 12l2.5 2.5M21 12h-4m0 0l-2.5-2.5M17 12l-2.5 2.5",
                        },
                        {
                          href: "/boveda",
                          label: "Bóveda",
                          sublabel: "Artefactos",
                          iconPath:
                            "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
                        },
                      ]
                    : [];
                  return (
                    <div key={item.href} className={`mb-1.5 ${isAurum ? "aurum-card-wrapper" : ""}`}>
                      <Link
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className="group block relative rounded-xl overflow-hidden transition-all duration-500"
                        style={{
                          background: isAurum
                            ? (isActive
                                ? "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(245,158,11,0.08) 50%, rgba(251,191,36,0.03))"
                                : "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.03) 50%, rgba(255,255,255,0.02))")
                            : (isActive
                                ? `linear-gradient(135deg, ${item.premium.glowColor}, rgba(255,255,255,0.03))`
                                : "rgba(255,255,255,0.02)"),
                          border: isAurum
                            ? (isActive ? "1px solid rgba(251,191,36,0.45)" : "1px solid rgba(251,191,36,0.22)")
                            : (isActive ? `1px solid ${item.premium.badgeColor}33` : "1px solid rgba(255,255,255,0.06)"),
                          boxShadow: isAurum
                            ? (isActive
                                ? "0 0 30px rgba(251,191,36,0.20), inset 0 1px 0 rgba(253,224,71,0.15)"
                                : "0 0 18px rgba(251,191,36,0.08), inset 0 1px 0 rgba(253,224,71,0.08)")
                            : undefined,
                        }}
                      >
                        {/* Aurum shimmer sweep */}
                        {isAurum && (
                          <div
                            className="absolute inset-0 pointer-events-none aurum-shimmer"
                            style={{
                              background: "linear-gradient(110deg, transparent 30%, rgba(253,224,71,0.10) 50%, transparent 70%)",
                              backgroundSize: "200% 100%",
                            }}
                          />
                        )}
                        {/* Top glow line */}
                        <div
                          className="absolute top-0 left-2 right-2 h-[1px] opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                          style={{ background: `linear-gradient(90deg, transparent, ${item.premium.badgeColor}, transparent)` }}
                        />
                        <div className="px-3 py-2.5 flex items-center gap-3">
                          {/* Icon with glow background */}
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-105"
                            style={{
                              background: `linear-gradient(135deg, ${item.premium.glowColor}, ${item.premium.badgeColor}15)`,
                              boxShadow: isActive ? `0 0 12px ${item.premium.glowColor}` : "none",
                            }}
                          >
                            <svg
                              className="w-4 h-4 transition-colors duration-300"
                              style={{ color: item.premium.badgeColor }}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.8}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold transition-colors duration-300 ${isActive ? "text-white" : "text-nitro-text2 group-hover:text-white"}`}>
                                {item.label}
                              </span>
                              <span
                                className="px-1.5 py-0.5 rounded-md text-[8px] font-bold font-mono uppercase tracking-widest flex items-center gap-1"
                                style={{
                                  background: `${item.premium.badgeColor}20`,
                                  color: item.premium.badgeColor,
                                  border: `1px solid ${item.premium.badgeColor}30`,
                                  textShadow: `0 0 8px ${item.premium.badgeColor}40`,
                                }}
                              >
                                {item.premium.badge === "LIVE" && (
                                  <span
                                    className="w-1 h-1 rounded-full animate-pulse"
                                    style={{ backgroundColor: item.premium.badgeColor }}
                                  />
                                )}
                                {item.premium.badge}
                              </span>
                            </div>
                            <p className="text-[10px] text-nitro-muted mt-0.5 font-mono tracking-wide">
                              {item.premium.description}
                            </p>
                          </div>
                        </div>
                      </Link>

                      {/* Aurum sub-items (Sinapsis + Bóveda) */}
                      {isAurum && (
                        <div
                          className="overflow-hidden"
                          style={{
                            display: "grid",
                            gridTemplateRows: isActive ? "1fr" : "0fr",
                            opacity: isActive ? 1 : 0,
                            marginTop: isActive ? "4px" : "0px",
                            transition:
                              "grid-template-rows 400ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), margin-top 400ms cubic-bezier(0.16, 1, 0.3, 1)",
                          }}
                        >
                          <div className="min-h-0">
                            <div className="relative ml-5 pl-4 py-1 space-y-0.5">
                              {/* Gold connector line */}
                              <div
                                className="absolute left-0 top-2 bottom-2 w-[1px]"
                                style={{
                                  background:
                                    "linear-gradient(180deg, rgba(251,191,36,0.5), rgba(251,191,36,0.1))",
                                }}
                              />
                              {aurumSubItems.map((sub, si) => {
                                const subActive = pathname.startsWith(sub.href);
                                return (
                                  <Link
                                    key={sub.href}
                                    href={sub.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className="group/sub relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-300"
                                    style={{
                                      background: subActive
                                        ? "linear-gradient(90deg, rgba(251,191,36,0.12), rgba(251,191,36,0.02))"
                                        : "transparent",
                                      border: subActive
                                        ? "1px solid rgba(251,191,36,0.25)"
                                        : "1px solid transparent",
                                      transitionDelay: isActive ? `${si * 60}ms` : "0ms",
                                      transform: isActive ? "translateX(0)" : "translateX(-8px)",
                                      opacity: isActive ? 1 : 0,
                                      transition: `transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, opacity 300ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, background 200ms, border-color 200ms`,
                                    }}
                                  >
                                    {/* Branch dot */}
                                    <span
                                      className="absolute -left-4 top-1/2 w-2 h-[1px]"
                                      style={{
                                        background: subActive
                                          ? "#fbbf24"
                                          : "rgba(251,191,36,0.35)",
                                        transform: "translateY(-0.5px)",
                                      }}
                                    />
                                    <svg
                                      className="w-3 h-3 flex-shrink-0"
                                      style={{
                                        color: subActive ? "#fbbf24" : "rgba(251,191,36,0.55)",
                                        filter: subActive
                                          ? "drop-shadow(0 0 4px rgba(251,191,36,0.6))"
                                          : "none",
                                      }}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={1.8}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d={sub.iconPath}
                                      />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                      <div
                                        className="text-[11px] font-semibold transition-colors"
                                        style={{
                                          color: subActive
                                            ? "#fde68a"
                                            : "rgba(253,230,138,0.7)",
                                        }}
                                      >
                                        {sub.label}
                                      </div>
                                      <div className="text-[9px] font-mono tracking-wider text-[#fde68a]/40 uppercase">
                                        {sub.sublabel}
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // ═══ Regular nav items ═══
                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ease-nitro ${
                        isActive
                          ? "bg-white/5 text-white"
                          : "text-nitro-text2 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <span
                          className="absolute left-0 w-[3px] h-5 rounded-r-full"
                          style={{ background: "var(--nitro-gradient)" }}
                        />
                      )}
                      <svg
                        className={`w-5 h-5 flex-shrink-0 transition-colors duration-300 ${
                          isActive ? "text-nitro-orange" : "text-nitro-muted group-hover:text-nitro-text2"
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>
                      {item.label}
                      {hasChildren && (
                        <svg
                          className="w-3.5 h-3.5 ml-auto text-nitro-muted transition-transform duration-400 ease-nitro"
                          style={{
                            transform: isActive ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
                          }}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                      {item.href === "/chat" && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-nitro-green animate-pulse-live" />
                          <span className="text-[10px] text-nitro-muted font-mono uppercase tracking-widest">
                            AI
                          </span>
                        </span>
                      )}
                    </Link>
                    {/* Sub-items with smooth expand/collapse */}
                    {hasChildren && (
                      <div
                        className="sidebar-dropdown ml-8 space-y-0.5 overflow-hidden transition-all duration-400 ease-nitro"
                        style={{
                          display: "grid",
                          gridTemplateRows: isActive ? "1fr" : "0fr",
                          opacity: isActive ? 1 : 0,
                          marginTop: isActive ? "4px" : "0px",
                          transition: "grid-template-rows 400ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), margin-top 400ms cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                      >
                        <div className="min-h-0 space-y-0.5">
                          {item.children!.map((child, ci) => {
                            const childActive = pathname === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => setSidebarOpen(false)}
                                className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ease-nitro ${
                                  childActive
                                    ? "text-nitro-orange bg-white/5"
                                    : "text-nitro-muted hover:text-nitro-text2 hover:bg-white/5"
                                }`}
                                style={{
                                  transitionDelay: isActive ? `${ci * 50}ms` : "0ms",
                                  transform: isActive ? "translateX(0)" : "translateX(-8px)",
                                  opacity: isActive ? 1 : 0,
                                  transition: `transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? ci * 50 : 0}ms, opacity 300ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? ci * 50 : 0}ms, color 200ms, background-color 200ms`,
                                }}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="px-4 py-4 border-t border-nitro-border">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-nitro-bg"
              style={{ background: "var(--nitro-gradient)" }}
            >
              {(session.user.name || session.user.email || "U")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-nitro-text2 truncate">{session.user.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full text-xs text-nitro-muted hover:text-nitro-orange py-1.5 px-2 rounded-lg hover:bg-white/5 transition-all duration-300 ease-nitro text-left"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top bar */}
        <header className="glass border-b border-nitro-border px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <svg
                className="w-5 h-5 text-nitro-text2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-medium text-nitro-text2">El Mundo del Juguete</span>
            <span className="flex items-center gap-1.5 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-nitro-green animate-pulse-live" />
              <span className="font-mono text-[10px] text-nitro-muted uppercase tracking-widest">
                Live
              </span>
            </span>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-medium transition-all duration-300 ease-nitro ${
              syncing
                ? "bg-nitro-card text-nitro-muted cursor-not-allowed"
                : syncResult === "ok"
                ? "bg-nitro-green/10 text-nitro-green border border-nitro-green/20"
                : syncResult === "error"
                ? "bg-nitro-err/10 text-nitro-err border border-nitro-err/20"
                : "bg-nitro-card text-nitro-orange border border-nitro-border hover:border-nitro-orange/30 hover:shadow-[0_0_20px_rgba(255,94,26,0.1)]"
            }`}
          >
            {syncing
              ? "Sincronizando..."
              : syncResult === "ok"
              ? "\u2713 Sincronizado"
              : syncResult === "error"
              ? "\u26A0 Error"
              : "\u21BB Sincronizar datos"}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 bg-[#F7F8FA] overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
