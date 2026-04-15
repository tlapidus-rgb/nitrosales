"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Pipeline de aplicaciones
// ══════════════════════════════════════════════════════════════
// Pantalla /aura/creadores/aplicaciones — kanban de aplicaciones
// (PENDING / APPROVED / REJECTED). Tema CLARO.
// Aprobar → crea un Influencer automáticamente.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Instagram,
  Music2,
  Youtube,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Users,
  Inbox,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

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
  green: "#4ade80",
  greenSoft: "rgba(74, 222, 128, 0.10)",
  greenBorder: "rgba(74, 222, 128, 0.28)",
  rose: "#ff6b8a",
  roseSoft: "rgba(255, 107, 138, 0.10)",
  roseBorder: "rgba(255, 107, 138, 0.28)",
  gray: "#9ca3af",
  graySoft: "rgba(156, 163, 175, 0.08)",
  grayBorder: "rgba(156, 163, 175, 0.22)",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080, #00d4ff)",
};

type Application = {
  id: string;
  name: string;
  email: string;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  followers: string | null;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type Groups = {
  PENDING: Application[];
  APPROVED: Application[];
  REJECTED: Application[];
};

function fmtRelative(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return `hace ${m} mes${m === 1 ? "" : "es"}`;
}

export default function AplicacionesPage() {
  const [groups, setGroups] = useState<Groups>({ PENDING: [], APPROVED: [], REJECTED: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/aura/applications/list", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error");
      setGroups(data.groups);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: string, status: "APPROVED" | "REJECTED" | "PENDING") => {
    setActingId(id);
    try {
      const r = await fetch(`/api/aura/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "Error");
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: THEME.bgPage,
        color: THEME.textPrimary,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif",
      }}
    >
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="max-w-[1400px] mx-auto px-8 py-8">
        <Link
          href="/aura/creadores"
          className="inline-flex items-center gap-1.5 text-[12.5px] tracking-tight mb-5"
          style={{ color: THEME.textSecondary }}
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          Creadores
        </Link>

        <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div
              className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2"
              style={{ color: THEME.textMuted }}
            >
              Aura · Pipeline
            </div>
            <h1
              className="text-[32px] font-semibold tracking-tight leading-none"
              style={{
                background: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Aplicaciones
            </h1>
            <p className="mt-2 text-[13.5px] tracking-tight" style={{ color: THEME.textSecondary }}>
              {groups.PENDING.length > 0
                ? `${groups.PENDING.length} ${groups.PENDING.length === 1 ? "aplicación pendiente" : "aplicaciones pendientes"} de revisar`
                : "Todas las aplicaciones están revisadas"}
            </p>
          </div>
        </header>

        {error ? (
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: THEME.roseSoft, border: `1px solid ${THEME.roseBorder}`, color: THEME.rose }}
          >
            {error}
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl animate-pulse"
                style={{
                  background: THEME.bgCard,
                  border: `1px solid ${THEME.border}`,
                  height: 300,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KanbanColumn
              title="Pendientes"
              subtitle="Requieren tu decisión"
              count={groups.PENDING.length}
              tone="gold"
              icon={<Clock size={14} strokeWidth={2.2} />}
            >
              {groups.PENDING.length === 0 ? (
                <ColumnEmpty message="No hay aplicaciones pendientes" />
              ) : (
                groups.PENDING.map((a, i) => (
                  <ApplicationCard
                    key={a.id}
                    app={a}
                    delay={i * 40}
                    acting={actingId === a.id}
                    onApprove={() => decide(a.id, "APPROVED")}
                    onReject={() => decide(a.id, "REJECTED")}
                  />
                ))
              )}
            </KanbanColumn>

            <KanbanColumn
              title="Aprobadas"
              subtitle="Ya son creadores activos"
              count={groups.APPROVED.length}
              tone="green"
              icon={<CheckCircle2 size={14} strokeWidth={2.2} />}
            >
              {groups.APPROVED.length === 0 ? (
                <ColumnEmpty message="Aún no hay aprobadas" />
              ) : (
                groups.APPROVED.map((a, i) => (
                  <ApplicationCard key={a.id} app={a} delay={i * 40} acting={false} />
                ))
              )}
            </KanbanColumn>

            <KanbanColumn
              title="Rechazadas"
              subtitle="No encajaron con el programa"
              count={groups.REJECTED.length}
              tone="gray"
              icon={<XCircle size={14} strokeWidth={2.2} />}
            >
              {groups.REJECTED.length === 0 ? (
                <ColumnEmpty message="Ninguna rechazada aún" />
              ) : (
                groups.REJECTED.map((a, i) => (
                  <ApplicationCard
                    key={a.id}
                    app={a}
                    delay={i * 40}
                    acting={actingId === a.id}
                    onReopen={() => decide(a.id, "PENDING")}
                  />
                ))
              )}
            </KanbanColumn>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────── KANBAN COLUMN ───────────────────
function KanbanColumn({
  title,
  subtitle,
  count,
  tone,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  tone: "gold" | "green" | "gray";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneColors =
    tone === "green"
      ? { c: THEME.green, bg: THEME.greenSoft, b: THEME.greenBorder }
      : tone === "gray"
        ? { c: THEME.gray, bg: THEME.graySoft, b: THEME.grayBorder }
        : { c: THEME.gold, bg: THEME.goldSoft, b: THEME.goldBorder };

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div
        className="flex items-center justify-between pb-3 mb-3"
        style={{ borderBottom: `1px solid ${THEME.border}` }}
      >
        <div>
          <div className="flex items-center gap-2">
            <span style={{ color: toneColors.c }}>{icon}</span>
            <h3
              className="text-[14px] font-semibold tracking-tight"
              style={{ color: THEME.textPrimary }}
            >
              {title}
            </h3>
            <span
              className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full text-[10.5px] font-bold tabular-nums"
              style={{
                background: toneColors.bg,
                color: toneColors.c,
                border: `1px solid ${toneColors.b}`,
              }}
            >
              {count}
            </span>
          </div>
          <p
            className="text-[11px] tracking-tight mt-0.5"
            style={{ color: THEME.textTertiary }}
          >
            {subtitle}
          </p>
        </div>
      </div>
      <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  );
}

function ColumnEmpty({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl p-6 text-center text-[12px] tracking-tight"
      style={{
        background: THEME.bgSoft,
        border: `1px dashed ${THEME.borderStrong}`,
        color: THEME.textTertiary,
      }}
    >
      {message}
    </div>
  );
}

// ─────────────────── APPLICATION CARD ───────────────────
function ApplicationCard({
  app,
  delay,
  acting,
  onApprove,
  onReject,
  onReopen,
}: {
  app: Application;
  delay: number;
  acting: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
}) {
  const initials = app.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: THEME.bgSoft,
        border: `1px solid ${THEME.border}`,
        animation: `cardIn 480ms ${ES} ${delay}ms both`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            fontSize: 13,
            background: "linear-gradient(135deg, #ff99c7 0%, #ff0080 100%)",
            color: "#FFF",
          }}
        >
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h4
            className="text-[13.5px] font-semibold tracking-tight truncate"
            style={{ color: THEME.textPrimary }}
          >
            {app.name}
          </h4>
          <p
            className="text-[11.5px] tracking-tight truncate"
            style={{ color: THEME.textTertiary }}
          >
            {app.email}
          </p>
        </div>
      </div>

      {/* Redes */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {app.instagram ? (
          <SocialPill platform="instagram" handle={app.instagram} />
        ) : null}
        {app.tiktok ? <SocialPill platform="tiktok" handle={app.tiktok} /> : null}
        {app.youtube ? <SocialPill platform="youtube" handle={app.youtube} /> : null}
      </div>

      {app.followers ? (
        <div
          className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium"
          style={{
            background: THEME.bgCard,
            color: THEME.textSecondary,
            border: `1px solid ${THEME.border}`,
          }}
        >
          <Users size={10} strokeWidth={2.2} />
          {app.followers} seguidores
        </div>
      ) : null}

      {app.message ? (
        <p
          className="mt-2 text-[11.5px] tracking-tight line-clamp-3"
          style={{ color: THEME.textSecondary }}
        >
          "{app.message}"
        </p>
      ) : null}

      <div
        className="mt-2 text-[10.5px] tracking-tight"
        style={{ color: THEME.textMuted }}
      >
        {app.status === "PENDING"
          ? `Aplicó ${fmtRelative(app.createdAt)}`
          : `${app.status === "APPROVED" ? "Aprobado" : "Rechazado"} ${app.reviewedAt ? fmtRelative(app.reviewedAt) : ""}`}
      </div>

      {/* Acciones */}
      {app.status === "PENDING" && onApprove && onReject ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onReject}
            disabled={acting}
            className="inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11.5px] font-semibold tracking-tight transition"
            style={{
              background: THEME.bgCard,
              color: THEME.rose,
              border: `1px solid ${THEME.roseBorder}`,
              opacity: acting ? 0.5 : 1,
            }}
          >
            <X size={11} strokeWidth={2.4} />
            Rechazar
          </button>
          <button
            onClick={onApprove}
            disabled={acting}
            className="inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11.5px] font-semibold tracking-tight transition"
            style={{
              background: THEME.green,
              color: "#FFF",
              opacity: acting ? 0.5 : 1,
            }}
          >
            <Check size={11} strokeWidth={2.8} />
            Aprobar
          </button>
        </div>
      ) : null}

      {app.status === "REJECTED" && onReopen ? (
        <button
          onClick={onReopen}
          disabled={acting}
          className="mt-3 w-full inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11.5px] font-semibold tracking-tight transition"
          style={{
            background: THEME.bgCard,
            color: THEME.textPrimary,
            border: `1px solid ${THEME.border}`,
            opacity: acting ? 0.5 : 1,
          }}
        >
          Reabrir
        </button>
      ) : null}
    </div>
  );
}

function SocialPill({
  platform,
  handle,
}: {
  platform: "instagram" | "tiktok" | "youtube";
  handle: string;
}) {
  const cfg = {
    instagram: { icon: <Instagram size={10} strokeWidth={2.2} />, color: "#E1306C" },
    tiktok: { icon: <Music2 size={10} strokeWidth={2.2} />, color: "#00838F" },
    youtube: { icon: <Youtube size={10} strokeWidth={2.2} />, color: "#FF0000" },
  }[platform];

  const cleanHandle = handle.replace(/^@/, "").replace(/^https?:\/\/.*?\//, "");

  return (
    <a
      href={handle.startsWith("http") ? handle : `https://${platform}.com/${cleanHandle}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium tracking-tight transition"
      style={{
        background: THEME.bgCard,
        color: cfg.color,
        border: `1px solid ${THEME.border}`,
      }}
    >
      {cfg.icon}
      @{cleanHandle.slice(0, 20)}
    </a>
  );
}
