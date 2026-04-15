"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Contenido (overview)
// ───────────────────────────────────────────────────────────────
// Hub de contenido con 2 tabs hijos:
//   - Briefings (qué les pedimos producir)
//   - Aprobaciones (qué publicaron y hay que revisar)
// Muestra KPIs globales de ambos + accesos rápidos.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  Plus,
  ArrowRight,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

const THEME = {
  bgPage: "#0a0a14",
  bgCard: "rgba(255, 255, 255, 0.03)",
  bgSoft: "rgba(255, 255, 255, 0.02)",
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#f5f5f7",
  textSecondary: "rgba(245, 245, 247, 0.62)",
  textTertiary: "rgba(245, 245, 247, 0.42)",
  textMuted: "rgba(245, 245, 247, 0.32)",
  gold: "#ff0080",
  goldSoft: "rgba(255, 0, 128, 0.10)",
  goldBorder: "rgba(255, 0, 128, 0.28)",
  purple: "#a855f7",
  purpleSoft: "rgba(168, 85, 247, 0.10)",
  purpleBorder: "rgba(168, 85, 247, 0.28)",
  cyan: "#00d4ff",
  cyanSoft: "rgba(0, 212, 255, 0.10)",
  cyanBorder: "rgba(0, 212, 255, 0.28)",
  green: "#4ade80",
  greenSoft: "rgba(74, 222, 128, 0.10)",
  greenBorder: "rgba(74, 222, 128, 0.28)",
  rose: "#ff6b8a",
  roseSoft: "rgba(255, 107, 138, 0.10)",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
};

type BriefTotals = { count: number; active: number; completed: number; pendingSubmissions: number };
type SubTotals = { count: number; pending: number; approved: number; revision: number; rejected: number };

export default function ContenidoOverviewPage() {
  const [briefTotals, setBriefTotals] = useState<BriefTotals | null>(null);
  const [subTotals, setSubTotals] = useState<SubTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const [b, s] = await Promise.all([
          fetch("/api/aura/briefings/list?status=ACTIVE", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/aura/submissions/list?status=PENDING", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (aborted) return;
        setBriefTotals(b.totals || null);
        setSubTotals(s.totals || null);
      } catch (e) {
        // silenciar
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  return (
    <div className="min-h-screen" style={{ background: THEME.bgPage }}>
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* HEADER */}
        <header className="mb-8">
          <div className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2" style={{ color: THEME.textMuted }}>
            Aura · Contenido
          </div>
          <h1
            className="text-[34px] font-semibold tracking-tight leading-none mb-3"
            style={{
              background: THEME.gradientText,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Contenido
          </h1>
          <p className="text-[14px] max-w-2xl" style={{ color: THEME.textSecondary }}>
            Acá pedís contenido (briefings) y revisás lo que publican los creadores. Todo lo que se apruebe queda
            registrado para reporting y pagos.
          </p>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Kpi
            label="Briefings activos"
            value={briefTotals?.active ?? "—"}
            accent={THEME.purple}
            icon={<ClipboardList size={16} strokeWidth={2.2} />}
          />
          <Kpi
            label="Briefings completados"
            value={briefTotals?.completed ?? "—"}
            accent={THEME.green}
            icon={<CheckCircle2 size={16} strokeWidth={2.2} />}
          />
          <Kpi
            label="Por aprobar"
            value={subTotals?.pending ?? "—"}
            accent={THEME.gold}
            icon={<Inbox size={16} strokeWidth={2.2} />}
            urgent={(subTotals?.pending ?? 0) > 0}
          />
          <Kpi
            label="Aprobados"
            value={subTotals?.approved ?? "—"}
            accent={THEME.cyan}
            icon={<Sparkles size={16} strokeWidth={2.2} />}
          />
        </div>

        {/* CARDS DE NAVEGACIÓN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NavCard
            href="/aura/contenido/briefings"
            title="Briefings"
            description="Creá y gestioná lo que tus creadores tienen que producir: hashtags, menciones, do's y don'ts, deadlines."
            icon={<FileText size={20} strokeWidth={2.2} />}
            count={briefTotals?.active ?? 0}
            countLabel="activos"
            accent={THEME.purple}
            cta="Ver briefings"
          />
          <NavCard
            href="/aura/contenido/aprobaciones"
            title="Aprobaciones"
            description="Revisá el contenido que los creadores enviaron. Aprobá, pedí revisiones o rechazá con feedback."
            icon={<Inbox size={20} strokeWidth={2.2} />}
            count={subTotals?.pending ?? 0}
            countLabel="por revisar"
            accent={THEME.gold}
            cta="Revisar inbox"
            urgent={(subTotals?.pending ?? 0) > 0}
          />
        </div>

        {/* CTA rápido */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/aura/contenido/briefings?new=1"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold tracking-tight"
            style={{
              background: "linear-gradient(135deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
              color: "#FFF",
              boxShadow: "0 4px 20px rgba(244,114,182,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <Plus size={14} strokeWidth={2.4} />
            Nuevo briefing
          </Link>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  icon,
  urgent,
}: {
  label: string;
  value: number | string;
  accent: string;
  icon: React.ReactNode;
  urgent?: boolean;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${urgent ? THEME.goldBorder : THEME.border}`,
      }}
    >
      <div className="flex items-center gap-2 mb-2" style={{ color: accent }}>
        {icon}
        <span className="text-[10.5px] tracking-[0.12em] uppercase font-medium" style={{ color: THEME.textMuted }}>
          {label}
        </span>
      </div>
      <div className="text-[26px] font-semibold tracking-tight tabular-nums" style={{ color: THEME.textPrimary }}>
        {value}
        {urgent && typeof value === "number" && value > 0 ? (
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] align-middle px-1.5 py-[2px] rounded-full"
            style={{ color: THEME.gold, background: THEME.goldSoft, border: `1px solid ${THEME.goldBorder}` }}>
            <AlertTriangle size={10} strokeWidth={2.4} /> urge
          </span>
        ) : null}
      </div>
    </div>
  );
}

function NavCard({
  href,
  title,
  description,
  icon,
  count,
  countLabel,
  accent,
  cta,
  urgent,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  countLabel: string;
  accent: string;
  cta: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block p-6 rounded-2xl transition-all hover:-translate-y-0.5"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${urgent ? THEME.goldBorder : THEME.border}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = urgent ? THEME.gold : THEME.borderStrong;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = urgent ? THEME.goldBorder : THEME.border;
      }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}1a`, color: accent, border: `1px solid ${accent}44` }}
        >
          {icon}
        </div>
        <div className="text-right">
          <div className="text-[26px] font-semibold tracking-tight tabular-nums" style={{ color: THEME.textPrimary }}>
            {count}
          </div>
          <div className="text-[10.5px] tracking-[0.1em] uppercase font-medium" style={{ color: THEME.textMuted }}>
            {countLabel}
          </div>
        </div>
      </div>
      <div className="text-[18px] font-semibold tracking-tight mb-1.5" style={{ color: THEME.textPrimary }}>
        {title}
      </div>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: THEME.textSecondary }}>
        {description}
      </p>
      <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: accent }}>
        {cta}
        <ArrowRight size={12} strokeWidth={2.4} />
      </div>
    </Link>
  );
}
