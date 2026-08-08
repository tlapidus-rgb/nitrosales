"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Contenido · Aprobaciones (inbox)
// ═══════════════════════════════════════════════════════════════
// Muestra las submissions pendientes de revisión con acciones rápidas:
// Aprobar, Pedir cambios, Rechazar. Filtros por status/platform.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Inbox,
  Search,
  CheckCircle2,
  RotateCw,
  XCircle,
  ExternalLink,
  Image as ImageIcon,
  ChevronRight,
  Clock,
  X,
} from "lucide-react";

const THEME = {
  bgCard: "rgb(var(--ent-elevated))",
  border: "rgb(var(--ent-hairline))",
  borderStrong: "rgb(var(--ent-hairline-2))",
  textPrimary: "rgb(var(--ent-ink))",
  textSecondary: "rgb(var(--ent-ink-60))",
  textTertiary: "rgb(var(--ent-ink-40))",
  textMuted: "rgb(var(--ent-ink-40))",
  ink: "rgb(var(--ent-ink))",
  inkSoft: "rgba(28,27,24,0.06)",
  inkBorder: "rgba(28,27,24,0.16)",
  accent: "rgb(var(--ent-accent))",
  accentSoft: "rgba(47,145,83,0.10)",
  accentBorder: "rgba(47,145,83,0.28)",
  amber: "rgb(var(--ent-amber))",
  amberSoft: "rgba(201,138,26,0.10)",
  amberBorder: "rgba(201,138,26,0.28)",
  danger: "#b91c1c",
  dangerSoft: "rgba(185,28,28,0.08)",
  dangerBorder: "rgba(185,28,28,0.24)",
};

type Sub = {
  id: string;
  type: string;
  platform: string;
  contentUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  notes: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  isUGC: boolean;
  influencer: { id: string; name: string; code: string; profileImage: string | null } | null;
  briefing: { id: string; title: string; type: string } | null;
};

