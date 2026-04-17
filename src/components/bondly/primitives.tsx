// @ts-nocheck
"use client";

// ═══════════════════════════════════════════════════════════════════
// Bondly · primitives.tsx
// Primitivos visuales compartidos entre páginas del módulo Bondly.
// Todo lo que sea "bloque atómico" reutilizable (KpiTile, auroras,
// keyframes globales, tooltip, tier badge, trust strip) vive acá.
// Ninguna lógica de datos — solo UI pura.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { ES, TIER_CONFIG } from "./constants";

// ═══════════════════════════════════════════════════════════════════
// useCountUp — hook de animación para KPIs
// Cuenta de 0 al valor target con easeOutQuart + requestAnimationFrame.
// Se re-anima cuando cambia `target` desde el último renderizado.
// ═══════════════════════════════════════════════════════════════════
export function useCountUp(target: number, durationMs: number = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

// ═══════════════════════════════════════════════════════════════════
// BondlyKeyframes — inyecta los keyframes globales del módulo.
// Debe renderizarse 1 vez por página Bondly (típicamente cerca del
// cierre del root). Sin esto, los `animation: bondlyFadeSlideIn ...`
// no tienen efecto.
// ═══════════════════════════════════════════════════════════════════
export function BondlyKeyframes() {
  return (
    <style jsx global>{`
      @keyframes bondlyFadeSlideIn {
        0% { opacity: 0; transform: translateY(6px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes bondlySlideIn {
        0% { opacity: 0; transform: translateY(4px) scale(0.98); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes bondlyShimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes bondlyLivePulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.45); }
        50%      { box-shadow: 0 0 0 6px rgba(6,182,212,0.0); }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    `}</style>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BondlyAuroras — 3 radial-gradients blureados para hero sections.
// Uso: dentro de un contenedor `relative overflow-hidden`.
// Variantes:
//   - bondly (default) — emerald + indigo + cyan
//   - gold            — amber + orange (para paneles pLTV / VIP spotlight)
//   - vip             — purple + pink + orange (para secciones tier VIP)
// ═══════════════════════════════════════════════════════════════════
type AuroraVariant = "bondly" | "gold" | "vip";

const AURORA_PALETTES: Record<
  AuroraVariant,
  Array<{ style: React.CSSProperties; color: string; blur: number }>
> = {
  bondly: [
    {
      style: { top: "-30%", left: "-10%", width: "55%", height: "140%" },
      color: "rgba(16,185,129,0.18)",
      blur: 50,
    },
    {
      style: { top: "-20%", right: "-10%", width: "55%", height: "140%" },
      color: "rgba(99,102,241,0.15)",
      blur: 60,
    },
    {
      style: { bottom: "-50%", left: "30%", width: "40%", height: "100%" },
      color: "rgba(6,182,212,0.12)",
      blur: 60,
    },
  ],
  gold: [
    {
      style: { top: "-30%", left: "-10%", width: "55%", height: "140%" },
      color: "rgba(251,191,36,0.18)",
      blur: 50,
    },
    {
      style: { top: "-20%", right: "-10%", width: "55%", height: "140%" },
      color: "rgba(249,115,22,0.15)",
      blur: 60,
    },
    {
      style: { bottom: "-50%", left: "30%", width: "40%", height: "100%" },
      color: "rgba(245,158,11,0.12)",
      blur: 60,
    },
  ],
  vip: [
    {
      style: { top: "-30%", left: "-10%", width: "55%", height: "140%" },
      color: "rgba(168,85,247,0.18)",
      blur: 50,
    },
    {
      style: { top: "-20%", right: "-10%", width: "55%", height: "140%" },
      color: "rgba(236,72,153,0.15)",
      blur: 60,
    },
    {
      style: { bottom: "-50%", left: "30%", width: "40%", height: "100%" },
      color: "rgba(249,115,22,0.12)",
      blur: 60,
    },
  ],
};

export function BondlyAuroras({
  variant = "bondly",
}: {
  variant?: AuroraVariant;
}) {
  const palette = AURORA_PALETTES[variant] || AURORA_PALETTES.bondly;
  return (
    <div className="absolute inset-0 pointer-events-none">
      {palette.map((a, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            ...a.style,
            background: `radial-gradient(circle, ${a.color} 0%, transparent 60%)`,
            filter: `blur(${a.blur}px)`,
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KpiTile — la unidad atómica del dashboard Bondly.
// Props:
//   icon / iconBg / iconColor — identidad visual del KPI
//   label — UPPERCASE mono
//   value — número (se anima con useCountUp)
//   loading — si true, muestra shimmer skeleton
//   live — si true, muestra badge LIVE con pulse cyan
// ═══════════════════════════════════════════════════════════════════
export function KpiTile({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  loading,
  live,
}: {
  icon: any;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  loading?: boolean;
  live?: boolean;
}) {
  const displayValue = useCountUp(value || 0, 800);
  return (
    <div
      className="relative rounded-2xl bg-white p-5 overflow-hidden"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.04), 0 12px 30px -18px rgba(15,23,42,0.12)",
        animation: `bondlyFadeSlideIn 420ms ${ES}`,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: iconBg }}
        >
          <Icon size={16} style={{ color: iconColor }} strokeWidth={2.2} />
        </div>
        {live && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono tracking-[0.15em] uppercase"
            style={{
              background: "rgba(6,182,212,0.10)",
              color: "#0891b2",
              animation: `bondlyLivePulse 2.4s ${ES} infinite`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            LIVE
          </span>
        )}
      </div>
      <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-slate-400 mb-1">
        {label}
      </p>
      {loading ? (
        <div
          className="h-10 w-24 rounded bg-slate-100"
          style={{
            backgroundImage:
              "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
            backgroundSize: "200% 100%",
            animation: `bondlyShimmer 1.6s ease-in-out infinite`,
          }}
        />
      ) : (
        <p className="text-[32px] font-semibold tabular-nums tracking-tight text-slate-900 leading-none">
          {displayValue.toLocaleString("es-AR")}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TierBadge — pill con icono de tier (VIP, Loyal, Regular, …).
// Usa TIER_CONFIG para accent + icon + label.
// ═══════════════════════════════════════════════════════════════════
export function TierBadge({
  tier,
  size = "sm",
}: {
  tier: string;
  size?: "sm" | "md";
}) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.Regular;
  const Icon = cfg.icon;
  const px = size === "md" ? "px-2 py-1" : "px-1.5 py-0.5";
  const fontSize = size === "md" ? "text-[10px]" : "text-[9px]";
  const iconSize = size === "md" ? 11 : 9;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${px} ${fontSize} font-semibold tracking-[0.12em] uppercase flex-shrink-0`}
      style={{
        background: `${cfg.accent}12`,
        color: cfg.accent,
        border: `1px solid ${cfg.accent}22`,
      }}
    >
      <Icon size={iconSize} strokeWidth={2.4} />
      {cfg.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// InfoTip — disclosure "Cómo se calcula" con tooltip dark premium.
// El label queda visible siempre (pequeño, mono, zinc) y el content
// aparece en hover/focus con fade-slide. Accesible via keyboard.
// ═══════════════════════════════════════════════════════════════════
export function InfoTip({
  label = "Cómo se calcula",
  content,
  align = "left",
}: {
  label?: string;
  content: React.ReactNode;
  align?: "left" | "center" | "right";
}) {
  const [open, setOpen] = useState(false);
  const alignClass =
    align === "center"
      ? "left-1/2 -translate-x-1/2"
      : align === "right"
      ? "right-0"
      : "left-0";
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center gap-1 text-[10px] font-mono tracking-[0.18em] uppercase text-slate-400 hover:text-slate-600 focus:outline-none focus:text-slate-700"
        style={{ transition: `color 200ms ${ES}` }}
      >
        <Info size={11} />
        {label}
      </button>
      {open && (
        <div
          role="tooltip"
          className={`absolute z-50 top-full mt-2 ${alignClass} w-[320px] rounded-xl p-3 text-xs leading-relaxed text-zinc-300`}
          style={{
            background: "rgba(24,24,27,0.95)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 12px 30px -10px rgba(0,0,0,0.5)",
            animation: `bondlyFadeSlideIn 260ms ${ES}`,
          }}
        >
          {content}
        </div>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BondlyTrustStrip — strip fina debajo de paneles predictivos.
// Muestra "Compatible con Meta · Google" + "Basado en investigación
// de Wharton" con logos grayscale + tooltips on hover.
//
// IMPORTANTE: leyendas 100% verdaderas y defendibles legalmente.
//   - "Compatible con" = Bondly sincroniza datos a esas plataformas.
//   - "Basado en investigación de" = los modelos BG/NBD + Gamma-Gamma
//      son de Fader & Hardie (Wharton).
// Nunca decir "endorsed by" / "validated by" / "powered by".
//
// Variantes:
//   - predictive-post — tooltips adaptados a pLTV post-compra
//   - predictive-pre  — tooltips adaptados a behavioral pre-compra
// ═══════════════════════════════════════════════════════════════════
export function BondlyTrustStrip({
  variant = "predictive-post",
}: {
  variant?: "predictive-post" | "predictive-pre";
}) {
  const metaTooltip =
    variant === "predictive-post"
      ? "Bondly sincroniza LTV predicho con Meta Conversion API y Value Optimization. Meta usa modelos predictivos equivalentes en su propia plataforma de ads."
      : "Bondly construye audiencias de alto score para Meta Conversion API y Lookalike Audiences. Meta usa modelos predictivos equivalentes en su propia plataforma de ads.";
  const googleTooltip =
    variant === "predictive-post"
      ? "Bondly sincroniza LTV predicho con Google Ads Customer Match y el pLTV Sandbox de Google Ads. Google usa modelos predictivos equivalentes en su propia plataforma."
      : "Bondly construye audiencias de alto score para Google Ads Customer Match. Google usa modelos predictivos equivalentes en su propia plataforma.";
  const whartonTooltip =
    "Fader & Hardie (2005, 2013) — modelos probabilísticos BG/NBD y Gamma-Gamma, el estándar académico para predicción de LTV.";

  return (
    <div
      className="pt-4 mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
      style={{ borderTop: "1px solid rgba(15,23,42,0.06)" }}
    >
      <div className="flex items-center gap-5">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-medium">
          Compatible con
        </span>
        <TrustLogo
          src="/trust/meta.svg"
          alt="Meta"
          tooltip={metaTooltip}
        />
        <span className="text-slate-300 select-none">·</span>
        <TrustLogo
          src="/trust/google.svg"
          alt="Google"
          tooltip={googleTooltip}
        />
      </div>
      <div className="flex items-center gap-5">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-medium">
          Basado en investigación de
        </span>
        <TrustLogo
          src="/trust/wharton.svg"
          alt="Wharton School of Business"
          tooltip={whartonTooltip}
        />
      </div>
    </div>
  );
}

function TrustLogo({
  src,
  alt,
  tooltip,
}: {
  src: string;
  alt: string;
  tooltip: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-4 w-auto select-none"
        draggable={false}
        style={{
          filter: "grayscale(1) brightness(0.7)",
          opacity: hover ? 1 : 0.5,
          transform: hover ? "translateY(-1px)" : "translateY(0)",
          transition: `all 300ms ${ES}`,
        }}
      />
      {hover && (
        <div
          role="tooltip"
          className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-[300px] rounded-xl p-3 text-xs leading-relaxed text-zinc-300"
          style={{
            background: "rgba(24,24,27,0.95)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 12px 30px -10px rgba(0,0,0,0.5)",
            animation: `bondlyFadeSlideIn 260ms ${ES}`,
          }}
        >
          {tooltip}
        </div>
      )}
    </span>
  );
}
