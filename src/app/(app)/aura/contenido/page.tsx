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

// Nota: accent se usa como `${accent}1a` / `${accent}44` (alpha-hex suffix),
// así que estos valores deben quedar como hex planos de 6 dígitos.
const THEME = {
  bgCard: "rgb(var(--ent-elevated))",
  bgSoft: "rgb(var(--ent-surface))",
  border: "rgb(var(--ent-hairline))",
  borderStrong: "rgb(var(--ent-hairline-2))",
  textPrimary: "rgb(var(--ent-ink))",
  textSecondary: "rgb(var(--ent-ink-60))",
  textTertiary: "rgb(var(--ent-ink-40))",
  textMuted: "rgb(var(--ent-ink-40))",
  ink: "#1C1B18",
  inkSoft: "rgba(28,27,24,0.06)",
  inkBorder: "rgba(28,27,24,0.16)",
  accentHex: "#2F9153",
  amber: "#C98A1A",
  amberSoft: "rgba(201,138,26,0.10)",
  amberBorder: "rgba(201,138,26,0.28)",
  danger: "#B91C1C",
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
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* HEADER */}
        <header className="mb-8">
          <div className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2" style={{ color: THEME.textMuted }}>
            Aura · Contenido
          </div>
          <h1 className="text-[34px] font-semibold tracking-tight leading-none mb-3 text-ink">
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
            accent={THEME.ink}
            icon={<ClipboardList size={16} strokeWidth={2.2} />}
          />
          <Kpi
            label="Briefings completados"
            value={briefTotals?.completed ?? "—"}
            accent={THEME.accentHex}
            icon={<CheckCircle2 size={16} strokeWidth={2.2} />}
          />
          <Kpi
            label="Por aprobar"
            value={subTotals?.pending ?? "—"}
            accent={THEME.amber}
            icon={<Inbox size={16} strokeWidth={2.2} />}
            urgent={(subTotals?.pending ?? 0) > 0}
          />
          <Kpi
            label="Aprobados"
            value={subTotals?.approved ?? "—"}
            accent={THEME.accentHex}
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
            accent={THEME.ink}
            cta="Ver briefings"
          />
          <NavCard
            href="/aura/contenido/aprobaciones"
            title="Aprobaciones"
            description="Revisá el contenido que los creadores enviaron. Aprobá, pedí revisiones o rechazá con feedback."
            icon={<Inbox size={20} strokeWidth={2.2} />}
            count={subTotals?.pending ?? 0}
            countLabel="por revisar"
            accent={THEME.amber}
            cta="Revisar inbox"
            urgent={(subTotals?.pending ?? 0) > 0}
          />
        </div>

        {/* CTA rápido */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/aura/contenido/briefings?new=1"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold tracking-tight bg-ink text-white"
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
        border: `1px solid ${urgent ? THEME.amberBorder : THEME.border}`,
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
            style={{ color: THEME.amber, background: THEME.amberSoft, border: `1px solid ${THEME.amberBorder}` }}>
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
        border: `1px solid ${urgent ? THEME.amberBorder : THEME.border}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = urgent ? THEME.amber : THEME.borderStrong;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = urgent ? THEME.amberBorder : THEME.border;
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