type Totals = { count: number; pending: number; approved: number; revision: number; rejected: number };

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDING: { label: "Por revisar", color: THEME.amber, bg: THEME.amberSoft, border: THEME.amberBorder },
  APPROVED: { label: "Aprobado", color: THEME.accent, bg: THEME.accentSoft, border: THEME.accentBorder },
  REVISION: { label: "Revisión", color: THEME.amber, bg: THEME.amberSoft, border: THEME.amberBorder },
  REJECTED: { label: "Rechazado", color: THEME.danger, bg: THEME.dangerSoft, border: THEME.dangerBorder },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AprobacionesPage() {
  const [rows, setRows] = useState<Sub[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "APPROVED" | "REVISION" | "REJECTED" | "all">("PENDING");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("status", statusFilter);
      const res = await fetch(`/api/aura/submissions/list?${params}`, { cache: "no-store" });
      const data = await res.json();
      setRows(data.items || []);
      setTotals(data.totals || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statusFilter]);

  const review = async (id: string, status: string, reviewNotes?: string) => {
    await fetch(`/api/aura/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNotes: reviewNotes || null }),
    });
    load();
  };

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* BREADCRUMB */}
        <div className="mb-3 flex items-center gap-1.5 text-[11px]" style={{ color: THEME.textMuted }}>
          <Link href="/aura/contenido" className="hover:underline">Contenido</Link>
          <ChevronRight size={12} />
          <span style={{ color: THEME.textSecondary }}>Aprobaciones</span>
        </div>

        {/* HEADER */}
        <header className="mb-6">
          <div className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2" style={{ color: THEME.textMuted }}>
            Aura · Contenido
          </div>
          <h1 className="text-[32px] font-semibold tracking-tight leading-none mb-2 text-ink">
            Aprobaciones
          </h1>
          <p className="text-[13px]" style={{ color: THEME.textSecondary }}>
            Revisá el contenido que enviaron los creadores. Aprobá, pedí cambios o rechazá con feedback.
          </p>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <MiniKpi label="Por revisar" value={totals?.pending ?? 0} color={THEME.amber} />
          <MiniKpi label="Aprobados" value={totals?.approved ?? 0} color={THEME.accent} />
          <MiniKpi label="En revisión" value={totals?.revision ?? 0} color={THEME.amber} />
          <MiniKpi label="Rechazados" value={totals?.rejected ?? 0} color={THEME.danger} />
        </div>

        {/* FILTROS */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-[240px]"
            style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
          >
            <Search size={14} style={{ color: THEME.textMuted }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por caption o notas…"
              className="bg-transparent outline-none flex-1 text-[13px]"
              style={{ color: THEME.textPrimary }}
            />
          </div>
          {(["PENDING", "REVISION", "APPROVED", "REJECTED", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-2 rounded-xl text-[12px] font-medium tracking-tight"
              style={{
                background: statusFilter === s ? THEME.inkSoft : THEME.bgCard,
                color: statusFilter === s ? THEME.ink : THEME.textSecondary,
                border: `1px solid ${statusFilter === s ? THEME.inkBorder : THEME.border}`,
              }}
            >
              {s === "all" ? "Todos" : STATUS_CFG[s]?.label ?? s}
            </button>
          ))}
        </div>

        {/* LISTA */}
        {loading ? (
          <div className="py-20 text-center" style={{ color: THEME.textMuted }}>
            Cargando…
          </div>
        ) : rows.length === 0 ? (
          <div
            className="py-16 text-center rounded-2xl"
            style={{ background: THEME.bgCard, border: `1px dashed ${THEME.border}` }}
          >
            <Inbox size={28} style={{ color: THEME.textMuted }} className="mx-auto mb-3" />
            <div className="text-[15px] font-semibold mb-1" style={{ color: THEME.textPrimary }}>
              Inbox vacío
            </div>
            <div className="text-[13px]" style={{ color: THEME.textSecondary }}>
              No hay envíos en este estado por ahora.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((s) => (
              <SubRow key={s.id} s={s} onReview={review} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}>
      <div className="text-[10.5px] tracking-[0.1em] uppercase font-medium" style={{ color: THEME.textMuted }}>
        {label}
      </div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function SubRow({ s, onReview }: { s: Sub; onReview: (id: string, status: string, notes?: string) => void }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const cfg = STATUS_CFG[s.status] ?? STATUS_CFG.PENDING;

  const handleAction = (action: string) => {
    if (action === "REVISION" || action === "REJECTED") {
      setPendingAction(action);
      setNotesOpen(true);
    } else {
      onReview(s.id, action);
    }
  };
  const submitWithNotes = () => {
    if (pendingAction) onReview(s.id, pendingAction, notes);
    setNotesOpen(false);
    setNotes("");
    setPendingAction(null);
  };

  return (
    <div className="p-4 rounded-2xl" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}>
      <div className="flex items-start gap-4">
        <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0"
          style={{ background: "rgb(var(--ent-surface))", border: `1px solid ${THEME.border}` }}>
          {s.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon size={22} style={{ color: THEME.textMuted }} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold"
              style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              {cfg.label}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px]"
              style={{ color: THEME.textSecondary, background: "rgb(var(--ent-surface))", border: `1px solid ${THEME.border}` }}
            >
              {s.platform} · {s.type}
            </span>
            {s.isUGC ? (
              <span className="text-[10px] px-2 py-[2px] rounded-full" style={{ color: THEME.ink, background: THEME.inkSoft }}>
                UGC
              </span>
            ) : null}
            {s.briefing ? (
              <Link
                href={`/aura/contenido/briefings/${s.briefing.id}`}
                className="text-[10.5px] px-2 py-[2px] rounded-full hover:underline"
                style={{ color: THEME.ink, background: THEME.inkSoft, border: `1px solid ${THEME.inkBorder}` }}
              >
                {s.briefing.title}
              </Link>
            ) : null}
          </div>
          {s.caption ? (
            <div className="text-[13px] line-clamp-2 mb-1" style={{ color: THEME.textPrimary }}>
              {s.caption}
            </div>
          ) : null}
          <div className="text-[11px] flex items-center gap-2" style={{ color: THEME.textTertiary }}>
            {s.influencer ? (
              <Link href={`/aura/creadores/${s.influencer.id}`} className="inline-flex items-center gap-1 hover:underline">
                <Avatar name={s.influencer.name} url={s.influencer.profileImage} size={16} />
                {s.influencer.name}
              </Link>
            ) : null}
            <span>·</span>
            <span>
              <Clock size={10} className="inline -mt-0.5 mr-0.5" />
              {fmtDateTime(s.createdAt)}
            </span>
          </div>
          {s.reviewNotes ? (
            <div
              className="text-[11.5px] mt-2 p-2 rounded-lg"
              style={{ color: THEME.textSecondary, background: "rgb(var(--ent-surface))", border: `1px solid ${THEME.border}` }}
            >
              💬 {s.reviewNotes}
            </div>
          ) : null}
        </div>

        {s.contentUrl ? (
          <a
            href={s.contentUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-lg flex-shrink-0"
            style={{ color: THEME.textSecondary, background: "rgb(var(--ent-surface))" }}
            title="Ver contenido"
          >
            <ExternalLink size={14} />
          </a>
        ) : null}
      </div>

      {(s.status === "PENDING" || s.status === "REVISION") ? (
        <div className="mt-3 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: `1px solid ${THEME.border}` }}>
          <button
            onClick={() => handleAction("APPROVED")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: THEME.accent, background: THEME.accentSoft, border: `1px solid ${THEME.accentBorder}` }}
          >
            <CheckCircle2 size={12} strokeWidth={2.4} />
            Aprobar
          </button>
          <button
            onClick={() => handleAction("REVISION")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: THEME.amber, background: THEME.amberSoft, border: `1px solid ${THEME.amberBorder}` }}
          >
            <RotateCw size={12} strokeWidth={2.4} />
            Pedir cambios
          </button>
          <button
            onClick={() => handleAction("REJECTED")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: THEME.danger, background: THEME.dangerSoft, border: `1px solid ${THEME.dangerBorder}` }}
          >
            <XCircle size={12} strokeWidth={2.4} />
            Rechazar
          </button>
        </div>
      ) : null}

      {notesOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(28,27,24,0.45)" }}
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{ background: THEME.bgCard, border: `1px solid ${THEME.borderStrong}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-[16px] font-semibold" style={{ color: THEME.textPrimary }}>
                {pendingAction === "REVISION" ? "Pedir cambios" : "Rechazar contenido"}
              </h3>
              <button onClick={() => setNotesOpen(false)} style={{ color: THEME.textMuted }}>
                <X size={16} />
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Explicá el feedback que recibe el creador…"
              className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px] resize-none"
              style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setNotesOpen(false)}
                className="px-3 py-2 rounded-xl text-[12px]"
                style={{ color: THEME.textSecondary, background: "rgb(var(--ent-surface))" }}
              >
                Cancelar
              </button>
              <button
                onClick={submitWithNotes}
                className="px-3 py-2 rounded-xl text-[12px] font-semibold"
                style={{
                  color: pendingAction === "REVISION" ? THEME.amber : THEME.danger,
                  background: pendingAction === "REVISION" ? THEME.amberSoft : THEME.dangerSoft,
                  border: `1px solid ${pendingAction === "REVISION" ? THEME.amberBorder : THEME.dangerBorder}`,
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({ name, url, size = 20 }: { name: string; url: string | null; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).filter(Boolean).join("").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size, border: `1px solid ${THEME.border}` }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        background: THEME.inkSoft,
        color: THEME.ink,
        fontSize: size * 0.45,
        border: `1px solid ${THEME.inkBorder}`,
      }}
    >
      {initials}
    </div>
  );
}
