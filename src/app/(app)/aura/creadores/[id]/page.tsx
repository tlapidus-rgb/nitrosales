"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Perfil de un creador
// ══════════════════════════════════════════════════════════════
// Pantalla /aura/creadores/[id]. Tema CLARO.
// Secciones:
//   1. Header hero: avatar + nombre + código + acciones (editar, silenciar, WhatsApp, copiar link)
//   2. KPIs período (revenue, órdenes, AOV, comisión) + lifetime
//   3. Campañas (activas + historial con performance)
//   4. Contenido publicado (grid de piezas)
//   5. Pagos y comisiones (total + pendiente)
//   6. Actividad reciente (timeline)
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CampaignsPanel } from "./CampaignsPanel";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Pencil,
  PauseCircle,
  PlayCircle,
  Copy,
  Check,
  MessageCircle,
  ExternalLink,
  Trophy,
  Flame,
  Rocket,
  Target,
  Hourglass,
  AlertCircle,
  Sparkles,
  Instagram,
  Youtube,
  Music2,
  Eye,
  EyeOff,
  Mail,
  RefreshCw,
  KeyRound,
  Heart,
  TrendingUp,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  ShoppingBag,
  Percent,
  Handshake,
  Plus,
  Layers,
  Shuffle,
  Gift,
  X,
  Package,
  Store,
  Truck,
  CreditCard,
  Loader2,
  Tag,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

// ───────────────────────── THEME (LIGHT) ─────────────────────────
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

// ───────────────────────── UTILS ─────────────────────────
function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtARSCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
function fmtNum(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}
function fmtPct(n: number | null, decimals = 1) {
  if (n === null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtRelative(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  if (m === 1) return "hace 1 mes";
  return `hace ${m} meses`;
}

// ───────────────────────── TYPES ─────────────────────────
type CreatorInfo = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  profileImage: string | null;
  status: string;
  commissionPercent: number;
  publicName: string | null;
  isPublicDashboardEnabled: boolean;
  hasDashboardPassword?: boolean;
  attributionWindowDays: number;
  createdAt: string;
  whatsapp: string | null;
  trackingLink?: string;
  dashboardUrl?: string;
  coupons: { id: string; code: string; discountPercent: number | null; discountFixed: number | null }[];
};
type Kpis = {
  period: { revenue: number; orders: number; commissionEarned: number; aov: number; deltaRevenue: number | null };
  lifetime: { revenue: number; orders: number; commissionEarned: number };
};
type CampaignDeal = {
  id: string;
  name: string;
  type: string;
  status: string;
  currency: string;
  commissionPercent: number | null;
  flatAmount: number | null;
  flatUnit: string | null;
  bonusAmount: number | null;
  bonusMetric: string | null;
  bonusTarget: number | null;
  tiers: unknown;
  cpmRate: number | null;
  productValue: number | null;
  productDescription: string | null;
  excludeFromCommission: boolean;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  payoutsCount: number;
};
type Campaign = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string | null;
  description: string | null;
  bonusAmount: number | null;
  bonusTarget: number | null;
  isAlwaysOn: boolean;
  revenue: number;
  commission: number;
  orders: number;
  progressPct: number | null;
  deals: CampaignDeal[];
};
type ContentItem = {
  id: string;
  type: string;
  platform: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement: number;
};
type Activity =
  | { kind: "sale"; at: string; orderId: string | null; amount: number; commission: number; campaign: { id: string; name: string } | null }
  | { kind: "content"; at: string; type: string; platform: string; status: string };
type Deal = {
  id: string;
  name: string;
  type: string;
  status: string;
  currency: string;
  commissionPercent: number | null;
  flatAmount: number | null;
  flatUnit: string | null;
  bonusAmount: number | null;
  bonusMetric: string | null;
  bonusTarget: number | null;
  tiers: unknown;
  cpmRate: number | null;
  productValue: number | null;
  productDescription: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  payoutsCount: number;
};
type ProfileState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      creator: CreatorInfo;
      kpis: Kpis;
      campaigns: Campaign[];
      deals: Deal[]; // legacy — kept for backward compat
      content: { items: ContentItem[]; totalViews: number; avgEngagement: number };
      activity: Activity[];
    };

// ───────────────────────── AVATAR ─────────────────────────
function Avatar({ name, url, size = 80 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="object-cover rounded-full"
        style={{ width: size, height: size, border: `2px solid ${THEME.bgCard}`, boxShadow: "0 8px 24px rgba(255, 0, 128, 0.15)" }}
      />
    );
  }
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "linear-gradient(135deg, #ff99c7 0%, #ff0080 100%)",
        color: "#FFF",
        boxShadow: "0 8px 24px rgba(255, 0, 128, 0.25)",
      }}
    >
      {initials || "?"}
    </div>
  );
}

// ───────────────────── PLATFORM ICON ─────────────────────
function PlatformIcon({ platform, size = 14 }: { platform: string; size?: number }) {
  const p = platform.toUpperCase();
  const common = { size, strokeWidth: 2 } as const;
  if (p === "INSTAGRAM") return <Instagram {...common} />;
  if (p === "TIKTOK") return <Music2 {...common} />;
  if (p === "YOUTUBE") return <Youtube {...common} />;
  return <Play {...common} />;
}
function platformColor(platform: string): string {
  const p = platform.toUpperCase();
  if (p === "INSTAGRAM") return "#E1306C";
  if (p === "TIKTOK") return "#00F2EA";
  if (p === "YOUTUBE") return "#FF0000";
  return THEME.gold;
}

