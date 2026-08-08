"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Contenido · Briefings (lista + crear)
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ClipboardList,
  Calendar,
  ChevronRight,
  X,
} from "lucide-react";

const THEME = {
  bgCard: "rgb(var(--ent-elevated))",
  bgSoft: "rgb(var(--ent-surface))",
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

type Brief = {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  deadline: string | null;
  hashtags: string | null;
  mentions: string | null;
  createdAt: string;
  influencer: { id: string; name: string; code: string; profileImage: string | null } | null;
  campaign: { id: string; name: string; status: string } | null;
  totalSubmissions: number;
  pendingSubmissions: number;
  approvedSubmissions: number;
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ACTIVE: { label: "Activo", color: THEME.accent, bg: THEME.accentSoft, border: THEME.accentBorder },
  COMPLETED: { label: "Completado", color: THEME.textSecondary, bg: THEME.bgSoft, border: THEME.border },
  CANCELLED: { label: "Cancelado", color: THEME.textMuted, bg: THEME.bgSoft, border: THEME.border },
};

const TYPE_CFG: Record<string, string> = {
  GENERAL: "General",
  UGC: "UGC",
  REVIEW: "Review",
  UNBOXING: "Unboxing",
  TUTORIAL: "Tutorial",
  STORY: "Story",
};

function fmtDate(iso: string | null) {
  if (!iso) return "Sin deadline";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function BriefingsListPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <BriefingsListInner />
    </Suspense>
  );
}

function BriefingsListInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "COMPLETED" | "CANCELLED" | "all">("ACTIVE");
  const [sort, setSort] = useState<"recent" | "deadline" | "pending">("recent");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (sp.get("new") === "1") setShowNew(true);
  }, [sp]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("status", statusFilter);
      params.set("sort", sort);
      const res = await fetch(`/api/aura/briefings/list?${params}`, { cache: "no-store" });
      const data = await res.json();
      setRows(data.briefings || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statusFilter, sort]);

  const empty = !loading && rows.length === 0;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* BREADCRUMB */}
        <div className="mb-3 flex items-center gap-1.5 text-[11px]" style={{ color: THEME.textMuted }}>
          <Link href="/aura/contenido" className="hover:underline">
            Contenido
          </Link>
          <ChevronRight size={12} />
          <span style={{ color: THEME.textSecondary }}>Briefings</span>
        </div>

        {/* HEADER */}
        <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2" style={{ color: THEME.textMuted }}>
              Aura · Contenido
            </div>
            <h1 className="text-[32px] font-semibold tracking-tight leading-none text-ink">
              Briefings
            </h1>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold tracking-tight bg-ink text-white"
          >
            <Plus size={14} strokeWidth={2.4} />
            Nuevo briefing
          </button>
        </header>

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
              placeholder="Buscar por título o descripción…"
              className="bg-transparent outline-none flex-1 text-[13px]"
              style={{ color: THEME.textPrimary }}
            />
          </div>
          {(["ACTIVE", "COMPLETED", "CANCELLED", "all"] as const).map((s) => (
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
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="px-3 py-2 rounded-xl text-[12px] font-medium tracking-tight outline-none"
            style={{
              background: THEME.bgCard,
              color: THEME.textSecondary,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <option value="recent">Más recientes</option>
            <option value="deadline">Por deadline</option>
            <option value="pending">Con más pendientes</option>
          </select>
        </div>

        {/* LISTA */}
        {loading ? (
          <div className="py-20 text-center" style={{ color: THEME.textMuted }}>
            Cargando…
          </div>
        ) : empty ? (
          <div
            className="py-16 text-center rounded-2xl"
            style={{ background: THEME.bgCard, border: `1px dashed ${THEME.border}` }}
          >
            <ClipboardList size={28} style={{ color: THEME.textMuted }} className="mx-auto mb-3" />
            <div className="text-[15px] font-semibold mb-1" style={{ color: THEME.textPrimary }}>
              Todavía no hay briefings
            </div>
            <div className="text-[13px] mb-5" style={{ color: THEME.textSecondary }}>
              Creá el primero para pedirle contenido a un creador.
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-ink text-white"
            >
              <Plus size={14} strokeWidth={2.4} /> Crear briefing
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows.map((b) => (
              <BriefCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </div>

      {showNew ? (
        <NewBriefingModal
          onClose={() => {
            setShowNew(false);
            // limpiar query param si estaba
            if (sp.get("new")) router.replace("/aura/contenido/briefings");
          }}
          onCreated={() => {
            setShowNew(false);
            load();
            if (sp.get("new")) router.replace("/aura/contenido/briefings");
          }}
        />
      ) : null}
    </div>
  );
}

function BriefCard({ b }: { b: Brief }) {
  const cfg = STATUS_CFG[b.status] ?? STATUS_CFG.ACTIVE;
  const days = daysUntil(b.deadline);
  const urgent = days !== null && days >= 0 && days <= 3;
  const overdue = days !== null && days < 0 && b.status === "ACTIVE";

  return (
    <Link
      href={`/aura/contenido/briefings/${b.id}`}
      className="block p-5 rounded-2xl transition-all hover:-translate-y-0.5"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${overdue ? THEME.amberBorder : THEME.border}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = overdue ? THEME.amber : THEME.borderStrong;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = overdue ? THEME.amberBorder : THEME.border;
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold"
              style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              {cfg.label}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold"
              style={{
                color: THEME.textSecondary,
                background: THEME.bgSoft,
                border: `1px solid ${THEME.border}`,
              }}
            >
              {TYPE_CFG[b.type] ?? b.type}
            </span>
            {overdue ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold"
                style={{ color: THEME.amber, background: THEME.amberSoft, border: `1px solid ${THEME.amberBorder}` }}
              >
                <AlertTriangle size={10} strokeWidth={2.4} />
                Vencido
              </span>
            ) : urgent ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold"
                style={{ color: THEME.amber, background: THEME.amberSoft, border: `1px solid ${THEME.amberBorder}` }}
              >
                <Clock size={10} strokeWidth={2.4} />
                {days}d
              </span>
            ) : null}
          </div>
          <div className="text-[15px] font-semibold tracking-tight truncate" style={{ color: THEME.textPrimary }}>
            {b.title}
          </div>
          <div
            className="text-[12px] mt-0.5 line-clamp-2"
            style={{ color: THEME.textTertiary }}
          >
            {b.description}
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 flex-wrap mt-3 mb-3">
        {b.influencer ? (
          <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: THEME.textSecondary }}>
            <Avatar name={b.influencer.name} url={b.influencer.profileImage} size={18} />
            {b.influencer.name}
          </div>
        ) : (
          <div className="text-[11.5px] italic" style={{ color: THEME.textMuted }}>
            Sin creador asignado
          </div>
        )}
        {b.campaign ? (
          <div
            className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10.5px]"
            style={{ background: THEME.inkSoft, color: THEME.ink, border: `1px solid ${THEME.inkBorder}` }}
          >
            {b.campaign.name}
          </div>
        ) : null}
        <div className="inline-flex items-center gap-1 text-[11px]" style={{ color: THEME.textTertiary }}>
          <Calendar size={10} strokeWidth={2.4} />
          {fmtDate(b.deadline)}
        </div>
      </div>

      {/* Submissions */}
      <div
        className="flex items-center justify-between pt-3 text-[11px]"
        style={{ borderTop: `1px solid ${THEME.border}` }}
      >
        <div className="flex items-center gap-3" style={{ color: THEME.textTertiary }}>
          <div className="inline-flex items-center gap-1">
            <FileText size={10} strokeWidth={2.4} /> {b.totalSubmissions} envíos
          </div>
          {b.pendingSubmissions > 0 ? (
            <div className="inline-flex items-center gap-1" style={{ color: THEME.amber }}>
              <Clock size={10} strokeWidth={2.4} /> {b.pendingSubmissions} por revisar
            </div>
          ) : null}
          {b.approvedSubmissions > 0 ? (
            <div className="inline-flex items-center gap-1" style={{ color: THEME.accent }}>
              <CheckCircle2 size={10} strokeWidth={2.4} /> {b.approvedSubmissions}
            </div>
          ) : null}
        </div>
        <ChevronRight size={14} style={{ color: THEME.textMuted }} />
      </div>
    </Link>
  );
}

function Avatar({ name, url, size = 24 }: { name: string; url: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
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
        fontSize: size * 0.4,
        border: `1px solid ${THEME.inkBorder}`,
      }}
    >
      {initials}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Modal de creación
// ════════════════════════════════════════════════════════════════
function NewBriefingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "GENERAL",
    deadline: "",
    influencerId: "",
    campaignId: "",
    requirements: "",
    hashtags: "",
    mentions: "",
    dos: "",
    donts: "",
    referenceUrls: "",
  });
  const [influencers, setInfluencers] = useState<{ id: string; name: string; code: string }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [i, c] = await Promise.all([
          fetch("/api/aura/creators/simple", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/aura/campaigns/list?status=ACTIVE", { cache: "no-store" }).then((r) => r.json()),
        ]);
        setInfluencers(i.influencers || i.creators || []);
        setCampaigns((c.rows || []).map((r: any) => ({ id: r.id, name: r.name })));
      } catch {}
    })();
  }, []);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setErr("Título y descripción son obligatorios");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/aura/briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          deadline: form.deadline || null,
          influencerId: form.influencerId || null,
          campaignId: form.campaignId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");
      onCreated();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(28,27,24,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: THEME.bgCard, border: `1px solid ${THEME.borderStrong}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10.5px] tracking-[0.14em] uppercase font-medium mb-1" style={{ color: THEME.textMuted }}>
              Nuevo
            </div>
            <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: THEME.textPrimary }}>
              Crear briefing
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ color: THEME.textMuted, background: THEME.bgSoft }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5">
          <Field label="Título *">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ej: Unboxing colección de verano"
              className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px]"
              style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
            />
          </Field>
          <Field label="Descripción *">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Qué queremos que haga el creador, objetivo, tono…"
              className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px] resize-none"
              style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px]"
                style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}`, background: THEME.bgCard }}
              >
                {Object.entries(TYPE_CFG).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Deadline">
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px]"
                style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Creador">
              <select
                value={form.influencerId}
                onChange={(e) => setForm({ ...form, influencerId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px]"
                style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}`, background: THEME.bgCard }}
              >
                <option value="">Sin asignar (general)</option>
                {influencers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Campaña">
              <select
                value={form.campaignId}
                onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px]"
                style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}`, background: THEME.bgCard }}
              >
                <option value="">Sin campaña</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Hashtags (separados por coma)">
            <input
              value={form.hashtags}
              onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
              placeholder="#mundodeljuguete, #verano2026"
              className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px]"
              style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
            />
          </Field>
          <Field label="Menciones">
            <input
              value={form.mentions}
              onChange={(e) => setForm({ ...form, mentions: e.target.value })}
              placeholder="@tu_marca"
              className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px]"
              style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Do's">
              <textarea
                value={form.dos}
                onChange={(e) => setForm({ ...form, dos: e.target.value })}
                rows={3}
                placeholder="Qué sí queremos…"
                className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px] resize-none"
                style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
              />
            </Field>
            <Field label="Don'ts">
              <textarea
                value={form.donts}
                onChange={(e) => setForm({ ...form, donts: e.target.value })}
                rows={3}
                placeholder="Qué evitar…"
                className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px] resize-none"
                style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
              />
            </Field>
          </div>

          <Field label="Links de referencia">
            <input
              value={form.referenceUrls}
              onChange={(e) => setForm({ ...form, referenceUrls: e.target.value })}
              placeholder="https://…, https://…"
              className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[13px]"
              style={{ color: THEME.textPrimary, border: `1px solid ${THEME.border}` }}
            />
          </Field>

          {err ? (
            <div
              className="text-[12px] p-2.5 rounded-lg"
              style={{ color: THEME.danger, background: THEME.dangerSoft, border: `1px solid ${THEME.dangerBorder}` }}
            >
              {err}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px] font-medium"
            style={{ color: THEME.textSecondary, background: THEME.bgSoft }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-ink text-white"
            style={{
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Creando…" : "Crear briefing"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10.5px] tracking-[0.12em] uppercase font-medium mb-1.5" style={{ color: THEME.textMuted }}>
        {label}
      </div>
      {children}
    </label>
  );
}
