"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Contenido · Briefing detalle
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Hash,
  AtSign,
  CheckCircle2,
  XCircle,
  RotateCw,
  ExternalLink,
  Image as ImageIcon,
  Trash2,
  Pencil,
  X,
  Clock,
  ChevronRight,
} from "lucide-react";

const THEME = {
  bgPage: "#0a0a14",
  bgCard: "rgba(255, 255, 255, 0.03)",
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
  roseBorder: "rgba(255, 107, 138, 0.28)",
  gradientText: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
};

type Submission = {
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
  metrics: any;
  isUGC: boolean;
  createdAt: string;
  influencer: { id: string; name: string; code: string; profileImage: string | null } | null;
};

type Briefing = {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  deadline: string | null;
  requirements: string | null;
  hashtags: string | null;
  mentions: string | null;
  dos: string | null;
  donts: string | null;
  referenceUrls: string | null;
  createdAt: string;
  updatedAt: string;
  influencer: { id: string; name: string; code: string; profileImage: string | null; email: string | null } | null;
  campaign: { id: string; name: string; status: string } | null;
  submissions: Submission[];
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ACTIVE: { label: "Activo", color: THEME.green, bg: THEME.greenSoft, border: THEME.greenBorder },
  COMPLETED: { label: "Completado", color: THEME.purple, bg: THEME.purpleSoft, border: THEME.purpleBorder },
  CANCELLED: { label: "Cancelado", color: THEME.textMuted, bg: "rgba(255,255,255,0.04)", border: THEME.border },
};

