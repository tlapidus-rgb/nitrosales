// ══════════════════════════════════════════════════════════════════════════
// Design system "enterprise" — primitivas (inspo AppStack, feedback Tomy)
// ══════════════════════════════════════════════════════════════════════════
// Warm-neutral, casi monocromo + 1 acento verde apagado usado SOLO en status.
// Tokens en tailwind.config (ink / canvas / surface / hairline / accent, Geist).
// Ver design-appstack-enterprise.local.md. Sobrio > maximalista: cero glow.
// ══════════════════════════════════════════════════════════════════════════
"use client";

import { useEffect, useState, type ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// ── Button ─────────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "ghost" | "subtle";
export function Button({
  variant = "primary",
  className = "",
  ...props
}: { variant?: BtnVariant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-2 font-geist text-sm font-medium tracking-[-.01em] rounded-xl px-4 py-2 " +
    "transition-all duration-150 ease-ent active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-ink text-white hover:bg-ink/90",
    ghost: "bg-white text-ink border border-hairline-2 hover:bg-surface",
    subtle: "text-ink-60 hover:text-ink hover:bg-surface",
  };
  return <button className={cx(base, variants[variant], className)} {...props} />;
}

// ── Card ───────────────────────────────────────────────────────────────────
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("bg-white rounded-2xl border border-hairline shadow-ent-xs overflow-hidden", className)}>
      {children}
    </div>
  );
}
export function CardHeader({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-hairline">
      <h3 className="font-geist text-sm font-semibold text-ink tracking-[-.01em]">{title}</h3>
      {aside && <div className="font-geistmono text-[11px] text-ink-40">{aside}</div>}
    </div>
  );
}
export function CardBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={cx("p-5", className)}>{children}</div>;
}

// ── Badge ──────────────────────────────────────────────────────────────────
type BadgeTone = "neutral" | "accent" | "amber";
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-surface-2 text-ink-60",
    accent: "bg-accent-soft text-accent border border-accent/20",
    amber: "bg-[#f6edd8] text-[#8a5e12]",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-geist text-xs font-medium rounded-full px-2.5 py-1", tones[tone])}>
      {tone === "accent" && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
      {children}
    </span>
  );
}

// ── Stat (KPI tile) ─────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  delta,
  deltaUp,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
}) {
  return (
    <div className="flex-1 min-w-[150px]">
      <div className="font-geistmono text-[11px] uppercase tracking-[.08em] text-ink-40">{label}</div>
      <div className="font-geist text-[1.7rem] font-medium tracking-[-.03em] text-ink tabular-nums mt-1.5">{value}</div>
      {delta && (
        <div className={cx("text-xs tabular-nums mt-0.5", deltaUp ? "text-accent" : "text-ink-40")}>{delta}</div>
      )}
    </div>
  );
}

// ── LivePulse — el "chiche" que pidió Tomy: el píxel mide en vivo ────────────
// Sobrio: respiración lenta (2.4s) en el acento, SOLO en LIVE. reduced-motion →
// sin ring (punto sólido + label). Se pausa cuando la pestaña está oculta.
type LiveStatus = "LIVE" | "ACTIVE" | "INACTIVE";
export function LivePulse({ status = "LIVE", label }: { status?: LiveStatus; label?: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  if (status === "LIVE") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft pl-2.5 pr-3 py-1">
        <span className="relative inline-flex w-2 h-2 items-center justify-center">
          {!hidden && (
            <span className="absolute inline-flex w-2 h-2 rounded-full bg-accent animate-live-pulse motion-reduce:hidden" />
          )}
          <span className="relative inline-flex w-2 h-2 rounded-full bg-accent" />
        </span>
        <span className="font-geistmono text-[10px] tracking-[.1em] uppercase text-accent">{label || "En vivo"}</span>
      </span>
    );
  }
  const dot = status === "ACTIVE" ? "bg-live-amber" : "bg-ink-40";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx("w-2 h-2 rounded-full", dot)} />
      <span className="font-geistmono text-[10px] tracking-[.06em] text-ink-60">{label || (status === "ACTIVE" ? "Activo" : "Sin datos")}</span>
    </span>
  );
}
