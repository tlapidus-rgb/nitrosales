// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/onboardings — Solicitudes de activación (movido al Centro de Control)
// ══════════════════════════════════════════════════════════════
// Misma lógica que /admin/onboardings pero en paleta dark y dentro del
// Centro de Control. Reutiliza endpoints existentes /api/admin/onboardings.
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Mail,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";

const BRAND_ORANGE = "#FF5E1A";
const ACCENT_GREEN = "#22C55E";
const ACCENT_AMBER = "#F59E0B";
const ACCENT_RED = "#EF4444";

const STATUS_CONFIG: Record<string, { label: string; color: string; priority: number }> = {
  PENDING: { label: "Pendiente", color: ACCENT_AMBER, priority: 1 },
  IN_PROGRESS: { label: "En curso", color: BRAND_ORANGE, priority: 2 },
  NEEDS_INFO: { label: "Falta info", color: ACCENT_AMBER, priority: 3 },
  ACTIVE: { label: "Activa", color: ACCENT_GREEN, priority: 4 },
  REJECTED: { label: "Rechazada", color: ACCENT_RED, priority: 5 },
};

export default function ControlOnboardingsPage() {
  const [requests, setRequests] = useState<any[]>([]);
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

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
          Solicitudes de activación
        </h1>
        <p style={{ color: "#71717A", fontSize: 13, margin: "6px 0 0" }}>
          Revisá, aprobá o rechazá solicitudes de nuevos clientes del formulario{" "}
          <code style={{ color: "#A1A1AA" }}>/onboarding</code>.
        </p>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          padding: 4,
          background: "#0F0F11",
          borderRadius: 10,
          width: "fit-content",
          border: "1px solid #1F1F23",
          flexWrap: "wrap",
        }}
      >
        <FilterPill
          label="Todas"
          count={Object.values(counts).reduce((a, b) => a + b, 0)}
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
        />
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
            marginLeft: 4,
            padding: "6px 10px",
            background: "transparent",
            border: "none",
            color: "#71717A",
            cursor: "pointer",
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
          }}
        >
          <RefreshCw size={12} className={loading ? "spin" : ""} />
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8,
            color: "#F87171",
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {loading && requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#71717A", fontSize: 13 }}>
          Cargando…
        </div>
      ) : requests.length === 0 ? (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            background: "#0F0F11",
            border: "1px dashed #27272A",
            borderRadius: 10,
          }}
        >
          <Building2 size={32} color="#52525B" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "#E4E4E7", marginBottom: 4 }}>
            {filter === "ALL" ? "No hay solicitudes todavía" : "Ninguna solicitud con este estado"}
          </div>
          <div style={{ fontSize: 12, color: "#71717A" }}>
            Las solicitudes llegan al llenarse el formulario en <code>/onboarding</code>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: "#0F0F11",
            border: "1px solid #1F1F23",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#18181B", borderBottom: "1px solid #1F1F23" }}>
                <th style={th}>Empresa</th>
                <th style={th}>Contacto</th>
                <th style={th}>Plataformas</th>
                <th style={th}>Estado</th>
                <th style={th}>Recibido</th>
                <th style={{ ...th, textAlign: "right", paddingRight: 20 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr
                  key={req.id}
                  style={{ borderBottom: "1px solid #1F1F23", cursor: "pointer" }}
                  onClick={() => setSelectedId(req.id)}
                >
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>
                      {req.companyName}
                    </div>
                    <div style={{ fontSize: 11, color: "#71717A", marginTop: 2 }}>
                      {req.storeUrl}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 12, color: "#E4E4E7" }}>{req.contactName}</div>
                    <div style={{ fontSize: 11, color: "#71717A", marginTop: 2 }}>
                      {req.contactEmail}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {req.hasVtex && <Chip color="#FF0080" label="VTEX" />}
                      {req.hasMl && <Chip color="#FFE600" label="ML" textColor="#78350F" />}
                      {req.hasMeta && <Chip color="#1877F2" label="Meta" />}
                      {req.hasGoogleAds && <Chip color="#4285F4" label="Google" />}
                    </div>
                  </td>
                  <td style={td}>
                    <StatusPill status={req.status} />
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 12, color: "#71717A" }}>
                      {formatRelative(req.createdAt)}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: "right", paddingRight: 20 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(req.id);
                      }}
                      style={{
                        padding: "5px 10px",
                        background: "transparent",
                        border: "1px solid #27272A",
                        borderRadius: 7,
                        color: "#A1A1AA",
                        fontSize: 11,
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

      {selectedId && (
        <DetailDrawer id={selectedId} onClose={() => setSelectedId(null)} onRefresh={load} />
      )}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 10,
  fontWeight: 700,
  color: "#71717A",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
const td: React.CSSProperties = { padding: "12px 14px", verticalAlign: "top" };

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
        padding: "6px 10px",
        background: active ? "#27272A" : "transparent",
        border: "none",
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 500,
        color: active ? "#fff" : "#A1A1AA",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 7,
      }}
    >
      {color && active && (
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      )}
      {label}
      {count > 0 && (
        <span
          style={{
            fontSize: 10,
            padding: "1px 5px",
            background: active ? "#1F1F23" : "rgba(113,113,122,0.15)",
            color: "#71717A",
            borderRadius: 99,
            minWidth: 16,
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
        gap: 5,
        padding: "3px 8px",
        background: `${cfg.color}1A`,
        color: cfg.color,
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        border: `1px solid ${cfg.color}33`,
      }}
    >
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function Chip({ color, label, textColor }: { color: string; label: string; textColor?: string }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: "2px 6px",
        background: `${color}1A`,
        color: textColor || color,
        border: `1px solid ${color}33`,
        borderRadius: 5,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </span>
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

// ─── Detail Drawer (dark variant) ──────────────────────────────
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
        background: "rgba(0,0,0,0.6)",
        zIndex: 200,
        backdropFilter: "blur(6px)",
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
          background: "#0A0A0B",
          borderLeft: "1px solid #1F1F23",
          overflowY: "auto",
          animation: "slideInRight 280ms cubic-bezier(0.16, 1, 0.3, 1)",
          color: "#E4E4E7",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #1F1F23",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            background: "#0A0A0B",
            zIndex: 2,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
            {loading ? "Cargando…" : detail?.companyName || "Detalle"}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              color: "#71717A",
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {errorMsg && (
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8,
                color: "#F87171",
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              {errorMsg}
            </div>
          )}

          {result && (
            <div
              style={{
                padding: "14px 16px",
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 10,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <CheckCircle2 size={16} color={ACCENT_GREEN} />
                <div style={{ fontSize: 13, fontWeight: 700, color: "#4ADE80" }}>
                  Cuenta activada
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#A1A1AA", marginBottom: 10 }}>
                Email enviado a <strong>{result.emailSentTo}</strong>
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#71717A",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                }}
              >
                Password temporal
              </div>
              <div
                style={{
                  fontFamily: "'SF Mono', Menlo, monospace",
                  fontSize: 12,
                  padding: "8px 12px",
                  background: "#18181B",
                  border: "1px solid #27272A",
                  borderRadius: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#fff",
                }}
              >
                <span>{result._adminNote?.temporaryPassword}</span>
                <button
                  onClick={() => copy("pw", result._adminNote?.temporaryPassword || "")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#A1A1AA",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {copiedField === "pw" ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          )}

          {detail && (
            <>
              <div style={{ marginBottom: 20 }}>
                <StatusPill status={detail.status} />
              </div>

              <DSection title="Empresa">
                <DRow label="Nombre" value={detail.companyName} />
                <DRow label="Slug" value={detail.proposedSlug} copyable onCopy={copy} field="slug" copied={copiedField === "slug"} />
                <DRow label="URL" value={detail.storeUrl} href={detail.storeUrl} />
                {detail.industry && <DRow label="Industria" value={detail.industry} />}
                {detail.cuit && <DRow label="CUIT" value={detail.cuit} copyable onCopy={copy} field="cuit" copied={copiedField === "cuit"} />}
                <DRow label="Zona horaria" value={detail.timezone || "—"} />
                <DRow label="Moneda" value={detail.currency || "ARS"} />
                {detail.fiscalCondition && <DRow label="Condición fiscal" value={detail.fiscalCondition} />}
              </DSection>

              <DSection title="Contacto">
                <DRow label="Nombre" value={detail.contactName} />
                <DRow label="Email" value={detail.contactEmail} copyable onCopy={copy} field="email" copied={copiedField === "email"} />
                {detail.contactPhone && <DRow label="Teléfono" value={detail.contactPhone} copyable onCopy={copy} field="phone" copied={copiedField === "phone"} />}
                {detail.contactWhatsapp && <DRow label="WhatsApp" value={detail.contactWhatsapp} copyable onCopy={copy} field="wa" copied={copiedField === "wa"} />}
              </DSection>

              {/* VTEX */}
              <PlatformBlock name="VTEX" color="#FF0080" configured={detail.hasVtexCredentials}>
                {detail.vtexAccountName && (
                  <DRow label="Account" value={detail.vtexAccountName} copyable onCopy={copy} field="vtexAcc" copied={copiedField === "vtexAcc"} />
                )}
                {detail.vtexAppKey && <DSecret label="App Key" value={detail.vtexAppKey} field="vtexKey" onCopy={copy} copiedField={copiedField} />}
                {detail.vtexAppToken && <DSecret label="App Token" value={detail.vtexAppToken} field="vtexTok" onCopy={copy} copiedField={copiedField} />}
                {!detail.hasVtexCredentials && !detail.vtexAccountName && (
                  <EmptyLabel label="No configurado" />
                )}
              </PlatformBlock>

              {/* MercadoLibre */}
              <PlatformBlock name="MercadoLibre" color="#FFE600" configured={!!detail.mlUsername}>
                {detail.mlUsername ? (
                  <DRow label="Usuario" value={detail.mlUsername} copyable onCopy={copy} field="mlUser" copied={copiedField === "mlUser"} />
                ) : (
                  <EmptyLabel label="No configurado" />
                )}
              </PlatformBlock>

              {/* Meta Ads */}
              <PlatformBlock name="Meta Ads" color="#1877F2" configured={detail.hasMetaCredentials}>
                {detail.metaAdAccountId && (
                  <DRow label="Ad Account" value={detail.metaAdAccountId} copyable onCopy={copy} field="metaAdAcc" copied={copiedField === "metaAdAcc"} />
                )}
                {detail.metaAccessToken && <DSecret label="Access Token" value={detail.metaAccessToken} field="metaTok" onCopy={copy} copiedField={copiedField} />}
                {!detail.hasMetaCredentials && !detail.metaAdAccountId && (
                  <EmptyLabel label="No configurado" />
                )}
              </PlatformBlock>

              {/* Meta Pixel */}
              <PlatformBlock name="Meta Pixel" color="#1877F2" configured={detail.hasMetaPixelCredentials}>
                {detail.metaPixelId && (
                  <DRow label="Pixel ID" value={detail.metaPixelId} copyable onCopy={copy} field="pxId" copied={copiedField === "pxId"} />
                )}
                {detail.metaPixelToken && <DSecret label="Access Token" value={detail.metaPixelToken} field="pxTok" onCopy={copy} copiedField={copiedField} />}
                {!detail.hasMetaPixelCredentials && !detail.metaPixelId && (
                  <EmptyLabel label="No configurado" />
                )}
              </PlatformBlock>

              {/* Google Ads */}
              <PlatformBlock name="Google Ads" color="#4285F4" configured={!!detail.googleAdsCustomerId}>
                {detail.googleAdsCustomerId ? (
                  <DRow label="Customer ID" value={detail.googleAdsCustomerId} copyable onCopy={copy} field="gAdsId" copied={copiedField === "gAdsId"} />
                ) : (
                  <EmptyLabel label="No configurado" />
                )}
              </PlatformBlock>

              {detail.adminNotes && (
                <DSection title="Notas">
                  <div style={{ fontSize: 12, color: "#A1A1AA", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {detail.adminNotes}
                  </div>
                </DSection>
              )}

              {detail.status !== "ACTIVE" && detail.status !== "REJECTED" && !result && (
                <div style={{ display: "flex", gap: 10, marginTop: 24, paddingTop: 20, borderTop: "1px solid #1F1F23" }}>
                  <button
                    onClick={activate}
                    disabled={activating || rejecting}
                    style={{
                      flex: 1,
                      padding: "12px 18px",
                      background: activating ? "#27272A" : ACCENT_GREEN,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: activating || rejecting ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <CheckCircle2 size={14} />
                    {activating ? "Activando…" : "Activar cuenta"}
                  </button>
                  <button
                    onClick={reject}
                    disabled={activating || rejecting}
                    style={{
                      padding: "12px 18px",
                      background: "transparent",
                      color: "#F87171",
                      border: "1px solid #F8717133",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: activating || rejecting ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <XCircle size={14} />
                    {rejecting ? "…" : "Rechazar"}
                  </button>
                </div>
              )}

              {detail.createdOrgId && (
                <div
                  style={{
                    marginTop: 18,
                    padding: "12px 16px",
                    background: "rgba(34,197,94,0.06)",
                    border: "1px solid rgba(34,197,94,0.2)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#86EFAC",
                  }}
                >
                  <strong>Cuenta activa.</strong> Org ID:{" "}
                  <code style={{ background: "#0F0F11", padding: "2px 6px", borderRadius: 4, fontSize: 10 }}>
                    {detail.createdOrgId}
                  </code>
                  {detail.activatedAt && (
                    <div style={{ fontSize: 11, marginTop: 4, color: "#6EE7B7" }}>
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

// ─── dark variants ───
function DSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#71717A",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ background: "#0F0F11", border: "1px solid #1F1F23", borderRadius: 8, padding: "4px 12px" }}>
        {children}
      </div>
    </div>
  );
}

function DRow({
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
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "9px 0",
        borderBottom: "1px solid #1F1F23",
      }}
    >
      <div style={{ fontSize: 11, color: "#71717A", fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: "60%" }}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              color: "#E4E4E7",
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
            {value} <ExternalLink size={10} color="#71717A" />
          </a>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "#E4E4E7",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "right",
            }}
          >
            {value}
          </div>
        )}
        {copyable && field && onCopy && (
          <button
            onClick={() => onCopy(field, value)}
            style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer", color: "#71717A" }}
          >
            {copied ? <Check size={11} color={ACCENT_GREEN} /> : <Copy size={11} />}
          </button>
        )}
      </div>
    </div>
  );
}

function PlatformBlock({
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
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          padding: "8px 12px",
          background: configured ? `${color}0D` : "#18181B",
          border: `1px solid ${configured ? `${color}33` : "#1F1F23"}`,
          borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: configured ? color : "#52525B",
            boxShadow: configured ? `0 0 6px ${color}80` : "none",
          }}
        />
        <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", flex: 1 }}>{name}</div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 7px",
            background: configured ? `${ACCENT_GREEN}20` : "#27272A",
            color: configured ? ACCENT_GREEN : "#71717A",
            borderRadius: 99,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {configured ? "Configurado" : "No conf."}
        </span>
      </div>
      <div style={{ background: "#0F0F11", border: "1px solid #1F1F23", borderRadius: 8, padding: "4px 12px" }}>
        {children}
      </div>
    </div>
  );
}

function DSecret({
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
    <div style={{ padding: "9px 0", borderBottom: "1px solid #1F1F23" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "#71717A", fontWeight: 500 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!revealed && (
            <code
              style={{
                fontSize: 11,
                color: "#A1A1AA",
                fontFamily: "'SF Mono', Menlo, monospace",
              }}
            >
              {masked}
            </code>
          )}
          <button
            onClick={() => setRevealed((r) => !r)}
            style={{
              fontSize: 10,
              padding: "2px 7px",
              background: "transparent",
              border: "1px solid #27272A",
              borderRadius: 5,
              color: "#A1A1AA",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {revealed ? "Ocultar" : "Ver"}
          </button>
          <button
            onClick={() => onCopy(field, value)}
            style={{
              fontSize: 10,
              padding: "2px 7px",
              background: isCopied ? `${ACCENT_GREEN}1A` : "transparent",
              border: `1px solid ${isCopied ? ACCENT_GREEN : "#27272A"}`,
              borderRadius: 5,
              color: isCopied ? ACCENT_GREEN : "#A1A1AA",
              cursor: "pointer",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            {isCopied ? <><Check size={10} /> Copiado</> : <><Copy size={10} /> Copiar</>}
          </button>
        </div>
      </div>
      {revealed && (
        <div
          style={{
            marginTop: 6,
            padding: "7px 9px",
            background: "#18181B",
            border: "1px solid #27272A",
            borderRadius: 5,
            fontFamily: "'SF Mono', Menlo, monospace",
            fontSize: 10,
            color: "#E4E4E7",
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

function EmptyLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: "10px 0", fontSize: 11, color: "#52525B", fontStyle: "italic", textAlign: "center" }}>
      {label}
    </div>
  );
}
