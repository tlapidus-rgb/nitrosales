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
      // Aurum oculto por pedido de Tomy (reunión 08/07/26): no se muestra en
      // ningún lado pero NO se elimina — reactivar descomentando este item.
      // {
      //   href: "/chat",
      //   label: "Aurum",
      //   icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4v12M8 10l4-4 4 4M8 14l4 4 4-4",
      //   premium: { badge: "INTELLIGENCE", badgeColor: "#fbbf24", glowColor: "rgba(251,191,36,0.22)", description: "Inteligencia dorada del negocio" },
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
    <OnboardingGate>
    <PermissionsProvider>
    <AurumProvider>
    <div className={`${GeistSans.variable} ${GeistMono.variable} font-geist h-screen bg-canvas text-ink flex overflow-hidden`}>
      {/* Aurum oculto por pedido de Tomy (reunión 08/07/26): botón flotante
          desactivado. El provider/contexto queda para reactivar sin romper nada. */}
      {/* <FloatingAurum /> */}
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
      {/* Sidebar — sobrio, siempre expandido (design system enterprise) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[248px] bg-surface flex flex-col border-r border-hairline transition-transform duration-300 ease-ent lg:translate-x-0 lg:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-4 h-14 shrink-0 flex items-center gap-2.5 border-b border-hairline">
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
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