// ───────────────────── CAMPAIGN STATUS ─────────────────────
function campaignTone(c: Campaign): {
  label: string; color: string; bg: string; border: string; icon: React.ReactNode;
} {
  if (c.status !== "ACTIVE") {
    return {
      label: c.status === "COMPLETED" ? "Completada" : "Pausada",
      color: THEME.gray, bg: THEME.graySoft, border: THEME.grayBorder,
      icon: <CheckCircle2 size={11} strokeWidth={2.2} />,
    };
  }
  if (c.progressPct !== null && c.progressPct >= 1) {
    return {
      label: "Bonus desbloqueado",
      color: THEME.green, bg: THEME.greenSoft, border: THEME.greenBorder,
      icon: <Trophy size={11} strokeWidth={2.2} />,
    };
  }
  if (c.endDate) {
    const daysLeft = Math.floor((new Date(c.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const timeProgress = c.progressPct ?? 0;
    if (daysLeft <= 3 && timeProgress < 0.7) {
      return {
        label: "En riesgo",
        color: THEME.rose, bg: THEME.roseSoft, border: THEME.roseBorder,
        icon: <AlertCircle size={11} strokeWidth={2.2} />,
      };
    }
  }
  return {
    label: "Activa",
    color: THEME.gold, bg: THEME.goldSoft, border: THEME.goldBorder,
    icon: <Rocket size={11} strokeWidth={2.2} />,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD ACCESS SECTION (contraseña + acciones)
// ═══════════════════════════════════════════════════════════════════
function DashboardAccessSection({
  creator,
  onReload,
}: {
  creator: CreatorInfo;
  onReload: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const hasPassword = !!creator.hasDashboardPassword;

  async function sendLink() {
    if (!creator.email) {
      setToast({ ok: false, msg: "El creador no tiene email configurado" });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/aura/creators/${creator.id}/send-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setToast({ ok: true, msg: `Link de acceso enviado a ${creator.email} ✓` });
        onReload();
      } else {
        setToast({ ok: false, msg: data.error || "No se pudo enviar el email" });
      }
    } catch (err: any) {
      setToast({ ok: false, msg: err?.message || "Error de red" });
    } finally {
      setSending(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <section
      className="rounded-2xl p-5 mb-5 relative"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
        animation: `cardIn 600ms ${ES} 100ms both`,
      }}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: THEME.goldSoft,
              border: `1px solid ${THEME.goldBorder}`,
              color: THEME.gold,
            }}
          >
            <KeyRound size={16} strokeWidth={2.2} />
          </div>
          <div>
            <h2
              className="text-[16px] font-semibold tracking-tight"
              style={{ color: THEME.textPrimary }}
            >
              Acceso al dashboard
            </h2>
            <p
              className="text-[11.5px] tracking-tight mt-0.5"
              style={{ color: THEME.textTertiary }}
            >
              {creator.email
                ? `Email: ${creator.email}`
                : "Sin email configurado — no se puede enviar el acceso"}
            </p>
          </div>
        </div>
      </div>

      <div
        className="rounded-xl p-4 flex items-center gap-3 flex-wrap"
        style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}` }}
      >
        <div className="flex-1 min-w-[160px]">
          <div className="text-[13px]" style={{ color: THEME.textSecondary }}>
            {hasPassword
              ? "El creador ya definió su contraseña de acceso."
              : "Pendiente: el creador todavía no definió su contraseña."}
          </div>
          <div className="text-[11.5px] mt-1" style={{ color: THEME.textTertiary }}>
            Define su propia clave desde el link que le mandás por mail — nosotros no la vemos.
          </div>
        </div>
        <button
          onClick={sendLink}
          disabled={sending || !creator.email}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
          style={{
            background: "linear-gradient(135deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(255,0,128,0.25)",
          }}
          title={creator.email ? `Enviar link de acceso a ${creator.email}` : "Sin email"}
        >
          <Mail size={13} strokeWidth={2.4} className={sending ? "animate-pulse" : ""} />
          {sending ? "Enviando…" : hasPassword ? "Reenviar link de acceso" : "Enviar link de acceso"}
        </button>
      </div>

      {toast && (
        <div
          className="mt-3 text-[12px] px-3 py-2 rounded-lg font-medium"
          style={{
            background: toast.ok ? THEME.greenSoft : THEME.roseSoft,
            color: toast.ok ? THEME.green : THEME.rose,
            border: `1px solid ${toast.ok ? THEME.greenBorder : THEME.roseBorder}`,
          }}
        >
          {toast.msg}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export default function CreatorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [state, setState] = useState<ProfileState>({ status: "loading" });
  const [editOpen, setEditOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDashboard, setCopiedDashboard] = useState(false);
  // item 29: orden abierta en el modal de detalle (solo admin — esta página lo es).
  const [orderModalId, setOrderModalId] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      setState({ status: "loading" });
      try {
        const r = await fetch(`/api/aura/creators/${id}`, { cache: "no-store" });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error");
        setState({ status: "ready", ...data });
      } catch (e: any) {
        setState({ status: "error", message: e?.message || "Error" });
      }
    },
    [id]
  );

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const handleToggleStatus = async (newStatus: string) => {
    try {
      await fetch(`/api/aura/creators/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      load();
    } catch {}
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };
  const handleCopyLink = (trackingLink: string | undefined, code: string) => {
    // Fallback si el API no devolvió trackingLink: link relativo con UTM
    const url =
      trackingLink || `/?utm_source=inf_${code}&utm_medium=influencer`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };
  const handleCopyDashboard = (dashboardUrl: string | undefined, _code: string) => {
    // Multi-tenant: si el API no devolvió dashboardUrl, NO fallback a slug hardcoded.
    // Mostrar error y no copiar algo que apunte a la org equivocada.
    if (!dashboardUrl) {
      console.warn("[Aura Creator] dashboardUrl ausente del API — no se puede copiar link");
      return;
    }
    navigator.clipboard.writeText(dashboardUrl);
    setCopiedDashboard(true);
    setTimeout(() => setCopiedDashboard(false), 1800);
  };

  if (state.status === "loading") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: THEME.bgPage, color: THEME.textSecondary }}
      >
        <div className="text-[14px] tracking-tight">Cargando perfil...</div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: THEME.bgPage }}
      >
        <div
          className="rounded-2xl p-8 text-center max-w-md"
          style={{
            background: THEME.roseSoft,
            border: `1px solid ${THEME.roseBorder}`,
            color: THEME.rose,
          }}
        >
          <AlertCircle size={24} style={{ margin: "0 auto 8px" }} />
          <div className="font-semibold">No pudimos cargar el creador</div>
          <div className="text-[13px] mt-1 opacity-80">{state.message}</div>
          <button
            onClick={() => router.push("/aura/creadores")}
            className="mt-4 px-4 py-2 rounded-xl text-[13px] font-medium"
            style={{ background: THEME.bgCard, color: THEME.textPrimary }}
          >
            Volver a creadores
          </button>
        </div>
      </div>
    );
  }

  const { creator, kpis, campaigns, content, activity } = state;

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
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div className="max-w-[1200px] mx-auto px-8 py-8">
        {/* ─── BREADCRUMB ──────────────────────────────── */}
        <Link
          href="/aura/creadores"
          className="inline-flex items-center gap-1.5 text-[12.5px] tracking-tight mb-5"
          style={{ color: THEME.textSecondary }}
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          Creadores
        </Link>

        {/* ─── HEADER HERO ──────────────────────────────── */}
        <section
          className="rounded-2xl p-6 mb-5 relative overflow-hidden"
          style={{
            background: THEME.bgCard,
            border: `1px solid ${THEME.border}`,
            animation: `cardIn 520ms ${ES} both`,
          }}
        >
          {/* Halo decorativo (más grande y suave para que no se vea cortado) */}
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: "-40%",
              right: "-20%",
              width: "70%",
              height: "220%",
              background:
                "radial-gradient(ellipse at 70% 50%, rgba(255, 0, 128, 0.14) 0%, rgba(168, 85, 247, 0.08) 30%, rgba(0, 212, 255, 0.04) 55%, transparent 75%)",
              filter: "blur(24px)",
            }}
          />

          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-5">
              <Avatar name={creator.name} url={creator.profileImage} size={72} />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1
                    className="text-[26px] font-semibold tracking-tight leading-none"
                    style={{
                      background: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    {creator.name}
                  </h1>
                  {creator.status !== "ACTIVE" ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10.5px] font-semibold"
                      style={{
                        color: THEME.gray,
                        background: THEME.graySoft,
                        border: `1px solid ${THEME.grayBorder}`,
                      }}
                    >
                      <PauseCircle size={10} strokeWidth={2.4} />
                      Pausado
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleCopyCode(creator.code)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-medium tracking-tight transition"
                    style={{
                      background: THEME.bgSoft,
                      color: THEME.textSecondary,
                      border: `1px solid ${THEME.border}`,
                    }}
                    title="Copiar código de tracking"
                  >
                    <span className="font-mono">@{creator.code}</span>
                    {copiedCode ? (
                      <Check size={11} strokeWidth={2.4} style={{ color: THEME.green }} />
                    ) : (
                      <Copy size={11} strokeWidth={2} style={{ color: THEME.textMuted }} />
                    )}
                  </button>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] tracking-tight"
                    style={{
                      background: THEME.goldSoft,
                      color: THEME.gold,
                      border: `1px solid ${THEME.goldBorder}`,
                    }}
                  >
                    <Percent size={11} strokeWidth={2.4} />
                    {creator.commissionPercent}% comisión
                  </span>
                  <button
                    onClick={() => setEditOpen(true)}
                    title="Ventana de atribución — click para editar"
                    className="inline-flex items-center gap-1 px-[3px] py-[3px] rounded-lg text-[12px] tracking-tight transition hover:brightness-110"
                    style={{
                      background:
                        "linear-gradient(135deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
                      boxShadow:
                        "0 2px 10px rgba(168,85,247,0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
                    }}
                  >
                    <span
                      className="inline-flex items-center gap-1 px-2 py-[3px] rounded-[6px] font-semibold"
                      style={{
                        background: THEME.bgPage,
                        color: THEME.textPrimary,
                      }}
                    >
                      <Target size={11} strokeWidth={2.6} style={{ color: "#ff0080" }} />
                      <span
                        className="bg-clip-text text-transparent"
                        style={{
                          backgroundImage:
                            "linear-gradient(90deg,#ff0080,#a855f7,#00d4ff)",
                        }}
                      >
                        {creator.attributionWindowDays}d
                      </span>
                      <span style={{ color: THEME.textTertiary, fontWeight: 500 }}>
                        atribución
                      </span>
                    </span>
                  </button>
                  {creator.email ? (
                    <span className="text-[12px]" style={{ color: THEME.textTertiary }}>
                      {creator.email}
                    </span>
                  ) : null}
                </div>
                <div
                  className="mt-2 text-[11.5px] tracking-tight"
                  style={{ color: THEME.textMuted }}
                >
                  En el programa desde {fmtDate(creator.createdAt)}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleCopyLink(creator.trackingLink, creator.code)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight transition"
                style={{
                  background: THEME.bgCard,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.textPrimary,
                }}
                title={
                  creator.trackingLink ||
                  `Copiar link de afiliado al store (UTM: inf_${creator.code})`
                }
              >
                {copiedLink ? (
                  <>
                    <Check size={13} strokeWidth={2.4} style={{ color: THEME.green }} />
                    Link copiado
                  </>
                ) : (
                  <>
                    <Copy size={13} strokeWidth={2} />
                    Link de venta
                  </>
                )}
              </button>
              <button
                onClick={() => handleCopyDashboard(creator.dashboardUrl, creator.code)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight transition"
                style={{
                  background: THEME.bgCard,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.textPrimary,
                }}
                title={
                  creator.dashboardUrl ||
                  "Copiar link al dashboard privado del creador"
                }
              >
                {copiedDashboard ? (
                  <>
                    <Check size={13} strokeWidth={2.4} style={{ color: THEME.green }} />
                    Dashboard copiado
                  </>
                ) : (
                  <>
                    <Copy size={13} strokeWidth={2} />
                    Dashboard del creador
                  </>
                )}
              </button>
              {creator.email ? (
                <a
                  href={`mailto:${creator.email}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight transition"
                  style={{
                    background: THEME.bgCard,
                    border: `1px solid ${THEME.border}`,
                    color: THEME.textPrimary,
                  }}
                >
                  <MessageCircle size={13} strokeWidth={2} />
                  Email
                </a>
              ) : null}
              <button
                onClick={() => handleToggleStatus(creator.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight transition"
                style={{
                  background: THEME.bgCard,
                  border: `1px solid ${THEME.border}`,
                  color: creator.status === "ACTIVE" ? THEME.rose : THEME.green,
                }}
              >
                {creator.status === "ACTIVE" ? (
                  <>
                    <PauseCircle size={13} strokeWidth={2.2} />
                    Silenciar
                  </>
                ) : (
                  <>
                    <PlayCircle size={13} strokeWidth={2.2} />
                    Reactivar
                  </>
                )}
              </button>
              <button
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold tracking-tight transition hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(135deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
                  color: "#FFF",
                  boxShadow:
                    "0 4px 16px rgba(244,114,182,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
                }}
              >
                <Pencil size={13} strokeWidth={2.4} />
                Editar
              </button>
            </div>
          </div>
        </section>

        {/* ─── KPIs (period + lifetime) ──────────────────── */}
        <section
          className="grid grid-cols-2 md:grid-cols-5 gap-px rounded-2xl overflow-hidden mb-5"
          style={{
            background: THEME.border,
            border: `1px solid ${THEME.border}`,
            animation: `cardIn 560ms ${ES} 80ms both`,
          }}
        >
          <KpiCell
            label="Revenue (30d)"
            value={fmtARS(kpis.period.revenue)}
            delta={kpis.period.deltaRevenue}
            icon={<TrendingUp size={14} strokeWidth={2.2} />}
          />
          <KpiCell
            label="Órdenes (30d)"
            value={fmtNum(kpis.period.orders)}
            sub={`AOV ${kpis.period.orders > 0 ? fmtARSCompact(kpis.period.aov) : "—"}`}
            icon={<ShoppingBag size={14} strokeWidth={2.2} />}
          />
          <KpiCell
            label="Comisión (30d)"
            value={fmtARS(kpis.period.commissionEarned)}
            sub={`${creator.commissionPercent}% sobre revenue`}
            icon={<DollarSign size={14} strokeWidth={2.2} />}
          />
          <KpiCell
            label="Lifetime"
            value={fmtARS(kpis.lifetime.revenue)}
            sub={`${fmtNum(kpis.lifetime.orders)} órdenes · ${fmtARS(kpis.lifetime.commissionEarned)} en comisiones`}
            icon={<Trophy size={14} strokeWidth={2.2} />}
          />
          {/* Attribution window — destacado con borde gradient. Display no
              interactivo: la edición salió del modal de creador (item 10). */}
          <div
            className="relative p-4 text-left"
            style={{
              background: THEME.bgCard,
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,0,128,0.06) 0%, rgba(168,85,247,0.05) 50%, rgba(0,212,255,0.06) 100%)",
              }}
            />
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{
                background:
                  "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
              }}
            />
            <div className="relative">
              <div
                className="flex items-center gap-1.5 text-[10.5px] tracking-[0.12em] uppercase font-semibold mb-2"
                style={{ color: THEME.textMuted }}
              >
                <Target size={12} strokeWidth={2.4} style={{ color: "#ff0080" }} />
                Ventana atribución
              </div>
              <div
                className="text-[22px] font-semibold leading-none tracking-tight bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#ff0080,#a855f7,#00d4ff)",
                }}
              >
                {creator.attributionWindowDays} días
              </div>
              <div
                className="mt-1.5 text-[11px] tracking-tight"
                style={{ color: THEME.textTertiary }}
              >
                Powered by NitroPixel
              </div>
            </div>
          </div>
        </section>

        {/* ─── ACCESO AL DASHBOARD (contraseña + enviar por mail) ─── */}
        <DashboardAccessSection creator={creator} onReload={load} />

        {/* ─── CAMPAÑAS + PAGOS (Bloque D): Campaña activa, Pendiente a pagar
            (FIFO) e Historial de campañas. Reemplaza "Pagos por mes" y las viejas
            cards "Campañas" y "Pagos y comisiones" (items 11/12/13/14/16). ─── */}
        <div className="mt-5">
          <CampaignsPanel creatorId={creator.id} />
        </div>

        {/* ─── ÓRDENES GENERADAS (item 28: ancho completo / más grande) ─── */}
        <div className="mt-5">
            <section
              className="rounded-2xl p-5"
              style={{
                background: THEME.bgCard,
                border: `1px solid ${THEME.border}`,
                animation: `cardIn 720ms ${ES} 240ms both`,
              }}
            >
              {/* Renombrada a "Órdenes generadas" y filtrada a ventas por pedido
                  de Tomy (reunión 08/07/26, item 28). El detalle clickeable de
                  cada orden (item 29) queda para el paso con el API de detalle. */}
              <h2
                className="text-[16px] font-semibold tracking-tight mb-4"
                style={{ color: THEME.textPrimary }}
              >
                Órdenes generadas
              </h2>
              {(() => {
                const orders = activity.filter((a) => a.kind === "sale");
                return orders.length === 0 ? (
                  <EmptyBlock
                    icon={<Clock size={22} strokeWidth={1.6} style={{ color: THEME.textMuted }} />}
                    title="Sin órdenes aún"
                    subtitle=""
                  />
                ) : (
                  <div className="space-y-0">
                    {orders.map((a, i) => (
                      <ActivityRow
                        key={i}
                        activity={a}
                        isLast={i === orders.length - 1}
                        onOpenOrder={setOrderModalId}
                      />
                    ))}
                  </div>
                );
              })()}
            </section>
        </div>
      </div>

      {/* ─── EDIT MODAL ─── */}
      {editOpen ? (
        <EditModal
          creator={creator}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      ) : null}

      {/* ─── ORDER DETAIL MODAL (item 29 — solo admin) ─── */}
      {orderModalId ? (
        <OrderDetailModal
          creatorId={creator.id}
          orderId={orderModalId}
          onClose={() => setOrderModalId(null)}
        />
      ) : null}

    </div>
  );
}

// ───────────────────────── KPI CELL ─────────────────────────
function KpiCell({
  label,
  value,
  sub,
  delta,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  icon: React.ReactNode;
}) {
  return (
    <div style={{ background: THEME.bgCard, padding: "18px 20px" }}>
      <div
        className="flex items-center gap-1.5 text-[10.5px] tracking-[0.12em] uppercase font-medium mb-2"
        style={{ color: THEME.textMuted }}
      >
        <span style={{ color: THEME.gold }}>{icon}</span>
        {label}
      </div>
      <div
        className="text-[22px] font-semibold tabular-nums tracking-tight leading-none"
        style={{ color: THEME.textPrimary }}
      >
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {delta !== undefined && delta !== null ? (
          <span
            className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold tabular-nums"
            style={{
              color: delta >= 0 ? THEME.green : THEME.rose,
            }}
          >
            {delta >= 0 ? (
              <ArrowUpRight size={11} strokeWidth={2.4} />
            ) : (
              <ArrowDownRight size={11} strokeWidth={2.4} />
            )}
            {fmtPct(Math.abs(delta), 0)}
          </span>
        ) : null}
        {sub ? (
          <span className="text-[11px] tracking-tight" style={{ color: THEME.textTertiary }}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ───────────────────────── CAMPAIGN CARD ─────────────────────────
function CampaignCard({ campaign }: { campaign: Campaign }) {
  const t = campaignTone(campaign);
  const revenuePct = campaign.progressPct;
  const deals = campaign.deals || [];
  return (
    <Link
      href={`/aura/campanas/${campaign.id}`}
      className="block rounded-xl p-4 transition hover:shadow-sm"
      style={{
        background: THEME.bgSoft,
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3
              className="text-[14px] font-semibold tracking-tight truncate"
              style={{ color: THEME.textPrimary }}
            >
              {campaign.name}
            </h3>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-tight flex-shrink-0"
              style={{
                color: t.color,
                background: t.bg,
                border: `1px solid ${t.border}`,
              }}
            >
              {t.icon}
              {t.label}
            </span>
            {campaign.isAlwaysOn ? (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium tracking-tight flex-shrink-0"
                style={{ color: THEME.textTertiary, background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
              >
                Always On
              </span>
            ) : null}
          </div>
          {campaign.description ? (
            <p
              className="text-[11.5px] tracking-tight line-clamp-1"
              style={{ color: THEME.textSecondary }}
            >
              {campaign.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Deal(s) inline */}
      {deals.length > 0 ? (
        <div className="mb-3 space-y-2">
          {deals.map((d) => {
            const meta = DEAL_TYPE_META[d.type] ?? DEAL_TYPE_META.HYBRID;
            const lines = campaignDealSummaryLines(d);
            const active = d.status === "ACTIVE";
            return (
              <div
                key={d.id}
                className="rounded-lg px-3 py-2.5"
                style={{
                  background: THEME.bgCard,
                  border: `1px solid ${THEME.border}`,
                  opacity: active ? 1 : 0.6,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-tight"
                    style={{ color: meta.tone.color, background: meta.tone.bg, border: `1px solid ${meta.tone.border}` }}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                  {!active ? (
                    <span className="text-[10px] font-medium" style={{ color: THEME.gray }}>
                      {d.status === "ENDED" ? "Finalizado" : "Pausado"}
                    </span>
                  ) : null}
                  {d.excludeFromCommission ? (
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-md" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.26)" }}>
                      Excluido de comisión UTM
                    </span>
                  ) : null}
                </div>
                {lines.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {lines.map((l, i) => (
                      <span key={i} className="text-[11px] tabular-nums tracking-tight" style={{ color: THEME.textSecondary }}>{l}{i < lines.length - 1 ? " · " : ""}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <CampaignStat label="Revenue" value={fmtARSCompact(campaign.revenue)} />
        <CampaignStat label="Órdenes" value={fmtNum(campaign.orders)} />
        <CampaignStat label="Comisión" value={fmtARSCompact(campaign.commission)} />
      </div>

      {/* Progress bar (if has target) */}
      {campaign.bonusTarget ? (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10.5px] tracking-tight" style={{ color: THEME.textTertiary }}>
              Meta de bonus · {fmtARSCompact(campaign.bonusTarget)}
              {campaign.bonusAmount ? ` → ${fmtARSCompact(campaign.bonusAmount)} bonus` : ""}
            </div>
            <div
              className="text-[10.5px] font-semibold tabular-nums"
              style={{ color: t.color }}
            >
              {fmtPct(revenuePct, 0)}
            </div>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: THEME.border }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round((revenuePct ?? 0) * 100)}%`,
                background: t.color,
                transition: `width 700ms ${ES}`,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Date range */}
      <div
        className="mt-3 flex items-center gap-2 text-[10.5px] tracking-tight"
        style={{ color: THEME.textMuted }}
      >
        <Calendar size={10} strokeWidth={2.2} />
        {fmtDate(campaign.startDate)}
        {campaign.endDate ? ` → ${fmtDate(campaign.endDate)}` : " (sin fin)"}
      </div>
    </Link>
  );
}
function CampaignStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[10px] tracking-[0.1em] uppercase font-medium"
        style={{ color: THEME.textMuted }}
      >
        {label}
      </div>
      <div
        className="text-[13.5px] font-semibold tabular-nums tracking-tight mt-0.5"
        style={{ color: THEME.textPrimary }}
      >
        {value}
      </div>
    </div>
  );
}