const SUB_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDING: { label: "Por revisar", color: THEME.gold, bg: THEME.goldSoft, border: THEME.goldBorder },
  APPROVED: { label: "Aprobado", color: THEME.green, bg: THEME.greenSoft, border: THEME.greenBorder },
  REVISION: { label: "Revisión", color: THEME.cyan, bg: THEME.cyanSoft, border: THEME.cyanBorder },
  REJECTED: { label: "Rechazado", color: THEME.rose, bg: THEME.roseSoft, border: THEME.roseBorder },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function BriefingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aura/briefings/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setData(json.briefing);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChangeStatus = async (status: string) => {
    if (!confirm(`¿Marcar como ${status}?`)) return;
    await fetch(`/api/aura/briefings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const handleDelete = async () => {
    if (!confirm("¿Borrar este briefing? Solo se puede si no tiene submissions.")) return;
    const res = await fetch(`/api/aura/briefings/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/aura/contenido/briefings");
    } else {
      const j = await res.json();
      alert(j.error || "Error");
    }
  };

  const reviewSubmission = async (subId: string, status: string, reviewNotes?: string) => {
    await fetch(`/api/aura/submissions/${subId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNotes: reviewNotes || null }),
    });
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: THEME.bgPage }}>
        <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-10" style={{ color: THEME.textMuted }}>
          Cargando…
        </div>
      </div>
    );
  }
  if (err || !data) {
    return (
      <div className="min-h-screen" style={{ background: THEME.bgPage }}>
        <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-10">
          <Link href="/aura/contenido/briefings" className="text-[13px]" style={{ color: THEME.textSecondary }}>
            <ArrowLeft size={14} className="inline -mt-0.5 mr-1" />
            Volver
          </Link>
          <div className="mt-6 text-[14px]" style={{ color: THEME.rose }}>
            {err || "Briefing no encontrado"}
          </div>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CFG[data.status] ?? STATUS_CFG.ACTIVE;

  return (
    <div className="min-h-screen" style={{ background: THEME.bgPage }}>
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* BREADCRUMB */}
        <div className="mb-3 flex items-center gap-1.5 text-[11px]" style={{ color: THEME.textMuted }}>
          <Link href="/aura/contenido" className="hover:underline">Contenido</Link>
          <ChevronRight size={12} />
          <Link href="/aura/contenido/briefings" className="hover:underline">Briefings</Link>
          <ChevronRight size={12} />
          <span style={{ color: THEME.textSecondary }}>Detalle</span>
        </div>

        {/* HEADER */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
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
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${THEME.border}`,
                }}
              >
                {data.type}
              </span>
              {data.campaign ? (
                <Link
                  href={`/aura/campanas/${data.campaign.id}`}
                  className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold"
                  style={{
                    color: THEME.purple,
                    background: THEME.purpleSoft,
                    border: `1px solid ${THEME.purpleBorder}`,
                  }}
                >
                  {data.campaign.name}
                </Link>
              ) : null}
            </div>
            <h1
              className="text-[28px] font-semibold tracking-tight leading-tight mb-1"
              style={{
                background: THEME.gradientText,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {data.title}
            </h1>
            <div className="flex items-center gap-3 text-[12px]" style={{ color: THEME.textTertiary }}>
              <span>
                <Calendar size={11} className="inline -mt-0.5 mr-1" />
                Deadline: {fmtDate(data.deadline)}
              </span>
              <span>Creado {fmtDate(data.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.status === "ACTIVE" ? (
              <>
                <button
                  onClick={() => handleChangeStatus("COMPLETED")}
                  className="px-3 py-2 rounded-xl text-[12px] font-semibold inline-flex items-center gap-1.5"
                  style={{ color: THEME.green, background: THEME.greenSoft, border: `1px solid ${THEME.greenBorder}` }}
                >
                  <CheckCircle2 size={12} strokeWidth={2.4} />
                  Marcar completado
                </button>
                <button
                  onClick={() => handleChangeStatus("CANCELLED")}
                  className="px-3 py-2 rounded-xl text-[12px] font-semibold inline-flex items-center gap-1.5"
                  style={{ color: THEME.rose, background: THEME.roseSoft, border: `1px solid ${THEME.roseBorder}` }}
                >
                  <XCircle size={12} strokeWidth={2.4} />
                  Cancelar
                </button>
              </>
            ) : null}
            <button
              onClick={handleDelete}
              className="p-2 rounded-xl"
              style={{ color: THEME.textMuted, background: "rgba(255,255,255,0.04)" }}
              title="Borrar (solo sin submissions)"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* INFLUENCER CARD */}
        {data.influencer ? (
          <Link
            href={`/aura/creadores/${data.influencer.id}`}
            className="block p-4 rounded-2xl mb-6"
            style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
          >
            <div className="flex items-center gap-3">
              <Avatar name={data.influencer.name} url={data.influencer.profileImage} size={42} />
              <div className="flex-1">
                <div className="text-[14px] font-semibold" style={{ color: THEME.textPrimary }}>
                  {data.influencer.name}
                </div>
                <div className="text-[11.5px] font-mono" style={{ color: THEME.textTertiary }}>
                  {data.influencer.code}
                </div>
              </div>
              <ChevronRight size={14} style={{ color: THEME.textMuted }} />
            </div>
          </Link>
        ) : null}

        {/* DESCRIPCIÓN + DIRECTIVAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div
            className="p-5 rounded-2xl md:col-span-2"
            style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
          >
            <SectionLabel>Descripción</SectionLabel>
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: THEME.textPrimary }}>
              {data.description}
            </p>
            {data.requirements ? (
              <>
                <SectionLabel className="mt-5">Requerimientos</SectionLabel>
                <p className="text-[13px] whitespace-pre-wrap" style={{ color: THEME.textSecondary }}>
                  {data.requirements}
                </p>
              </>
            ) : null}
          </div>
          <div
            className="p-5 rounded-2xl space-y-3"
            style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
          >
            {data.hashtags ? (
              <div>
                <SectionLabel>
                  <Hash size={11} className="inline -mt-0.5 mr-1" /> Hashtags
                </SectionLabel>
                <div className="text-[12.5px]" style={{ color: THEME.purple }}>
                  {data.hashtags}
                </div>
              </div>
            ) : null}
            {data.mentions ? (
              <div>
                <SectionLabel>
                  <AtSign size={11} className="inline -mt-0.5 mr-1" /> Menciones
                </SectionLabel>
                <div className="text-[12.5px]" style={{ color: THEME.cyan }}>
                  {data.mentions}
                </div>
              </div>
            ) : null}
            {data.referenceUrls ? (
              <div>
                <SectionLabel>Referencias</SectionLabel>
                <div className="text-[12px] break-all" style={{ color: THEME.textSecondary }}>
                  {data.referenceUrls}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* DO / DONT */}
        {(data.dos || data.donts) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {data.dos ? (
              <div
                className="p-5 rounded-2xl"
                style={{ background: THEME.greenSoft, border: `1px solid ${THEME.greenBorder}` }}
              >
                <div
                  className="text-[11px] tracking-[0.12em] uppercase font-semibold mb-2"
                  style={{ color: THEME.green }}
                >
                  ✓ Do's
                </div>
                <p className="text-[13px] whitespace-pre-wrap" style={{ color: THEME.textPrimary }}>
                  {data.dos}
                </p>
              </div>
            ) : null}
            {data.donts ? (
              <div
                className="p-5 rounded-2xl"
                style={{ background: THEME.roseSoft, border: `1px solid ${THEME.roseBorder}` }}
              >
                <div
                  className="text-[11px] tracking-[0.12em] uppercase font-semibold mb-2"
                  style={{ color: THEME.rose }}
                >
                  ✗ Don'ts
                </div>
                <p className="text-[13px] whitespace-pre-wrap" style={{ color: THEME.textPrimary }}>
                  {data.donts}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* SUBMISSIONS */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: THEME.textPrimary }}>
            Envíos de contenido
          </h2>
          <span className="text-[12px]" style={{ color: THEME.textTertiary }}>
            {data.submissions.length} total
          </span>
        </div>

        {data.submissions.length === 0 ? (
          <div
            className="py-10 text-center rounded-2xl"
            style={{ background: THEME.bgCard, border: `1px dashed ${THEME.border}` }}
          >
            <ImageIcon size={24} style={{ color: THEME.textMuted }} className="mx-auto mb-2" />
            <div className="text-[13px]" style={{ color: THEME.textSecondary }}>
              Todavía no llegó contenido para este briefing.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {data.submissions.map((s) => (
              <SubmissionRow key={s.id} s={s} onReview={reviewSubmission} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubmissionRow({
  s,
  onReview,
}: {
  s: Submission;
  onReview: (id: string, status: string, reviewNotes?: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const cfg = SUB_STATUS_CFG[s.status] ?? SUB_STATUS_CFG.PENDING;

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
        {/* Thumbnail */}
        <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${THEME.border}` }}>
          {s.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon size={20} style={{ color: THEME.textMuted }} />
            </div>
          )}
        </div>

        {/* Meta */}
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
              style={{ color: THEME.textSecondary, background: "rgba(255,255,255,0.04)", border: `1px solid ${THEME.border}` }}
            >
              {s.platform} · {s.type}
            </span>
            {s.isUGC ? (
              <span className="text-[10px] px-2 py-[2px] rounded-full" style={{ color: THEME.cyan, background: THEME.cyanSoft }}>
                UGC
              </span>
            ) : null}
          </div>
          {s.caption ? (
            <div className="text-[13px] line-clamp-2 mb-1" style={{ color: THEME.textPrimary }}>
              {s.caption}
            </div>
          ) : null}
          <div className="text-[11px]" style={{ color: THEME.textTertiary }}>
            {s.influencer ? `${s.influencer.name} · ` : ""}
            Enviado {fmtDateTime(s.createdAt)}
            {s.publishedAt ? ` · publicado ${fmtDateTime(s.publishedAt)}` : ""}
          </div>
          {s.reviewNotes ? (
            <div
              className="text-[11.5px] mt-2 p-2 rounded-lg"
              style={{ color: THEME.textSecondary, background: "rgba(255,255,255,0.03)", border: `1px solid ${THEME.border}` }}
            >
              💬 {s.reviewNotes}
            </div>
          ) : null}
        </div>

        {/* Acciones */}
        <div className="flex flex-col items-end gap-1.5">
          {s.contentUrl ? (
            <a
              href={s.contentUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg"
              style={{ color: THEME.textSecondary, background: "rgba(255,255,255,0.04)" }}
              title="Ver contenido"
            >
              <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      </div>

      {/* Review buttons (solo si PENDING o REVISION) */}
      {(s.status === "PENDING" || s.status === "REVISION") ? (
        <div className="mt-3 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: `1px solid ${THEME.border}` }}>
          <button
            onClick={() => handleAction("APPROVED")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: THEME.green, background: THEME.greenSoft, border: `1px solid ${THEME.greenBorder}` }}
          >
            <CheckCircle2 size={12} strokeWidth={2.4} />
            Aprobar
          </button>
          <button
            onClick={() => handleAction("REVISION")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: THEME.cyan, background: THEME.cyanSoft, border: `1px solid ${THEME.cyanBorder}` }}
          >
            <RotateCw size={12} strokeWidth={2.4} />
            Pedir cambios
          </button>
          <button
            onClick={() => handleAction("REJECTED")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: THEME.rose, background: THEME.roseSoft, border: `1px solid ${THEME.roseBorder}` }}
          >
            <XCircle size={12} strokeWidth={2.4} />
            Rechazar
          </button>
        </div>
      ) : null}

      {/* Modal de notas */}
      {notesOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{ background: "#14141f", border: `1px solid ${THEME.borderStrong}` }}
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
                style={{ color: THEME.textSecondary, background: "rgba(255,255,255,0.04)" }}
              >
                Cancelar
              </button>
              <button
                onClick={submitWithNotes}
                className="px-3 py-2 rounded-xl text-[12px] font-semibold"
                style={{
                  color: pendingAction === "REVISION" ? THEME.cyan : THEME.rose,
                  background: pendingAction === "REVISION" ? THEME.cyanSoft : THEME.roseSoft,
                  border: `1px solid ${pendingAction === "REVISION" ? THEME.cyanBorder : THEME.roseBorder}`,
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

function Avatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
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
        background: THEME.purpleSoft,
        color: THEME.purple,
        fontSize: size * 0.4,
        border: `1px solid ${THEME.purpleBorder}`,
      }}
    >
      {initials}
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`text-[10.5px] tracking-[0.14em] uppercase font-semibold mb-2 ${className}`}
      style={{ color: THEME.textMuted }}
    >
      {children}
    </div>
  );
}
