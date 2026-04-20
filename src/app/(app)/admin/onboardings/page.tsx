// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /admin/onboardings — Panel admin de solicitudes de activación
// ══════════════════════════════════════════════════════════════
// Lista de todos los requests con filtros por status + detalle + acciones.
// Solo visible para isInternalUser (Tomy).
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Mail,
  Phone,
  Globe,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  Key,
  Zap,
  ShieldCheck,
} from "lucide-react";

const BRAND_ORANGE = "#FF5E1A";
const ACCENT_GREEN = "#22C55E";
const ACCENT_AMBER = "#F59E0B";
const ACCENT_RED = "#EF4444";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; priority: number }> = {
  PENDING: { label: "Pendiente", color: ACCENT_AMBER, bg: "rgba(245,158,11,0.08)", priority: 1 },
  IN_PROGRESS: { label: "En curso", color: BRAND_ORANGE, bg: "rgba(255,94,26,0.08)", priority: 2 },
  NEEDS_INFO: { label: "Falta info", color: ACCENT_AMBER, bg: "rgba(245,158,11,0.08)", priority: 3 },
  ACTIVE: { label: "Activa", color: ACCENT_GREEN, bg: "rgba(34,197,94,0.08)", priority: 4 },
  REJECTED: { label: "Rechazada", color: ACCENT_RED, bg: "rgba(239,68,68,0.08)", priority: 5 },
};

