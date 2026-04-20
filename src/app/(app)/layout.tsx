"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useMemo } from "react";
import { AurumProvider } from "@/components/aurum/AurumContext";
import FloatingAurum from "@/components/aurum/FloatingAurum";
import { AurumOrb } from "@/components/aurum/AurumOrb";
import { PermissionsProvider, NavItemGate, NavGroupGate, PathnameGuard } from "@/hooks/usePermissions";
import AlertsBadge from "@/components/alerts/AlertsBadge";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  children?: { href: string; label: string; group?: string }[];
  premium?: { badge: string; badgeColor: string; glowColor: string; description: string };
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
        premium: { badge: "ASSET", badgeColor: "#06b6d4", glowColor: "rgba(6,182,212,0.22)", description: "Tu activo digital vivo" },
      },
      {
        href: "/chat",
        label: "Aurum",
        icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4v12M8 10l4-4 4 4M8 14l4 4 4-4",
        premium: { badge: "INTELLIGENCE", badgeColor: "#fbbf24", glowColor: "rgba(251,191,36,0.22)", description: "Inteligencia dorada del negocio" },
      },
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
          badgeColor: "#10b981",
          glowColor: "rgba(16,185,129,0.32)",
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
          badgeColor: "#f472b6",
          glowColor: "rgba(244,114,182,0.38)",
          description: "Tu nuevo canal de ventas.",
        },
        children: [
          { href: "/aura/inicio", label: "Inicio" },
          { href: "/aura/creadores", label: "Creadores", group: "Creadores" },
          { href: "/aura/creadores/aplicaciones", label: "Aplicaciones", group: "Creadores" },
          { href: "/aura/campanas", label: "Campañas", group: "Campañas" },
          { href: "/aura/campanas/nueva", label: "Nueva campaña", group: "Campañas" },
          { href: "/aura/contenido", label: "Overview", group: "Contenido" },
          { href: "/aura/contenido/briefings", label: "Briefings", group: "Contenido" },
          { href: "/aura/contenido/aprobaciones", label: "Aprobaciones", group: "Contenido" },
          { href: "/aura/deals", label: "Deals", group: "Pagos" },
          { href: "/aura/pagos", label: "Pagos", group: "Pagos" },
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


// ── PixelBrain animated icon for sidebar ──
function PixelBrainSidebar({ size = 28 }: { size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* Glow background */}
      <div className="absolute inset-[-4px] rounded-full" style={{ background: "radial-gradient(circle, rgba(6,182,212,0.25) 0%, transparent 70%)", animation: "pixelBreath 3s ease-in-out infinite" }} />
      <svg width={size} height={size} viewBox="0 0 200 200" className="relative" style={{ filter: "drop-shadow(0 0 4px rgba(6,182,212,0.4))" }}>
        <defs>
          <radialGradient id="sbCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e0f7fa" stopOpacity="1" />
            <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#0e7490" stopOpacity="0.3" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Outer orbit */}
        <g style={{ transformOrigin: "100px 100px", animation: "pixelOrbitReverse 18s linear infinite" }}>
          <circle cx="100" cy="100" r="88" fill="none" stroke="#06b6d4" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="5 8" />
          <circle cx="188" cy="100" r="4" fill="#22d3ee" opacity="0.9" style={{ filter: "drop-shadow(0 0 3px #06b6d4)" }} />
        </g>
        {/* Inner orbit */}
        <g style={{ transformOrigin: "100px 100px", animation: "pixelOrbit 12s linear infinite" }}>
          <circle cx="100" cy="100" r="68" fill="none" stroke="#8b5cf6" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 6" />
          <circle cx="32" cy="100" r="3.5" fill="#a855f7" opacity="0.8" style={{ filter: "drop-shadow(0 0 3px #8b5cf6)" }} />
        </g>
        {/* Neurons — larger, brighter */}
        {[0,1,2,3,4,5].map((i: number) => {
          const angle = (i / 6) * Math.PI * 2;
          const x = 100 + Math.cos(angle) * 58;
          const y = 100 + Math.sin(angle) * 58;
          return <circle key={i} cx={x} cy={y} r="4" fill="#22d3ee" opacity="0.8" style={{ animation: `pixelNeuronPulse 2s ease-in-out infinite ${i * 280}ms`, filter: "drop-shadow(0 0 2px #06b6d4)" }} />;
        })}
        {/* Synapses connecting neurons */}
        {[0,1,2,3,4,5].map((i: number) => {
          const a1 = (i / 6) * Math.PI * 2;
          const a2 = ((i + 2) % 6 / 6) * Math.PI * 2;
          return <line key={`s${i}`} x1={100 + Math.cos(a1) * 58} y1={100 + Math.sin(a1) * 58} x2={100 + Math.cos(a2) * 58} y2={100 + Math.sin(a2) * 58} stroke="#06b6d4" strokeOpacity="0.2" strokeWidth="0.8" strokeDasharray="80" style={{ animation: `pixelSynapseFlow 3s ease-in-out infinite ${i * 200}ms` }} />;
        })}
        {/* Core — bigger, brighter */}
        <g style={{ transformOrigin: "100px 100px", animation: "pixelBreath 2.8s ease-in-out infinite" }}>
          <circle cx="100" cy="100" r="38" fill="url(#sbCore)" />
          <circle cx="100" cy="100" r="22" fill="#a5f3fc" opacity="0.9" />
          <circle cx="100" cy="100" r="12" fill="#ffffff" opacity="0.95" />
        </g>
      </svg>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Sync button removed — syncs run automatically via cron/webhooks.
  // Manual sync available in Settings if needed.

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

  return (
    <PermissionsProvider>
    <AurumProvider>
    <div className="h-screen bg-nitro-bg flex overflow-hidden">
      <FloatingAurum />
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
        /* ─── NitroPixel sidebar animations ─── */
        @keyframes pixelScan {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .pixel-scan {
          animation: pixelScan 5s ease-in-out infinite;
        }
        @keyframes pixelHeartbeat {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          14% { transform: scale(1.5); opacity: 1; }
          28% { transform: scale(1); opacity: 0.85; }
          42% { transform: scale(1.35); opacity: 1; }
          70% { transform: scale(1); opacity: 0.85; }
        }
        .pixel-heartbeat {
          animation: pixelHeartbeat 1.6s ease-in-out infinite;
        }
        /* ─── NitroPixel page-level animations ─── */
        @keyframes pixelOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pixelOrbitReverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes pixelDataFlow {
          0% { transform: translateY(100%); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateY(-100%); opacity: 0; }
        }
        @keyframes pixelBreath {
          0%, 100% { transform: scale(1); opacity: 0.9; filter: brightness(1); }
          50% { transform: scale(1.05); opacity: 1; filter: brightness(1.15); }
        }
        @keyframes pixelGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(6,182,212,0.4), 0 0 60px rgba(6,182,212,0.2), inset 0 0 20px rgba(6,182,212,0.1); }
          50% { box-shadow: 0 0 50px rgba(6,182,212,0.6), 0 0 100px rgba(139,92,246,0.3), inset 0 0 30px rgba(6,182,212,0.2); }
        }
        @keyframes pixelFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pixelCounter {
          0% { transform: scale(1); }
          50% { transform: scale(1.04); color: #a5f3fc; }
          100% { transform: scale(1); }
        }
        @keyframes pixelGridShift {
          0% { background-position: 0 0; }
          100% { background-position: 40px 40px; }
        }
        @keyframes pixelNeuronPulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.6); }
        }
        @keyframes pixelSynapseFlow {
          0% { stroke-dashoffset: 100; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes pixelShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes pixelJourneyDot {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139,92,246,0.5); }
          50% { transform: scale(1.15); box-shadow: 0 0 0 6px rgba(139,92,246,0); }
        }
        /* ═══ Aura holográfico ═══ */
        @keyframes auraHoloRotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes auraTitleShift {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.82); }
        }
        .aura-holo-card { position: relative; isolation: isolate; }
        .aura-holo-conic::before {
          content: '';
          position: absolute;
          inset: -40%;
          background: conic-gradient(from 0deg at 50% 50%,
            rgba(255,0,128,0.18),
            rgba(168,85,247,0.18),
            rgba(0,212,255,0.18),
            rgba(168,85,247,0.18),
            rgba(255,0,128,0.18));
          opacity: 0.55;
          animation: auraHoloRotate 14s linear infinite;
          pointer-events: none;
          z-index: 0;
        }
        .aura-holo-veil::after {
          content: '';
          position: absolute;
          inset: 1px;
          background: linear-gradient(180deg, rgba(10,7,20,0.82) 0%, rgba(10,7,20,0.94) 100%);
          border-radius: 11px;
          pointer-events: none;
          z-index: 1;
        }
        .aura-holo-title {
          background: linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%);
          background-size: 220% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: auraTitleShift 7s ease-in-out infinite;
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
          {NAV_GROUPS.map((group, gi) => {
            // Recolecto todos los hrefs del grupo (item principal + children)
            // para que NavGroupGate decida si al menos uno es accesible.
            const groupHrefs: string[] = group.items.flatMap((it) => [
              it.href,
              ...(it.children?.map((c) => c.href) ?? []),
            ]);
            return (
            <NavGroupGate key={gi} itemHrefs={groupHrefs}>
            <div>
              {/* Group separator + label */}
              {gi > 0 && <div className="my-3 mx-3 border-t border-nitro-border/40" />}
              {group.label && (
                <p
                  className={`px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] select-none flex items-center gap-2 ${
                    group.label === "ACTIVOS DIGITALES"
                      ? "text-cyan-400/80"
                      : group.label === "FIDELIZACIÓN Y COMUNIDAD"
                      ? "text-emerald-400/80"
                      : "text-nitro-muted/60"
                  }`}
                  style={
                    group.label === "ACTIVOS DIGITALES"
                      ? {
                          background: "linear-gradient(90deg, #06b6d4, #8b5cf6)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          letterSpacing: "0.22em",
                        }
                      : group.label === "FIDELIZACIÓN Y COMUNIDAD"
                      ? {
                          background: "linear-gradient(90deg, #10b981, #ec4899)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          letterSpacing: "0.22em",
                        }
                      : undefined
                  }
                >
                  {group.label}
                  {group.label === "ACTIVOS DIGITALES" && (
                    <span
                      aria-hidden
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{
                        background: "#22d3ee",
                        boxShadow: "0 0 8px rgba(34, 211, 238, 0.8)",
                        animation: "livePulse 2s ease-in-out infinite",
                      }}
                    />
                  )}
                </p>
              )}
              {group.items.map((item) => {
                // Content routes that belong to "Contenido" not "Influencers"
                const contentRoutes = ["/influencers/briefings", "/influencers/content", "/influencers/ugc", "/influencers/seeding"];
                const isContentRoute = contentRoutes.some(r => pathname.startsWith(r));
                // Aurum-specific routes: /chat, /sinapsis, /boveda, /memory all activate Aurum
                const aurumRoutes = ["/chat", "/sinapsis", "/boveda", "/memory"];
                const isAurumRoute = item.label === "Aurum" && aurumRoutes.some(r => pathname.startsWith(r));
                // NitroPixel umbrella: /nitropixel (asset hero) AND /pixel (analytics)
                const nitropixelRoutes = ["/nitropixel", "/pixel"];
                const isNitropixelRoute = item.label === "NitroPixel" && nitropixelRoutes.some(r => pathname.startsWith(r));
                const isActive =
                  // Aurum umbrella activation
                  isAurumRoute ||
                  // NitroPixel umbrella activation
                  isNitropixelRoute ||
                  // Check if any child matches exactly
                  (item.children?.some(c => pathname === c.href || pathname.startsWith(c.href))) ||
                  // Or direct match
                  pathname === item.href ||
                  // Or prefix match, but exclude content routes from influencers parent, and exclude Aurum/NitroPixel (handled above)
                  (item.href !== "/dashboard" && item.href !== "/influencers" && item.label !== "Aurum" && item.label !== "NitroPixel" && pathname.startsWith(item.href)) ||
                  // Influencers only active when NOT on a content route
                  (item.href === "/influencers" && pathname.startsWith("/influencers") && !isContentRoute);
                const hasChildren = item.children && item.children.length > 0;

                // ═══ Premium tool cards (Aurum, NitroPixel, LTV) ═══
                if (item.premium) {
                  const isAurum = item.label === "Aurum";
                  const isPixel = item.label === "NitroPixel";
                  const isAura = item.label === "Aura";
                  const isBondly = item.label === "Bondly";
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
                  const pixelSubItems = isPixel
                    ? [
                        {
                          href: "/pixel/analytics",
                          label: "Analytics",
                          sublabel: "Intelligence dashboard",
                          iconPath:
                            "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
                        },
                        {
                          href: "/pixel",
                          label: "Atribución",
                          sublabel: "Modelo y canales",
                          iconPath:
                            "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
                        },
                        {
                          href: "/pixel/journeys",
                          label: "Journeys",
                          sublabel: "Recorrido del cliente",
                          iconPath:
                            "M4 12h4m8 0h4M9 12a3 3 0 116 0 3 3 0 01-6 0zM4 12a0 0 0 100 0M20 12a0 0 0 100 0",
                        },
                      ]
                    : [];
                  return (
                    <NavItemGate
                      key={item.href}
                      href={item.href}
                      childHrefs={item.children?.map((c) => c.href)}
                    >
                    <div className={`mb-1.5 ${isAurum ? "aurum-card-wrapper" : ""} ${isPixel ? "pixel-card-wrapper" : ""} ${isAura ? "aura-holo-card" : ""} ${isBondly ? "bondly-card-wrapper" : ""}`}>
                      <Link
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`group block relative rounded-xl overflow-hidden transition-all duration-500 ${isAura ? "aura-holo-conic aura-holo-veil" : ""}`}
                        style={{
                          background: isAurum
                            ? (isActive
                                ? "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(245,158,11,0.08) 50%, rgba(251,191,36,0.03))"
                                : "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.03) 50%, rgba(255,255,255,0.02))")
                            : isPixel
                            ? (isActive
                                ? "linear-gradient(135deg, rgba(6,182,212,0.20), rgba(139,92,246,0.10) 50%, rgba(6,182,212,0.04))"
                                : "linear-gradient(135deg, rgba(6,182,212,0.10), rgba(139,92,246,0.04) 50%, rgba(255,255,255,0.02))")
                            : isAura
                            ? "#0a0714"
                            : isBondly
                            ? (isActive
                                ? "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,182,212,0.10) 50%, rgba(99,102,241,0.04))"
                                : "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(6,182,212,0.04) 50%, rgba(99,102,241,0.02))")
                            : (isActive
                                ? `linear-gradient(135deg, ${item.premium.glowColor}, rgba(255,255,255,0.03))`
                                : "rgba(255,255,255,0.02)"),
                          border: isAurum
                            ? (isActive ? "1px solid rgba(251,191,36,0.45)" : "1px solid rgba(251,191,36,0.22)")
                            : isPixel
                            ? (isActive ? "1px solid rgba(6,182,212,0.50)" : "1px solid rgba(6,182,212,0.25)")
                            : isAura
                            ? (isActive ? "1px solid rgba(168,85,247,0.40)" : "1px solid rgba(168,85,247,0.18)")
                            : isBondly
                            ? (isActive ? "1px solid rgba(16,185,129,0.45)" : "1px solid rgba(16,185,129,0.22)")
                            : (isActive ? `1px solid ${item.premium.badgeColor}33` : "1px solid rgba(255,255,255,0.06)"),
                          boxShadow: isAurum
                            ? (isActive
                                ? "0 0 30px rgba(251,191,36,0.20), inset 0 1px 0 rgba(253,224,71,0.15)"
                                : "0 0 18px rgba(251,191,36,0.08), inset 0 1px 0 rgba(253,224,71,0.08)")
                            : isPixel
                            ? (isActive
                                ? "0 0 32px rgba(6,182,212,0.25), inset 0 1px 0 rgba(165,243,252,0.15)"
                                : "0 0 18px rgba(6,182,212,0.10), inset 0 1px 0 rgba(165,243,252,0.08)")
                            : isAura
                            ? (isActive
                                ? "0 0 28px rgba(168,85,247,0.22), inset 0 1px 0 rgba(255,255,255,0.06)"
                                : "0 0 16px rgba(168,85,247,0.10), inset 0 1px 0 rgba(255,255,255,0.04)")
                            : isBondly
                            ? (isActive
                                ? "0 0 28px rgba(16,185,129,0.22), inset 0 1px 0 rgba(110,231,183,0.15)"
                                : "0 0 16px rgba(16,185,129,0.10), inset 0 1px 0 rgba(110,231,183,0.08)")
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
                        {/* Pixel data-flow scan */}
                        {isPixel && (
                          <div
                            className="absolute inset-0 pointer-events-none pixel-scan"
                            style={{
                              background: "linear-gradient(110deg, transparent 30%, rgba(165,243,252,0.12) 50%, transparent 70%)",
                              backgroundSize: "200% 100%",
                            }}
                          />
                        )}
                        {/* Pixel heartbeat dot (top-right corner) */}
                        {isPixel && (
                          <div
                            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full pixel-heartbeat"
                            style={{
                              background: "#06b6d4",
                              boxShadow: "0 0 8px rgba(6,182,212,0.8)",
                            }}
                          />
                        )}
                        {/* Top glow line */}
                        <div
                          className="absolute top-0 left-2 right-2 h-[1px] opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                          style={{ background: `linear-gradient(90deg, transparent, ${item.premium.badgeColor}, transparent)` }}
                        />
                        <div className="px-3 py-2.5 flex items-center gap-3" style={isAura ? { position: "relative", zIndex: 2 } : undefined}>
                          {/* Icon with glow background */}
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-105"
                            style={{
                              background: isAura
                                ? "linear-gradient(135deg, rgba(255,0,128,0.22), rgba(168,85,247,0.18), rgba(0,212,255,0.20))"
                                : `linear-gradient(135deg, ${item.premium.glowColor}, ${item.premium.badgeColor}15)`,
                              boxShadow: isAura
                                ? (isActive ? "0 0 14px rgba(168,85,247,0.45)" : "0 0 8px rgba(168,85,247,0.25)")
                                : (isActive ? `0 0 12px ${item.premium.glowColor}` : "none"),
                            }}
                          >
                            {isPixel ? (
                              <PixelBrainSidebar size={28} />
                            ) : isAurum ? (
                              <AurumOrb size={26} />
                            ) : (
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
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-semibold transition-colors duration-300 ${isAura ? "aura-holo-title" : isActive ? "text-white" : "text-nitro-text2 group-hover:text-white"}`}
                              >
                                {item.label}
                              </span>
                              <span
                                className="px-1.5 py-0.5 rounded-md text-[8px] font-bold font-mono uppercase tracking-widest flex items-center gap-1"
                                style={
                                  isAura
                                    ? {
                                        background: "rgba(255,255,255,0.06)",
                                        color: "rgba(255,255,255,0.85)",
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        backdropFilter: "blur(8px)",
                                        WebkitBackdropFilter: "blur(8px)",
                                      }
                                    : {
                                        background: `${item.premium.badgeColor}20`,
                                        color: item.premium.badgeColor,
                                        border: `1px solid ${item.premium.badgeColor}30`,
                                        textShadow: `0 0 8px ${item.premium.badgeColor}40`,
                                      }
                                }
                              >
                                {item.premium.badge === "LIVE" && (
                                  <span
                                    className="w-1 h-1 rounded-full animate-pulse"
                                    style={{ backgroundColor: isAura ? "#a855f7" : item.premium.badgeColor }}
                                  />
                                )}
                                {item.premium.badge}
                              </span>
                            </div>
                            <p className={`text-[10px] mt-0.5 font-mono tracking-wide ${isAura ? "text-white/55" : "text-nitro-muted"}`}>
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

                      {/* NitroPixel sub-items (Analytics) */}
                      {isPixel && (
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
                              {/* Cyan connector line */}
                              <div
                                className="absolute left-0 top-2 bottom-2 w-[1px]"
                                style={{
                                  background:
                                    "linear-gradient(180deg, rgba(6,182,212,0.55), rgba(139,92,246,0.15))",
                                }}
                              />
                              {pixelSubItems.map((sub, si) => {
                                const subActive =
                                  (sub.href === "/pixel/analytics" && pathname.startsWith("/pixel/analytics")) ||
                                  (sub.href === "/pixel" && pathname === "/pixel") ||
                                  (sub.href === "/pixel/journeys" && pathname.startsWith("/pixel/journeys"));
                                return (
                                  <Link
                                    key={sub.href}
                                    href={sub.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className="group/sub relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-300"
                                    style={{
                                      background: subActive
                                        ? "linear-gradient(90deg, rgba(6,182,212,0.14), rgba(139,92,246,0.04))"
                                        : "transparent",
                                      border: subActive
                                        ? "1px solid rgba(6,182,212,0.30)"
                                        : "1px solid transparent",
                                      transitionDelay: isActive ? `${si * 60}ms` : "0ms",
                                      transform: isActive ? "translateX(0)" : "translateX(-8px)",
                                      opacity: isActive ? 1 : 0,
                                      transition: `transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, opacity 300ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, background 200ms, border-color 200ms`,
                                    }}
                                  >
                                    <span
                                      className="absolute -left-4 top-1/2 w-2 h-[1px]"
                                      style={{
                                        background: subActive ? "#06b6d4" : "rgba(6,182,212,0.40)",
                                        transform: "translateY(-0.5px)",
                                      }}
                                    />
                                    <svg
                                      className="w-3 h-3 flex-shrink-0"
                                      style={{
                                        color: subActive ? "#06b6d4" : "rgba(6,182,212,0.60)",
                                        filter: subActive
                                          ? "drop-shadow(0 0 4px rgba(6,182,212,0.7))"
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
                                          color: subActive ? "#a5f3fc" : "rgba(165,243,252,0.7)",
                                        }}
                                      >
                                        {sub.label}
                                      </div>
                                      <div className="text-[9px] font-mono tracking-wider text-[#a5f3fc]/40 uppercase">
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

                      {/* Aura sub-items (Creator Gradient) */}
                      {isAura && item.children && item.children.length > 0 && (
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
                              {/* Magenta/purple connector line */}
                              <div
                                className="absolute left-0 top-2 bottom-2 w-[1px]"
                                style={{
                                  background:
                                    "linear-gradient(180deg, rgba(244,114,182,0.55), rgba(168,85,247,0.15))",
                                }}
                              />
                              {/* Determinar el match más específico (href más largo) para evitar doble selección */}
                              {(() => null)()}
                              {item.children.map((sub, si) => {
                                const children = item.children!;
                                const matchingHrefs = children
                                  .filter(
                                    (c) =>
                                      pathname === c.href ||
                                      (c.href !== "/aura/inicio" &&
                                        pathname.startsWith(c.href + "/")),
                                  )
                                  .map((c) => c.href);
                                const bestMatch = matchingHrefs.reduce(
                                  (best, h) => (h.length > best.length ? h : best),
                                  "",
                                );
                                const subActive = sub.href === bestMatch;
                                const prevGroup = si > 0 ? item.children![si - 1].group : undefined;
                                const showGroupHeader = sub.group && sub.group !== prevGroup;
                                return (
                                  <div key={sub.href}>
                                    {showGroupHeader ? (
                                      <div
                                        className="relative flex items-center gap-2 px-2.5 pt-3 pb-1 select-none"
                                        style={{
                                          transform: isActive ? "translateX(0)" : "translateX(-8px)",
                                          opacity: isActive ? 1 : 0,
                                          transition: `transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, opacity 300ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms`,
                                        }}
                                      >
                                        <span
                                          className="text-[9px] font-semibold tracking-[0.18em] uppercase"
                                          style={{ color: "rgba(251,207,232,0.42)" }}
                                        >
                                          {sub.group}
                                        </span>
                                        <span
                                          className="flex-1 h-[1px]"
                                          style={{
                                            background:
                                              "linear-gradient(90deg, rgba(244,114,182,0.22), rgba(244,114,182,0) 80%)",
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                  <Link
                                    href={sub.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className="group/sub relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-300"
                                    style={{
                                      background: subActive
                                        ? "linear-gradient(90deg, rgba(244,114,182,0.14), rgba(168,85,247,0.04))"
                                        : "transparent",
                                      border: subActive
                                        ? "1px solid rgba(244,114,182,0.28)"
                                        : "1px solid transparent",
                                      transitionDelay: isActive ? `${si * 60}ms` : "0ms",
                                      transform: isActive ? "translateX(0)" : "translateX(-8px)",
                                      opacity: isActive ? 1 : 0,
                                      transition: `transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, opacity 300ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, background 200ms, border-color 200ms`,
                                    }}
                                  >
                                    <span
                                      className="absolute -left-4 top-1/2 w-2 h-[1px]"
                                      style={{
                                        background: subActive
                                          ? "#f472b6"
                                          : "rgba(244,114,182,0.35)",
                                        transform: "translateY(-0.5px)",
                                      }}
                                    />
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{
                                        background: subActive
                                          ? "linear-gradient(135deg, #ff0080, #a855f7 50%, #00d4ff)"
                                          : "rgba(244,114,182,0.4)",
                                        boxShadow: subActive
                                          ? "0 0 8px rgba(244,114,182,0.6)"
                                          : "none",
                                      }}
                                    />
                                    <div
                                      className="text-[11px] font-semibold transition-colors"
                                      style={{
                                        color: subActive
                                          ? "#fbcfe8"
                                          : "rgba(251,207,232,0.7)",
                                      }}
                                    >
                                      {sub.label}
                                    </div>
                                  </Link>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bondly sub-items (emerald → cyan → indigo gradient) */}
                      {isBondly && item.children && item.children.length > 0 && (
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
                              {/* Emerald/cyan connector line */}
                              <div
                                className="absolute left-0 top-2 bottom-2 w-[1px]"
                                style={{
                                  background:
                                    "linear-gradient(180deg, rgba(16,185,129,0.55), rgba(6,182,212,0.25) 50%, rgba(99,102,241,0.12))",
                                }}
                              />
                              {item.children.map((sub, si) => {
                                const children = item.children!;
                                const matchingHrefs = children
                                  .filter(
                                    (c) =>
                                      pathname === c.href ||
                                      (c.href !== "/bondly/overview" &&
                                        pathname.startsWith(c.href + "/")),
                                  )
                                  .map((c) => c.href);
                                const bestMatch = matchingHrefs.reduce(
                                  (best, h) => (h.length > best.length ? h : best),
                                  "",
                                );
                                const subActive = sub.href === bestMatch;
                                const prevGroup = si > 0 ? item.children![si - 1].group : undefined;
                                const showGroupHeader = sub.group && sub.group !== prevGroup;
                                return (
                                  <div key={sub.href}>
                                    {showGroupHeader ? (
                                      <div
                                        className="relative flex items-center gap-2 px-2.5 pt-3 pb-1 select-none"
                                        style={{
                                          transform: isActive ? "translateX(0)" : "translateX(-8px)",
                                          opacity: isActive ? 1 : 0,
                                          transition: `transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, opacity 300ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms`,
                                        }}
                                      >
                                        <span
                                          className="text-[9px] font-semibold tracking-[0.18em] uppercase"
                                          style={{ color: "rgba(167,243,208,0.42)" }}
                                        >
                                          {sub.group}
                                        </span>
                                        <span
                                          className="flex-1 h-[1px]"
                                          style={{
                                            background:
                                              "linear-gradient(90deg, rgba(16,185,129,0.22), rgba(16,185,129,0) 80%)",
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                    <Link
                                      href={sub.href}
                                      onClick={() => setSidebarOpen(false)}
                                      className="group/sub relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-300"
                                      style={{
                                        background: subActive
                                          ? "linear-gradient(90deg, rgba(16,185,129,0.14), rgba(6,182,212,0.04))"
                                          : "transparent",
                                        border: subActive
                                          ? "1px solid rgba(16,185,129,0.28)"
                                          : "1px solid transparent",
                                        transitionDelay: isActive ? `${si * 60}ms` : "0ms",
                                        transform: isActive ? "translateX(0)" : "translateX(-8px)",
                                        opacity: isActive ? 1 : 0,
                                        transition: `transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, opacity 300ms cubic-bezier(0.16, 1, 0.3, 1) ${isActive ? si * 60 : 0}ms, background 200ms, border-color 200ms`,
                                      }}
                                    >
                                      <span
                                        className="absolute -left-4 top-1/2 w-2 h-[1px]"
                                        style={{
                                          background: subActive
                                            ? "#10b981"
                                            : "rgba(16,185,129,0.35)",
                                          transform: "translateY(-0.5px)",
                                        }}
                                      />
                                      <span
                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                        style={{
                                          background: subActive
                                            ? "linear-gradient(135deg, #10b981, #06b6d4 50%, #6366f1)"
                                            : "rgba(16,185,129,0.4)",
                                          boxShadow: subActive
                                            ? "0 0 8px rgba(16,185,129,0.6)"
                                            : "none",
                                        }}
                                      />
                                      <div
                                        className="text-[11px] font-semibold transition-colors"
                                        style={{
                                          color: subActive
                                            ? "#d1fae5"
                                            : "rgba(209,250,229,0.7)",
                                        }}
                                      >
                                        {sub.label}
                                      </div>
                                    </Link>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    </NavItemGate>
                  );
                }

                // ═══ Regular nav items ═══
                return (
                  <NavItemGate
                    key={item.href}
                    href={item.href}
                    childHrefs={item.children?.map((c) => c.href)}
                  >
                  <div>
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
                      {item.label === "NitroPixel" ? <PixelBrainSidebar size={28} /> : <svg
                        className={`w-5 h-5 flex-shrink-0 transition-colors duration-300 ${
                          isActive ? "text-nitro-orange" : "text-nitro-muted group-hover:text-nitro-text2"
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>}
                      {item.label}
                      {item.href === "/alertas" && <AlertsBadge />}
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
                  </NavItemGate>
                );
              })}
            </div>
            </NavGroupGate>
            );
          })}
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
            <span className="text-sm font-medium text-nitro-text2">{(session.user as any).organizationName || "Tu negocio"}</span>
            <span className="flex items-center gap-1.5 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-nitro-green animate-pulse-live" />
              <span className="font-mono text-[10px] text-nitro-muted uppercase tracking-widest">
                Live
              </span>
            </span>
          </div>

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
                  ? "flex-1 p-0 overflow-hidden bg-[#0a0a0f]"
                  : isAurumScroll
                  ? "flex-1 p-0 overflow-y-auto bg-[#0a0a0f]"
                  : isNitropixel
                  ? "flex-1 p-0 overflow-hidden bg-[#05060a]"
                  : (isJourneys || isPixelAttribution)
                  ? "flex-1 p-0 overflow-y-auto bg-[#05060a]"
                  : isAura
                  ? "flex-1 p-0 overflow-y-auto bg-[#05070d]"
                  : isAlertas
                  ? "flex-1 p-0 overflow-hidden bg-[#fafafa]"
                  : "flex-1 p-4 lg:p-6 bg-[#F7F8FA] overflow-y-auto"
              }
            >
              <PathnameGuard pathname={pathname}>
                {children}
              </PathnameGuard>
            </main>
          );
        })()}
      </div>
    </div>
    </AurumProvider>
    </PermissionsProvider>
  );
}
