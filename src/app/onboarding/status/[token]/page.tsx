// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /onboarding/status/[token] — Estado para el cliente (sin login)
// ══════════════════════════════════════════════════════════════
// Pantalla premium con progreso visual, timeline y next steps.
// Auto-refresh cada 60s.
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Mail,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

const BRAND_ORANGE = "#FF5E1A";
const BRAND_BG = "#0A0A0F";
const CARD_BG = "#141419";
const BORDER = "#1F1F2E";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const ACCENT_GREEN = "#22C55E";
const ACCENT_AMBER = "#F59E0B";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

interface StatusData {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "NEEDS_INFO" | "ACTIVE" | "REJECTED";
  companyName: string;
  contactName: string;
  contactEmail: string;
  storeUrl: string;
  progressStage: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  elapsedHours: number;
  remainingHours: number;
  isActive: boolean;
}

const STAGES = [
  { key: "received", label: "Solicitud recibida", description: "Tus datos llegaron a nuestro equipo." },
  { key: "validating", label: "Validando datos", description: "Verificamos empresa y credenciales." },
  { key: "connecting", label: "Conectando plataformas", description: "VTEX, MercadoLibre y Ads si aplicás." },
  { key: "webhooks", label: "Configurando webhooks", description: "Activamos sincronización en tiempo real." },
  { key: "activated", label: "Cuenta activa", description: "¡Listo! Ya podés entrar." },
];