interface OnboardingSummary {
  id: string;
  status: string;
  companyName: string;
  proposedSlug: string;
  storeUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  hasVtex: boolean;
  hasMl: boolean;
  hasMeta: boolean;
  hasGoogleAds: boolean;
  progressStage: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

export default function AdminOnboardingsPage() {
  const [requests, setRequests] = useState<OnboardingSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const url = filter === "ALL" ? "/api/admin/onboardings" : `/api/admin/onboardings?status=${filter}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Error ${res.status}`);
        return;
      }
      setRequests(json.requests);
      setCounts(json.statusCounts);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const filtered = useMemo(() => requests, [requests]);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
          Admin · Onboarding
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#0F172A" }}>
          Solicitudes de activación
        </h1>
        <p style={{ color: "#64748B", fontSize: 14, margin: "8px 0 0", lineHeight: 1.6 }}>
          Revisá, aprobá o rechazá solicitudes de nuevos clientes que llenaron el formulario público.
        </p>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          padding: 4,
          background: "rgba(241,245,249,0.6)",
          borderRadius: 12,
          width: "fit-content",
          flexWrap: "wrap",
        }}
      >
        <FilterPill label="Todas" count={Object.values(counts).reduce((a, b) => a + b, 0)} active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        {Object.entries(STATUS_CONFIG)
          .sort((a, b) => a[1].priority - b[1].priority)
          .map(([key, cfg]) => (
            <FilterPill
              key={key}
              label={cfg.label}
              count={counts[key] || 0}
              active={filter === key}
              onClick={() => setFilter(key)}
              color={cfg.color}
            />
          ))}
        <button
          onClick={load}
          title="Recargar"
          style={{
            marginLeft: 8,
            padding: "8px 12px",
            background: "transparent",
            border: "none",
            color: "#64748B",
            cursor: "pointer",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
          }}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "14px 18px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10,
            color: "#B91C1C",
            fontSize: 14,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {/* Tabla */}
      {loading && requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#64748B" }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <th style={th}>Empresa</th>
                <th style={th}>Contacto</th>
                <th style={th}>Plataformas</th>
                <th style={th}>Estado</th>
                <th style={th}>Recibido</th>
                <th style={{ ...th, textAlign: "right", paddingRight: 20 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => (
                <tr
                  key={req.id}
                  style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer" }}
                  onClick={() => setSelectedId(req.id)}
                >
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 14 }}>{req.companyName}</div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{req.storeUrl}</div>
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 13, color: "#0F172A" }}>{req.contactName}</div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{req.contactEmail}</div>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {req.hasVtex && <PlatformChip color="#FF0080" label="VTEX" />}
                      {req.hasMl && <PlatformChip color="#FFE600" label="ML" textColor="#78350F" />}
                      {req.hasMeta && <PlatformChip color="#1877F2" label="Meta" />}
                      {req.hasGoogleAds && <PlatformChip color="#4285F4" label="Google" />}
                    </div>
                  </td>
                  <td style={td}>
                    <StatusPill status={req.status} />
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 13, color: "#64748B" }}>{formatRelative(req.createdAt)}</div>
                  </td>
                  <td style={{ ...td, textAlign: "right", paddingRight: 20 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(req.id);
                      }}
                      style={{
                        padding: "6px 12px",
                        background: "transparent",
                        border: "1px solid #E2E8F0",
                        borderRadius: 8,
                        color: "#475569",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Ver detalle →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selectedId && <DetailDrawer id={selectedId} onClose={() => setSelectedId(null)} onRefresh={load} />}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
const td: React.CSSProperties = { padding: "14px 16px", verticalAlign: "top" };

function FilterPill({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        background: active ? "#fff" : "transparent",
        border: "none",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        color: active ? "#0F172A" : "#64748B",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
        transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {color && active && (
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      )}
      {label}
      {count > 0 && (
        <span
          style={{
            fontSize: 11,
            padding: "1px 6px",
            background: active ? "#F1F5F9" : "rgba(100,116,139,0.15)",
            color: "#64748B",
            borderRadius: 99,
            minWidth: 18,
            textAlign: "center",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: cfg.bg,
        color: cfg.color,
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        border: `1px solid ${cfg.color}40`,
      }}
    >
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function PlatformChip({ color, label, textColor }: { color: string; label: string; textColor?: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        background: `${color}15`,
        color: textColor || color,
        border: `1px solid ${color}40`,
        borderRadius: 6,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </span>
  );
}

function EmptyState({ filter }: { filter: string }) {
  return (
    <div style={{ padding: 80, textAlign: "center", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14 }}>
      <Building2 size={40} color="#CBD5E1" style={{ marginBottom: 16 }} />
      <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A", marginBottom: 8 }}>
        {filter === "ALL" ? "No hay solicitudes todavía" : "No hay solicitudes con este estado"}
      </div>
      <div style={{ fontSize: 13, color: "#64748B" }}>
        Las solicitudes llegan cuando alguien completa el formulario en /onboarding
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Ahora";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString("es-AR");
}

// ─── Detail Drawer ──────────────────────────────────────────
function DetailDrawer({
  id,
  onClose,
  onRefresh,
}: {
  id: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/onboardings/${id}`);
        const json = await res.json();
        if (!res.ok) {
          setErrorMsg(json.error || "Error");
          return;
        }
        setDetail(json.request);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const activate = async () => {
    if (!confirm(`¿Activar la cuenta de ${detail.companyName}?\n\nSe creará la organización, el user OWNER, y se enviarán credenciales por email.`)) return;
    setActivating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/onboardings/${id}/activate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Error al activar");
        setActivating(false);
        return;
      }
      setResult(json);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
      setActivating(false);
    }
  };

  const reject = async () => {
    const reason = prompt("Razón del rechazo (se agrega a adminNotes):");
    if (!reason) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/admin/onboardings/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Error");
        return;
      }
      onRefresh();
      onClose();
    } finally {
      setRejecting(false);
    }
  };

  const copy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        zIndex: 100,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(640px, 95vw)",
          background: "#fff",
          overflowY: "auto",
          boxShadow: "-20px 0 60px rgba(15,23,42,0.15)",
          animation: "slideInRight 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ padding: "24px 28px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
            {loading ? "Cargando…" : detail?.companyName || "Detalle"}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 24, color: "#94A3B8", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "24px 28px" }}>
          {errorMsg && (
            <div
              style={{
                padding: "14px 18px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 10,
                color: "#B91C1C",
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              {errorMsg}
            </div>
          )}

          {result && (
            <div
              style={{
                padding: "18px 20px",
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 12,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <CheckCircle2 size={18} color={ACCENT_GREEN} />
                <div style={{ fontSize: 14, fontWeight: 700, color: "#14532D" }}>Cuenta activada correctamente</div>
              </div>
              <div style={{ fontSize: 12, color: "#166534", marginBottom: 10 }}>
                Email enviado a <strong>{result.emailSentTo}</strong> con las credenciales.
              </div>
              <div style={{ fontSize: 11, color: "#166534", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Password temporal (backup por si el email falla)
              </div>
              <div
                style={{
                  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                  fontSize: 14,
                  padding: "10px 14px",
                  background: "#fff",
                  border: "1px solid rgba(34,197,94,0.3)",
                  borderRadius: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{result._adminNote?.temporaryPassword}</span>
                <button
                  onClick={() => copy("pw", result._adminNote?.temporaryPassword || "")}
                  style={{ background: "transparent", border: "none", color: "#166534", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                >
                  {copiedField === "pw" ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          )}

          {detail && (
            <>
              <StatusPill status={detail.status} />

              <Section title="Empresa" icon={<Building2 size={14} />}>
                <Row label="Nombre" value={detail.companyName} />
                <Row label="Slug" value={detail.proposedSlug} copyable onCopy={copy} field="slug" copied={copiedField === "slug"} />
                <Row label="URL tienda" value={detail.storeUrl} href={detail.storeUrl} />
                {detail.industry && <Row label="Industria" value={detail.industry} />}
                {detail.cuit && <Row label="CUIT" value={detail.cuit} copyable onCopy={copy} field="cuit" copied={copiedField === "cuit"} />}
                <Row label="Zona horaria" value={detail.timezone || "—"} />
                <Row label="Moneda" value={detail.currency || "ARS"} />
                {detail.fiscalCondition && <Row label="Condición fiscal" value={detail.fiscalCondition} />}
              </Section>

              <Section title="Contacto" icon={<Mail size={14} />}>
                <Row label="Nombre" value={detail.contactName} />
                <Row label="Email" value={detail.contactEmail} copyable onCopy={copy} field="email" copied={copiedField === "email"} />
                {detail.contactPhone && <Row label="Teléfono" value={detail.contactPhone} copyable onCopy={copy} field="phone" copied={copiedField === "phone"} />}
                {detail.contactWhatsapp && <Row label="WhatsApp" value={detail.contactWhatsapp} copyable onCopy={copy} field="wa" copied={copiedField === "wa"} />}
              </Section>

              {/* VTEX */}
              <PlatformSection
                name="VTEX"
                color="#FF0080"
                configured={detail.hasVtexCredentials}
              >
                {detail.vtexAccountName && (
                  <Row label="Account Name" value={detail.vtexAccountName} copyable onCopy={copy} field="vtexAcc" copied={copiedField === "vtexAcc"} />
                )}
                {detail.vtexAppKey && (
                  <SecretRow label="App Key" value={detail.vtexAppKey} field="vtexKey" onCopy={copy} copiedField={copiedField} />
                )}
                {detail.vtexAppToken && (
                  <SecretRow label="App Token" value={detail.vtexAppToken} field="vtexTok" onCopy={copy} copiedField={copiedField} />
                )}
                {!detail.hasVtexCredentials && !detail.vtexAccountName && (
                  <EmptyRow label="VTEX no configurado en la solicitud" />
                )}
              </PlatformSection>

              {/* MercadoLibre */}
              <PlatformSection
                name="MercadoLibre"
                color="#FFE600"
                configured={!!detail.mlUsername}
              >
                {detail.mlUsername ? (
                  <Row label="Usuario" value={detail.mlUsername} copyable onCopy={copy} field="mlUser" copied={copiedField === "mlUser"} />
                ) : (
                  <EmptyRow label="ML no configurado en la solicitud" />
                )}
                {detail.mlUsername && (
                  <div style={{ padding: "8px 0", fontSize: 11, color: "#64748B", fontStyle: "italic" }}>
                    OAuth se realiza al activar (ML te va a pedir login).
                  </div>
                )}
              </PlatformSection>

              {/* Meta Ads */}
              <PlatformSection
                name="Meta Ads (Facebook/Instagram)"
                color="#1877F2"
                configured={detail.hasMetaCredentials}
              >
                {detail.metaAdAccountId && (
                  <Row label="Ad Account ID" value={detail.metaAdAccountId} copyable onCopy={copy} field="metaAdAcc" copied={copiedField === "metaAdAcc"} />
                )}
                {detail.metaAccessToken && (
                  <SecretRow label="Access Token" value={detail.metaAccessToken} field="metaTok" onCopy={copy} copiedField={copiedField} />
                )}
                {!detail.hasMetaCredentials && !detail.metaAdAccountId && (
                  <EmptyRow label="Meta Ads no configurado en la solicitud" />
                )}
              </PlatformSection>

              {/* Meta Pixel */}
              <PlatformSection
                name="Meta Pixel (CAPI)"
                color="#1877F2"
                configured={detail.hasMetaPixelCredentials}
              >
                {detail.metaPixelId && (
                  <Row label="Pixel ID" value={detail.metaPixelId} copyable onCopy={copy} field="pxId" copied={copiedField === "pxId"} />
                )}
                {detail.metaPixelToken && (
                  <SecretRow label="Access Token" value={detail.metaPixelToken} field="pxTok" onCopy={copy} copiedField={copiedField} />
                )}
                {!detail.hasMetaPixelCredentials && !detail.metaPixelId && (
                  <EmptyRow label="Meta Pixel no configurado en la solicitud" />
                )}
              </PlatformSection>

              {/* Google Ads */}
              <PlatformSection
                name="Google Ads"
                color="#4285F4"
                configured={!!detail.googleAdsCustomerId}
              >
                {detail.googleAdsCustomerId ? (
                  <Row label="Customer ID" value={detail.googleAdsCustomerId} copyable onCopy={copy} field="gAdsId" copied={copiedField === "gAdsId"} />
                ) : (
                  <EmptyRow label="Google Ads no configurado en la solicitud" />
                )}
                {detail.googleAdsCustomerId && (
                  <div style={{ padding: "8px 0", fontSize: 11, color: "#64748B", fontStyle: "italic" }}>
                    OAuth se realiza al activar (Google te va a pedir login).
                  </div>
                )}
              </PlatformSection>

              {detail.adminNotes && (
                <Section title="Admin notes" icon={<AlertCircle size={14} />}>
                  <div style={{ fontSize: 12, color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{detail.adminNotes}</div>
                </Section>
              )}

              {detail.status !== "ACTIVE" && detail.status !== "REJECTED" && !result && (
                <div style={{ display: "flex", gap: 12, marginTop: 28, paddingTop: 24, borderTop: "1px solid #E2E8F0" }}>
                  <button
                    onClick={activate}
                    disabled={activating || rejecting}
                    style={{
                      flex: 1,
                      padding: "14px 20px",
                      background: activating ? "#CBD5E1" : ACCENT_GREEN,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: activating || rejecting ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      boxShadow: "0 4px 12px rgba(34,197,94,0.25)",
                    }}
                  >
                    <CheckCircle2 size={16} />
                    {activating ? "Activando…" : "Activar cuenta"}
                  </button>
                  <button
                    onClick={reject}
                    disabled={activating || rejecting}
                    style={{
                      padding: "14px 20px",
                      background: "transparent",
                      color: ACCENT_RED,
                      border: `1px solid ${ACCENT_RED}40`,
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: activating || rejecting ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <XCircle size={16} />
                    {rejecting ? "…" : "Rechazar"}
                  </button>
                </div>
              )}

              {detail.createdOrgId && (
                <div
                  style={{
                    marginTop: 20,
                    padding: "14px 18px",
                    background: "rgba(34,197,94,0.06)",
                    border: "1px solid rgba(34,197,94,0.2)",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "#14532D",
                  }}
                >
                  <strong>Cuenta activa.</strong> Org ID: <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{detail.createdOrgId}</code>
                  {detail.activatedAt && (
                    <div style={{ fontSize: 11, marginTop: 4, color: "#166534" }}>
                      Activada {formatRelative(detail.activatedAt)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <style jsx global>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#64748B",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {icon}
        {title}
      </div>
      <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "4px 14px" }}>{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  href,
  copyable,
  onCopy,
  field,
  copied,
}: {
  label: string;
  value: string;
  href?: string;
  copyable?: boolean;
  onCopy?: (f: string, v: string) => void;
  field?: string;
  copied?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #E2E8F0" }}>
      <div style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: "60%" }}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: "#0F172A",
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value} <ExternalLink size={11} color="#94A3B8" />
          </a>
        ) : (
          <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
            {value}
          </div>
        )}
        {copyable && field && onCopy && (
          <button
            onClick={() => onCopy(field, value)}
            style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "#64748B" }}
          >
            {copied ? <Check size={12} color={ACCENT_GREEN} /> : <Copy size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Platform section (una por plataforma, con header de color) ──
function PlatformSection({
  name,
  color,
  configured,
  children,
}: {
  name: string;
  color: string;
  configured: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          padding: "10px 14px",
          background: configured ? `${color}0d` : "#F8FAFC",
          border: `1px solid ${configured ? `${color}33` : "#E2E8F0"}`,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: configured ? color : "#CBD5E1",
            boxShadow: configured ? `0 0 8px ${color}80` : "none",
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", flex: 1 }}>{name}</div>
        {configured ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              background: `${ACCENT_GREEN}20`,
              color: ACCENT_GREEN,
              borderRadius: 99,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            ✓ Configurado
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              background: "#F1F5F9",
              color: "#94A3B8",
              borderRadius: 99,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            No configurado
          </span>
        )}
      </div>
      <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "4px 14px" }}>{children}</div>
    </div>
  );
}

// ─── Secret row (token con mostrar/ocultar) ──
function SecretRow({
  label,
  value,
  field,
  onCopy,
  copiedField,
}: {
  label: string;
  value: string;
  field: string;
  onCopy: (f: string, v: string) => void;
  copiedField: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const masked = value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "••••••••";
  const isCopied = copiedField === field;
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #E2E8F0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: revealed ? 6 : 0 }}>
        <div style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!revealed && (
            <code
              style={{
                fontSize: 12,
                color: "#475569",
                fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                letterSpacing: "0.04em",
              }}
            >
              {masked}
            </code>
          )}
          <button
            onClick={() => setRevealed((r) => !r)}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              background: "transparent",
              border: "1px solid #CBD5E1",
              borderRadius: 6,
              color: "#475569",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {revealed ? "Ocultar" : "Ver"}
          </button>
          <button
            onClick={() => onCopy(field, value)}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              background: isCopied ? `${ACCENT_GREEN}15` : "transparent",
              border: `1px solid ${isCopied ? ACCENT_GREEN : "#CBD5E1"}`,
              borderRadius: 6,
              color: isCopied ? ACCENT_GREEN : "#475569",
              cursor: "pointer",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {isCopied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
          </button>
        </div>
      </div>
      {revealed && (
        <div
          style={{
            marginTop: 4,
            padding: "8px 10px",
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 6,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: 11,
            color: "#0F172A",
            wordBreak: "break-all",
            lineHeight: 1.5,
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "12px 0",
        fontSize: 12,
        color: "#94A3B8",
        fontStyle: "italic",
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}