// ───────────────────────── CONTENT CARD ─────────────────────────
function ContentCard({ item }: { item: ContentItem }) {
  const color = platformColor(item.platform);
  return (
    <a
      href={item.contentUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl overflow-hidden transition"
      style={{
        background: THEME.bgSoft,
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div
        className="relative aspect-[4/5] overflow-hidden"
        style={{ background: THEME.border }}
      >
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${THEME.bgSoft} 0%, ${THEME.border} 100%)` }}
          >
            <PlatformIcon platform={item.platform} size={28} />
          </div>
        )}
        {/* Platform pill */}
        <div
          className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
          style={{
            background: "rgba(255, 255, 255, 0.92)",
            color,
            backdropFilter: "blur(6px)",
          }}
        >
          <PlatformIcon platform={item.platform} size={10} />
          {item.type}
        </div>
        {/* External icon on hover */}
        <div
          className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background: "rgba(255, 255, 255, 0.92)",
            color: THEME.textPrimary,
          }}
        >
          <ExternalLink size={11} strokeWidth={2.4} />
        </div>
      </div>
      <div className="p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div
            className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums"
            style={{ color: THEME.textPrimary }}
          >
            <Eye size={11} strokeWidth={2.2} />
            {fmtNum(item.views)}
          </div>
          <div
            className="inline-flex items-center gap-1 text-[11px] tabular-nums"
            style={{ color: THEME.textSecondary }}
          >
            <Heart size={10} strokeWidth={2.2} />
            {fmtNum(item.likes)}
          </div>
          <div
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: THEME.gold }}
            title="Engagement rate"
          >
            {fmtPct(item.engagement)}
          </div>
        </div>
      </div>
    </a>
  );
}

// ───────────────────────── PAYMENT ROW ─────────────────────────
function PaymentRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "gold" | "neutral";
}) {
  const isGold = tone === "gold";
  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: isGold ? THEME.goldSoft : THEME.bgSoft,
        border: `1px solid ${isGold ? THEME.goldBorder : THEME.border}`,
      }}
    >
      <div
        className="text-[11px] tracking-[0.1em] uppercase font-medium"
        style={{ color: isGold ? THEME.gold : THEME.textMuted }}
      >
        {label}
      </div>
      <div
        className="text-[20px] font-semibold tabular-nums tracking-tight mt-1"
        style={{ color: THEME.textPrimary }}
      >
        {value}
      </div>
      {sub ? (
        <div className="text-[11px] tracking-tight mt-0.5" style={{ color: THEME.textTertiary }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────── ACTIVITY ROW ─────────────────────────
function ActivityRow({
  activity,
  isLast,
  onOpenOrder,
}: {
  activity: Activity;
  isLast: boolean;
  onOpenOrder?: (orderId: string) => void;
}) {
  const iconBg = activity.kind === "sale" ? THEME.goldSoft : THEME.bgSoft;
  const iconColor = activity.kind === "sale" ? THEME.gold : THEME.textSecondary;
  const icon =
    activity.kind === "sale" ? (
      <ShoppingBag size={13} strokeWidth={2.2} />
    ) : (
      <Play size={13} strokeWidth={2.2} />
    );
  // item 29: una venta con orderId se puede abrir para ver el detalle de la transacción.
  const clickable = activity.kind === "sale" && !!activity.orderId && !!onOpenOrder;
  const handleClick = () => {
    if (activity.kind === "sale" && activity.orderId && onOpenOrder) onOpenOrder(activity.orderId);
  };
  return (
    <div
      className={`flex gap-3 py-2.5 ${clickable ? "cursor-pointer rounded-lg -mx-2 px-2 transition-colors hover:bg-white/[0.03]" : ""}`}
      onClick={clickable ? handleClick : undefined}
      role={clickable ? "button" : undefined}
      title={clickable ? "Ver detalle de la transacción" : undefined}>
      <div className="flex flex-col items-center">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: iconBg,
            color: iconColor,
            border: `1px solid ${THEME.border}`,
          }}
        >
          {icon}
        </div>
        {!isLast ? (
          <div
            className="w-px flex-1 mt-1"
            style={{ background: THEME.border }}
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0 pb-2">
        {activity.kind === "sale" ? (
          <>
            <div
              className="text-[12.5px] tracking-tight"
              style={{ color: THEME.textPrimary }}
            >
              Venta de{" "}
              <span className="font-semibold tabular-nums">
                {fmtARS(activity.amount)}
              </span>
              {activity.campaign ? (
                <span style={{ color: THEME.textSecondary }}>
                  {" "}
                  en {activity.campaign.name}
                </span>
              ) : null}
            </div>
            <div
              className="text-[11px] tracking-tight mt-0.5 tabular-nums"
              style={{ color: THEME.textTertiary }}
            >
              +{fmtARSCompact(activity.commission)} comisión · {fmtRelative(activity.at)}
            </div>
          </>
        ) : (
          <>
            <div
              className="text-[12.5px] tracking-tight"
              style={{ color: THEME.textPrimary }}
            >
              Publicó {activity.type.toLowerCase()} en {activity.platform.toLowerCase()}
            </div>
            <div
              className="text-[11px] tracking-tight mt-0.5"
              style={{ color: THEME.textTertiary }}
            >
              Estado: {activity.status.toLowerCase()} · {fmtRelative(activity.at)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── ORDER DETAIL MODAL (item 29) ───────────────────────
type OrderDetail = {
  order: {
    id: string;
    externalId: string;
    status: string;
    totalValue: number;
    currency: string;
    itemCount: number;
    source: string;
    channel: string | null;
    paymentMethod: string | null;
    shippingCost: number | null;
    discountValue: number | null;
    couponCode: string | null;
    promotionNames: string | null;
    deliveryType: string | null;
    pickupStoreName: string | null;
    shippingCarrier: string | null;
    shippingService: string | null;
    orderDate: string;
    customer: { name: string | null; email: string | null; city: string | null } | null;
    items: Array<{
      id: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      name: string;
      sku: string | null;
      ean: string | null;
      imageUrl: string | null;
      brand: string | null;
    }>;
  };
  attribution: {
    attributedValue: number;
    commissionAmount: number;
    attributionModel: string;
    attributionSource: string;
  };
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  INVOICED: "Facturada",
  SHIPPED: "Enviada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
  RETURNED: "Devuelta",
};

function OrderDetailModal({
  creatorId,
  orderId,
  onClose,
}: {
  creatorId: string;
  orderId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/aura/creators/${creatorId}/orders/${orderId}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Error");
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId, orderId]);

  const o = data?.order;
  const attr = data?.attribution;
  const isPickup = o?.deliveryType === "pickup";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", animation: `fadeIn 200ms ${ES} both` }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{ background: "#12121c", border: `1px solid ${THEME.borderStrong}`, boxShadow: "0 24px 72px rgba(0,0,0,0.55)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b" style={{ borderColor: THEME.border }}>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: THEME.gold }}>
              <ShoppingBag size={11} /> Detalle de la transacción
            </div>
            <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: THEME.textPrimary }}>
              {o ? `Orden #${o.externalId}` : "Cargando orden…"}
            </h2>
            {o ? (
              <div className="text-[12px] mt-0.5" style={{ color: THEME.textTertiary }}>
                {fmtDate(o.orderDate)} · {o.source}
                {o.channel ? ` · ${o.channel}` : ""}
              </div>
            ) : null}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: THEME.textSecondary }}>
            <X size={16} />
          </button>
        </div>

        {error ? (
          <div className="p-6 text-center text-[13px]" style={{ color: "#f87171" }}>
            No se pudo cargar la orden: {error}
          </div>
        ) : !data ? (
          <div className="p-10 flex items-center justify-center gap-2 text-[13px]" style={{ color: THEME.textTertiary }}>
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Chips resumen */}
            <div className="flex flex-wrap gap-2">
              <span
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                style={{ background: THEME.goldSoft, color: THEME.gold, border: `1px solid ${THEME.goldBorder}` }}
              >
                {ORDER_STATUS_LABEL[o!.status] || o!.status}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-[11px]" style={{ background: THEME.bgSoft, color: THEME.textSecondary, border: `1px solid ${THEME.border}` }}>
                {o!.itemCount} {o!.itemCount === 1 ? "ítem" : "ítems"}
              </span>
              {o!.paymentMethod ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: THEME.bgSoft, color: THEME.textSecondary, border: `1px solid ${THEME.border}` }}>
                  <CreditCard size={11} /> {o!.paymentMethod}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: THEME.bgSoft, color: THEME.textSecondary, border: `1px solid ${THEME.border}` }}>
                {isPickup ? <Store size={11} /> : <Truck size={11} />}
                {isPickup ? `Retiro${o!.pickupStoreName ? ` · ${o!.pickupStoreName}` : ""}` : `Envío${o!.shippingCarrier ? ` · ${o!.shippingCarrier}` : ""}`}
              </span>
              {o!.couponCode ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: THEME.bgSoft, color: THEME.textSecondary, border: `1px solid ${THEME.border}` }}>
                  <Tag size={11} /> {o!.couponCode}
                </span>
              ) : null}
            </div>

            {/* Atribución de este creador */}
            <div className="rounded-xl p-4" style={{ background: THEME.goldSoft, border: `1px solid ${THEME.goldBorder}` }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: THEME.textMuted }}>Revenue atribuido</div>
                  <div className="text-[18px] font-semibold tabular-nums" style={{ color: THEME.textPrimary }}>{fmtARS(attr!.attributedValue)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: THEME.textMuted }}>Comisión del creador</div>
                  <div className="text-[18px] font-semibold tabular-nums" style={{ color: THEME.gold }}>{fmtARS(attr!.commissionAmount)}</div>
                </div>
              </div>
              <div className="text-[10.5px] mt-2" style={{ color: THEME.textTertiary }}>
                Atribución {attr!.attributionSource} · modelo {attr!.attributionModel}
              </div>
            </div>

            {/* Ítems */}
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold mb-2" style={{ color: THEME.textSecondary }}>
                <Package size={13} /> Productos
              </div>
              <div className="flex flex-col gap-px rounded-xl overflow-hidden" style={{ background: THEME.border }}>
                {o!.items.length === 0 ? (
                  <div className="px-4 py-4 text-[12px]" style={{ background: "#12121c", color: THEME.textTertiary }}>
                    Sin detalle de ítems para esta orden.
                  </div>
                ) : (
                  o!.items.map((it) => (
                    <div key={it.id} className="flex items-center gap-3 px-3 py-2.5" style={{ background: "#12121c" }}>
                      <div
                        className="w-11 h-11 rounded-lg flex-shrink-0 bg-center bg-cover flex items-center justify-center"
                        style={{ background: it.imageUrl ? `url(${it.imageUrl}) center/cover` : THEME.bgSoft, border: `1px solid ${THEME.border}` }}
                      >
                        {!it.imageUrl ? <Package size={16} style={{ color: THEME.textMuted }} /> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate" style={{ color: THEME.textPrimary }}>{it.name}</div>
                        <div className="text-[11px] tracking-tight" style={{ color: THEME.textTertiary }}>
                          {it.sku ? `SKU ${it.sku}` : ""}{it.sku && it.ean ? " · " : ""}{it.ean ? `EAN ${it.ean}` : ""}
                          {!it.sku && !it.ean && it.brand ? it.brand : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: THEME.textPrimary }}>{fmtARS(it.totalPrice)}</div>
                        <div className="text-[11px] tabular-nums" style={{ color: THEME.textTertiary }}>
                          {it.quantity} × {fmtARS(it.unitPrice)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Totales */}
            <div className="rounded-xl p-4 space-y-1.5" style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}` }}>
              {o!.discountValue ? (
                <Row label="Descuento" value={`- ${fmtARS(o!.discountValue)}`} muted />
              ) : null}
              {o!.shippingCost != null ? (
                <Row label="Envío" value={fmtARS(o!.shippingCost)} muted />
              ) : null}
              <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t" style={{ borderColor: THEME.border }}>
                <span className="text-[13px] font-semibold" style={{ color: THEME.textPrimary }}>Total de la orden</span>
                <span className="text-[16px] font-semibold tabular-nums" style={{ color: THEME.textPrimary }}>{fmtARS(o!.totalValue)}</span>
              </div>
            </div>

            {/* Cliente */}
            {o!.customer && (o!.customer.name || o!.customer.email) ? (
              <div className="text-[11.5px]" style={{ color: THEME.textTertiary }}>
                Cliente: <span style={{ color: THEME.textSecondary }}>{o!.customer.name || o!.customer.email}</span>
                {o!.customer.city ? ` · ${o!.customer.city}` : ""}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span style={{ color: muted ? THEME.textTertiary : THEME.textSecondary }}>{label}</span>
      <span className="tabular-nums" style={{ color: muted ? THEME.textTertiary : THEME.textPrimary }}>{value}</span>
    </div>
  );
}

// ───────────────────────── EMPTY BLOCK ─────────────────────────
function EmptyBlock({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="rounded-xl p-8 text-center"
      style={{
        background: THEME.bgSoft,
        border: `1px dashed ${THEME.borderStrong}`,
      }}
    >
      <div className="flex justify-center mb-2">{icon}</div>
      <div
        className="text-[13.5px] font-semibold tracking-tight"
        style={{ color: THEME.textPrimary }}
      >
        {title}
      </div>
      {subtitle ? (
        <p
          className="text-[12px] tracking-tight mt-1"
          style={{ color: THEME.textSecondary }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

// ───────────────────────── EDIT MODAL ─────────────────────────
function EditModal({
  creator,
  onClose,
  onSaved,
}: {
  creator: CreatorInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(creator.name);
  const [email, setEmail] = useState(creator.email ?? "");
  const [publicName, setPublicName] = useState(creator.publicName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Solo email + nombre público (item 10): comisión y ventana ya no se
      // editan acá. El PATCH ignora los campos que no vienen.
      const r = await fetch(`/api/aura/creators/${creator.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          publicName,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error");
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(8px)",
        animation: `fadeIn 220ms ${ES} both`,
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: THEME.bgCard,
          border: `1px solid ${THEME.border}`,
          boxShadow: "0 24px 72px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-[18px] font-semibold tracking-tight mb-4"
          style={{ color: THEME.textPrimary }}
        >
          Editar creador
        </h2>
        <div className="space-y-3">
          <Field label="Nombre">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled
              className="w-full px-3 py-2 rounded-lg text-[13px] tracking-tight outline-none"
              style={{
                background: THEME.bgSoft,
                border: `1px solid ${THEME.border}`,
                color: THEME.textSecondary,
              }}
            />
          </Field>
          <Field label="Email">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px] tracking-tight outline-none"
              style={{
                background: THEME.bgCard,
                border: `1px solid ${THEME.border}`,
                color: THEME.textPrimary,
              }}
            />
          </Field>
          {/* Comisión y Ventana de atribución quitadas del editar creador por
              pedido de Tomy (reunión 08/07/26, item 10): solo nombre, email y
              nombre público. La comisión pasa a asignarse por campaña ("Comenzar
              campaña"). */}
          <Field label="Nombre público (opcional)">
            <input
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              placeholder="Cómo se muestra en el dashboard público"
              className="w-full px-3 py-2 rounded-lg text-[13px] tracking-tight outline-none"
              style={{
                background: THEME.bgCard,
                border: `1px solid ${THEME.border}`,
                color: THEME.textPrimary,
              }}
            />
          </Field>
          {error ? (
            <div
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{ background: THEME.roseSoft, color: THEME.rose, border: `1px solid ${THEME.roseBorder}` }}
            >
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12.5px] font-medium tracking-tight"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
              color: THEME.textPrimary,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-[12.5px] font-semibold tracking-tight hover:brightness-110"
            style={{
              background:
                "linear-gradient(135deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
              color: "#FFF",
              opacity: saving ? 0.6 : 1,
              boxShadow:
                "0 4px 16px rgba(244,114,182,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[10.5px] tracking-[0.12em] uppercase font-medium mb-1.5"
        style={{ color: THEME.textMuted }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DEAL CARD
// ═══════════════════════════════════════════════════════════════════
const DEAL_TYPE_META: Record<
  string,
  { label: string; icon: React.ReactNode; tone: { color: string; bg: string; border: string } }
> = {
  COMMISSION: {
    label: "Comisión %",
    icon: <Percent size={12} strokeWidth={2.4} />,
    tone: { color: "#a855f7", bg: "rgba(168, 85, 247, 0.10)", border: "rgba(168, 85, 247, 0.26)" },
  },
  FLAT_FEE: {
    label: "Monto fijo",
    icon: <DollarSign size={12} strokeWidth={2.4} />,
    tone: { color: "#00d4ff", bg: "rgba(0, 212, 255, 0.10)", border: "rgba(0, 212, 255, 0.26)" },
  },
  PERFORMANCE_BONUS: {
    label: "Bono por objetivo",
    icon: <Trophy size={12} strokeWidth={2.4} />,
    tone: { color: "#ffb84d", bg: "rgba(255, 184, 77, 0.10)", border: "rgba(255, 184, 77, 0.26)" },
  },
  TIERED_COMMISSION: {
    label: "Comisión escalonada",
    icon: <Layers size={12} strokeWidth={2.4} />,
    tone: { color: "#ff0080", bg: "rgba(255, 0, 128, 0.10)", border: "rgba(255, 0, 128, 0.26)" },
  },
  CPM: {
    label: "CPM",
    icon: <Eye size={12} strokeWidth={2.4} />,
    tone: { color: "#4ade80", bg: "rgba(74, 222, 128, 0.10)", border: "rgba(74, 222, 128, 0.26)" },
  },
  GIFTING: {
    label: "Gifting",
    icon: <Gift size={12} strokeWidth={2.4} />,
    tone: { color: "#ff6b8a", bg: "rgba(255, 107, 138, 0.10)", border: "rgba(255, 107, 138, 0.26)" },
  },
  HYBRID: {
    label: "Híbrido",
    icon: <Shuffle size={12} strokeWidth={2.4} />,
    tone: { color: "#f5f5f7", bg: "rgba(245, 245, 247, 0.06)", border: "rgba(245, 245, 247, 0.18)" },
  },
};

function campaignDealSummaryLines(d: CampaignDeal): string[] {
  const out: string[] = [];
  if (d.commissionPercent != null) out.push(`${d.commissionPercent}% sobre ventas`);
  if (d.flatAmount != null) out.push(`${fmtARS(d.flatAmount)}${d.flatUnit ? ` por ${d.flatUnit.toLowerCase()}` : ""}`);
  if (d.bonusAmount != null) {
    const tgt = d.bonusTarget != null ? fmtARSCompact(d.bonusTarget) : "meta";
    const metric = d.bonusMetric ? ` (${d.bonusMetric.toLowerCase()})` : "";
    out.push(`Bono ${fmtARS(d.bonusAmount)} al superar ${tgt}${metric}`);
  }
  if (d.cpmRate != null) out.push(`${fmtARS(d.cpmRate)} / 1K views`);
  if (d.productValue != null) out.push(`Producto${d.productDescription ? ` — ${d.productDescription}` : ""} · ${fmtARSCompact(d.productValue)}`);
  if (Array.isArray(d.tiers) && (d.tiers as any[]).length > 0) out.push(`${(d.tiers as any[]).length} tramos escalonados`);
  return out;
}

// dealSummaryLines kept for backward compat (deals page)
function dealSummaryLines(d: Deal): string[] {
  const out: string[] = [];
  if (d.commissionPercent != null) out.push(`${d.commissionPercent}% sobre ventas`);
  if (d.flatAmount != null) out.push(`${fmtARS(d.flatAmount)}${d.flatUnit ? ` por ${d.flatUnit.toLowerCase()}` : ""}`);
  if (d.bonusAmount != null) {
    const tgt = d.bonusTarget != null ? fmtARSCompact(d.bonusTarget) : "meta";
    const metric = d.bonusMetric ? ` (${d.bonusMetric.toLowerCase()})` : "";
    out.push(`Bono ${fmtARS(d.bonusAmount)} al superar ${tgt}${metric}`);
  }
  if (d.cpmRate != null) out.push(`${fmtARS(d.cpmRate)} / 1K views`);
  if (d.productValue != null)
    out.push(`Producto${d.productDescription ? ` — ${d.productDescription}` : ""} · ${fmtARSCompact(d.productValue)}`);
  if (Array.isArray(d.tiers) && d.tiers.length > 0) {
    out.push(`${d.tiers.length} tramos escalonados`);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// (DealCard y DealModal eliminados — deals ahora viven dentro de
// CampaignCard inline. Para crear deals nuevos → crear campaña.)
// ═══════════════════════════════════════════════════════════════════