export default function StatusPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/public/onboarding/status/${params.token}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se encontró la solicitud");
        return;
      }
      setData(json.request);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Error de red");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000); // refresh 1 min
    return () => clearInterval(interval);
  }, [params.token]);

  if (loading) {
    return (
      <CenterLayout>
        <Loader2 size={28} className="spin" color={BRAND_ORANGE} />
        <div style={{ color: TEXT_SECONDARY, fontSize: 14, marginTop: 16 }}>Cargando estado…</div>
        <style jsx global>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </CenterLayout>
    );
  }

  if (error || !data) {
    return (
      <CenterLayout>
        <AlertCircle size={28} color="#FCA5A5" />
        <div style={{ color: TEXT_PRIMARY, fontSize: 16, fontWeight: 600, marginTop: 16 }}>
          Solicitud no encontrada
        </div>
        <div style={{ color: TEXT_SECONDARY, fontSize: 14, marginTop: 8, maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>
          {error || "El token es inválido o la solicitud expiró."}
        </div>
      </CenterLayout>
    );
  }

  const currentStageIdx = Math.max(
    0,
    STAGES.findIndex((s) => s.key === data.progressStage)
  );
  const isDone = data.status === "ACTIVE";
  const isRejected = data.status === "REJECTED";
  const needsInfo = data.status === "NEEDS_INFO";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px", position: "relative", zIndex: 1 }}>
      {/* Aura background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 20%, rgba(255,94,26,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(34,197,94,0.06) 0%, transparent 50%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Branding */}
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 40 }}>
        NITRO<span style={{ color: BRAND_ORANGE }}>SALES</span>
      </div>

      {/* Status hero */}
      <div
        style={{
          padding: "32px 28px",
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          marginBottom: 28,
        }}
      >
        <StatusBadge status={data.status} />
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
            margin: "14px 0 8px",
            color: TEXT_PRIMARY,
          }}
        >
          {isDone
            ? `¡${data.companyName} ya está activo!`
            : isRejected
            ? `Solicitud de ${data.companyName} rechazada`
            : needsInfo
            ? `Necesitamos más info de ${data.companyName}`
            : `Preparando ${data.companyName}`}
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: 15, lineHeight: 1.6, margin: "0 0 20px" }}>
          {isDone
            ? "Tu cuenta está lista. Revisá tu email con las credenciales de acceso."
            : isRejected
            ? "Nuestro equipo revisó tu solicitud y no pudo proceder. Te enviamos un email con los detalles."
            : needsInfo
            ? "Te enviamos un email con lo que nos falta confirmar."
            : `Nuestro equipo está configurando tu cuenta. Estimamos ${Math.max(1, data.remainingHours)} horas más.`}
        </p>

        {/* Action CTA */}
        {isDone && (
          <a
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 28px",
              background: BRAND_ORANGE,
              borderRadius: 10,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(255,94,26,0.3)",
              transition: `all 200ms ${EASE}`,
            }}
          >
            Entrar a NitroSales <ArrowRight size={16} />
          </a>
        )}
      </div>

      {/* Progreso (timeline) */}
      {!isRejected && (
        <div
          style={{
            padding: "28px 28px 20px",
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 20,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: TEXT_SECONDARY,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 24,
            }}
          >
            Progreso de la activación
          </div>

          <div style={{ position: "relative" }}>
            {STAGES.map((stage, idx) => {
              const isComplete = idx < currentStageIdx || isDone;
              const isCurrent = idx === currentStageIdx && !isDone;
              const isFuture = idx > currentStageIdx && !isDone;
              const isLast = idx === STAGES.length - 1;

              return (
                <div key={stage.key} style={{ display: "flex", gap: 16, position: "relative", paddingBottom: isLast ? 0 : 28 }}>
                  {/* Connector line */}
                  {!isLast && (
                    <div
                      style={{
                        position: "absolute",
                        left: 15,
                        top: 34,
                        bottom: 0,
                        width: 2,
                        background: isComplete ? ACCENT_GREEN : BORDER,
                        transition: `background 300ms ${EASE}`,
                      }}
                    />
                  )}

                  {/* Icon */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isComplete
                        ? ACCENT_GREEN
                        : isCurrent
                        ? BRAND_ORANGE
                        : "rgba(255,255,255,0.04)",
                      border: isComplete || isCurrent ? "none" : `1px solid ${BORDER}`,
                      color: isComplete || isCurrent ? "#fff" : TEXT_MUTED,
                      transition: `all 300ms ${EASE}`,
                      boxShadow: isCurrent ? "0 0 0 6px rgba(255,94,26,0.15)" : "none",
                    }}
                  >
                    {isComplete ? (
                      <CheckCircle2 size={16} />
                    ) : isCurrent ? (
                      <Loader2 size={16} className="spin-slow" />
                    ) : (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: isFuture ? TEXT_MUTED : TEXT_PRIMARY,
                        marginBottom: 3,
                        transition: `color 300ms ${EASE}`,
                      }}
                    >
                      {stage.label}
                    </div>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.5 }}>{stage.description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <style jsx global>{`
            @keyframes spin-slow { to { transform: rotate(360deg); } }
            .spin-slow { animation: spin-slow 2s linear infinite; }
          `}</style>
        </div>
      )}

      {/* Meta info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
        <InfoCard
          icon={<Clock size={16} color={TEXT_SECONDARY} />}
          label="Enviado"
          value={formatRelative(data.createdAt)}
        />
        <InfoCard
          icon={<Mail size={16} color={TEXT_SECONDARY} />}
          label="Email de contacto"
          value={data.contactEmail}
        />
      </div>

      {/* Refresh hint */}
      <div
        style={{
          textAlign: "center",
          padding: 16,
          color: TEXT_MUTED,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <RefreshCw size={12} />
        Esta página se actualiza automáticamente cada minuto
      </div>
    </div>
  );
}

function CenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    PENDING: { label: "En revisión", color: ACCENT_AMBER, bg: "rgba(245,158,11,0.1)" },
    IN_PROGRESS: { label: "Activando", color: BRAND_ORANGE, bg: "rgba(255,94,26,0.1)" },
    NEEDS_INFO: { label: "Info faltante", color: ACCENT_AMBER, bg: "rgba(245,158,11,0.1)" },
    ACTIVE: { label: "Cuenta activa", color: ACCENT_GREEN, bg: "rgba(34,197,94,0.1)" },
    REJECTED: { label: "Rechazada", color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
  };
  const c = config[status] || config.PENDING;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: c.bg,
        border: `1px solid ${c.color}40`,
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
        color: c.color,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: c.color,
          boxShadow: `0 0 6px ${c.color}`,
        }}
      />
      {c.label}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      style={{
        padding: "16px 18px",
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {icon}
        <span
          style={{
            fontSize: 11,
            color: TEXT_SECONDARY,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Hace un momento";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString("es-AR");
}
