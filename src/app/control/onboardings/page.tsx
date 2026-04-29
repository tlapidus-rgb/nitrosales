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
  PENDING: { label: "Pendiente aprobar cuenta", color: ACCENT_AMBER, priority: 1 },
  NEEDS_INFO: { label: "Pendiente aprobar backfill", color: ACCENT_AMBER, priority: 2 },
  IN_PROGRESS: { label: "Cliente completando wizard", color: BRAND_ORANGE, priority: 3 },
  BACKFILLING: { label: "Backfilling", color: BRAND_ORANGE, priority: 4 },
  ACTIVE: { label: "Activa", color: ACCENT_GREEN, priority: 5 },
  REJECTED: { label: "Rechazada", color: ACCENT_RED, priority: 6 },
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

      {/* Migration banner — MercadoLibre sync v2 */}
      <MigrationBanner />

      {/* Email flow debug — diagnostica por qué no llegó el email */}
      <EmailFlowDebug />

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
  const [approvingBackfill, setApprovingBackfill] = useState(false);
  const [activatingClient, setActivatingClient] = useState(false);
  const [resetting, setResetting] = useState<"none" | "soft" | "wipe">("none");
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [bfPlatforms, setBfPlatforms] = useState<Record<string, boolean>>({});
  const [addingPlatform, setAddingPlatform] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // F1.3 — Test de credenciales del lado admin
  const [testingCreds, setTestingCreds] = useState(false);
  const [credTestResult, setCredTestResult] = useState<any>(null);
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

  const testAllCredentials = async (opts?: { vtexTestSku?: string }) => {
    setTestingCreds(true);
    setCredTestResult(null);
    setErrorMsg(null);
    try {
      const url = opts?.vtexTestSku
        ? `/api/admin/onboardings/${id}/test-credentials?sku=${encodeURIComponent(opts.vtexTestSku)}`
        : `/api/admin/onboardings/${id}/test-credentials`;
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Error al probar credenciales");
        return;
      }
      setCredTestResult(json);
    } catch (err: any) {
      setErrorMsg(err.message || "Error de red");
    } finally {
      setTestingCreds(false);
    }
  };

  const resetBackfill = async (mode: "soft" | "wipe") => {
    const confirmMsg = mode === "soft"
      ? `RESET SUAVE para ${detail.companyName}\n\n` +
        `Borra solo los backfill_jobs. La data cargada (orders, customers, products) se mantiene.\n\n` +
        `Después podés re-aprobar el backfill y el sistema rellenará lo que falte sin destruir lo bueno.\n\n` +
        `¿Continuar?`
      : `⚠️ RESET COMPLETO (WIPE) para ${detail.companyName}\n\n` +
        `Borra TODA la data: orders, items, customers, products, eventos pixel, etc.\n` +
        `Mantiene: credenciales, organización, usuarios.\n\n` +
        `El cliente queda como recién terminó el wizard pero sin data. Vas a tener que re-aprobar el backfill.\n\n` +
        `Esta acción NO SE PUEDE DESHACER. ¿Continuar?`;

    if (!confirm(confirmMsg)) return;
    if (mode === "wipe" && !confirm("Confirmá una vez más: vas a borrar TODA la data del cliente.")) return;

    setResetting(mode);
    setErrorMsg(null);
    try {
      const path = mode === "soft"
        ? `/api/admin/onboardings/${id}/reset-backfill`
        : `/api/admin/onboardings/${id}/reset-wipe`;
      const res = await fetch(path, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Error en el reset");
        setResetting("none");
        return;
      }
      onRefresh();
      const detailRes = await fetch(`/api/admin/onboardings/${id}`);
      const detailJson = await detailRes.json();
      if (detailRes.ok) setDetail(detailJson.request);
      const summary = mode === "wipe"
        ? `Wipe completado. ${json.totalDeleted || 0} registros borrados.`
        : `Reset suave completado. ${json.jobsDeleted || 0} jobs borrados.`;
      alert(summary);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setResetting("none");
    }
  };

  const enterAsClient = async () => {
    if (!detail?.createdOrgId) {
      setErrorMsg("Este onboarding no tiene org creada todavía");
      return;
    }
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: detail.createdOrgId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Error generando link de impersonate");
        return;
      }
      // Mostrar quien es el target ANTES de navegar — si esta mal,
      // el admin puede cancelar y avisar.
      const target = json.target || {};
      const orgFromDetail = detail.companyName || "(sin nombre)";
      if (!confirm(
        `Vas a entrar como cliente (modo solo lectura).\n\n` +
        `Empresa esperada: ${orgFromDetail}\n` +
        `Usuario target: ${target.name || "?"} (${target.email || "?"})\n` +
        `Org ID: ${detail.createdOrgId}\n\n` +
        `Si el usuario no corresponde a la empresa esperada, CANCELÁ y avisame.\n\n` +
        `Para volver como admin: cerrá sesión desde el banner amarillo y volvé a loguear.\n\n` +
        `¿Continuar?`
      )) return;
      window.location.href = json.url;
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const activateClient = async () => {
    if (!confirm(`¿Habilitar el producto para ${detail.companyName}?\n\nEl cliente va a recibir email avisando que la plataforma está lista. Asegurate de haber revisado todo (impersonate desde "Entrar como cliente").`)) return;
    setActivatingClient(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/onboardings/${id}/activate-client`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Error");
        setActivatingClient(false);
        return;
      }
      onRefresh();
      const detailRes = await fetch(`/api/admin/onboardings/${id}`);
      const detailJson = await detailRes.json();
      if (detailRes.ok) setDetail(detailJson.request);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActivatingClient(false);
    }
  };

  // S59: abre modal con checkboxes de plataformas conectadas
  const openBackfillModal = () => {
    const initial: Record<string, boolean> = {};
    const conns = detail?.connections || [];
    for (const c of conns) {
      // Solo VTEX y ML son backfilleables hoy. Marcamos todas tildadas por default.
      if (c.platform === "VTEX" || c.platform === "MERCADOLIBRE") {
        initial[c.platform] = true;
      }
    }
    setBfPlatforms(initial);
    setShowBackfillModal(true);
  };

  const approveBackfill = async () => {
    const selected = Object.entries(bfPlatforms).filter(([_, v]) => v).map(([k]) => k);
    if (selected.length === 0) {
      setErrorMsg("Tenés que seleccionar al menos 1 plataforma");
      return;
    }
    setApprovingBackfill(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/onboardings/${id}/approve-backfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: selected }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Error");
        setApprovingBackfill(false);
        return;
      }
      setShowBackfillModal(false);
      onRefresh();
      const detailRes = await fetch(`/api/admin/onboardings/${id}`);
      const detailJson = await detailRes.json();
      if (detailRes.ok) setDetail(detailJson.request);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setApprovingBackfill(false);
    }
  };

  const addBackfillPlatform = async (platform: string) => {
    if (!confirm(`Agregar backfill de ${platform} para ${detail.companyName}?\n\nVa a procesar la data historica de esa plataforma sin tocar lo ya cargado.`)) return;
    setAddingPlatform(platform);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/onboardings/${id}/add-backfill-platform`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Error");
        return;
      }
      onRefresh();
      const detailRes = await fetch(`/api/admin/onboardings/${id}`);
      const detailJson = await detailRes.json();
      if (detailRes.ok) setDetail(detailJson.request);
      alert(`Backfill ${platform} agregado: ${json.monthsBack} meses.`);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setAddingPlatform(null);
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

              {detail.status === "BACKFILLING" && (
                <BackfillProgress onboardingId={detail.id} />
              )}

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

              {/* Conexiones reales que cargo el cliente en el wizard */}
              <ConnectionsList connections={detail.connections || []} />

              {detail.adminNotes && (
                <DSection title="Notas">
                  <div style={{ fontSize: 12, color: "#A1A1AA", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {detail.adminNotes}
                  </div>
                </DSection>
              )}

              {/* Aprobacion 1: cuenta */}
              {detail.status === "PENDING" && !result && (
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
                    {activating ? "Activando…" : "Aprobar cuenta (paso 1)"}
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

              {/* S59: Backfill terminó, esperando QA + activación manual */}
              {detail.status === "READY_FOR_REVIEW" && (
                <div style={{
                  marginTop: 24, paddingTop: 20, borderTop: "1px solid #1F1F23",
                }}>
                  <div style={{
                    padding: "14px 16px",
                    background: "rgba(34,197,94,0.06)",
                    border: "1px solid rgba(34,197,94,0.2)",
                    borderRadius: 10,
                    marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#86EFAC", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      ✓ Backfill completado · Listo para revisar
                    </div>
                    <div style={{ fontSize: 13, color: "#A1A1AA", lineHeight: 1.6 }}>
                      La data ya está cargada. Antes de habilitar al cliente, entrá como él (modo solo lectura) y validá que todo se ve bien.
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                      onClick={enterAsClient}
                      style={{
                        width: "100%",
                        padding: "12px 18px",
                        background: "transparent",
                        color: "#fff",
                        border: "1px solid rgba(245,158,11,0.4)",
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      👁 Entrar como cliente (read-only)
                    </button>

                    <button
                      onClick={activateClient}
                      disabled={activatingClient}
                      style={{
                        width: "100%",
                        padding: "14px 18px",
                        background: activatingClient ? "#27272A" : ACCENT_GREEN,
                        color: "#fff",
                        border: "none",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: activatingClient ? "wait" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <CheckCircle2 size={16} />
                      {activatingClient ? "Habilitando…" : "Habilitar cliente"}
                    </button>
                  </div>

                  <p style={{ fontSize: 11, color: "#71717A", marginTop: 10, textAlign: "center" }}>
                    El cliente recibe email "tu plataforma está lista" + acceso al producto.
                  </p>
                </div>
              )}

              {/* Estado intermedio: cuenta creada, esperando wizard del cliente */}
              {detail.status === "IN_PROGRESS" && (
                <div style={{
                  marginTop: 24, paddingTop: 20, borderTop: "1px solid #1F1F23",
                  padding: "16px 18px", background: "rgba(255,94,26,0.06)",
                  border: "1px solid rgba(255,94,26,0.2)", borderRadius: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    Esperando al cliente
                  </div>
                  <div style={{ fontSize: 13, color: "#A1A1AA", lineHeight: 1.6 }}>
                    Cuenta creada. El cliente recibió email con credenciales de login. Cuando complete el wizard adentro del producto, vas a recibir notificación para aprobar el backfill.
                  </div>
                </div>
              )}

              {/* Aprobacion 2: backfill */}
              {detail.status === "NEEDS_INFO" && !result && (
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #1F1F23" }}>
                  <div style={{
                    padding: "12px 14px", background: "rgba(34,197,94,0.06)",
                    border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8,
                    fontSize: 12, color: "#86EFAC", marginBottom: 14,
                  }}>
                    El cliente completó el wizard. <strong>Probá las credenciales</strong> antes de aprobar el backfill — si alguna falla, pedile al cliente que la corrija desde la app.
                  </div>

                  {/* F1.3 — Test de credenciales */}
                  <CredentialsTestBlock
                    onTest={testAllCredentials}
                    testing={testingCreds}
                    result={credTestResult}
                    connections={detail.connections}
                  />

                  <button
                    onClick={openBackfillModal}
                    disabled={approvingBackfill}
                    style={{
                      width: "100%",
                      padding: "12px 18px",
                      background: approvingBackfill ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: approvingBackfill ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      boxShadow: approvingBackfill ? "none" : "0 4px 16px rgba(255,94,26,0.25)",
                    }}
                  >
                    <CheckCircle2 size={14} />
                    {approvingBackfill ? "Aprobando…" : "Aprobar backfill (paso 2)"}
                  </button>
                </div>
              )}

              {/* S59: Modal de seleccion de plataformas para backfill */}
              {showBackfillModal && (
                <div
                  onClick={() => !approvingBackfill && setShowBackfillModal(false)}
                  style={{
                    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
                    justifyContent: "center", zIndex: 9999,
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "#0F0F11", border: "1px solid #1F1F23",
                      borderRadius: 14, padding: 28, maxWidth: 460, width: "92%",
                    }}
                  >
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>
                      Aprobar backfill — {detail.companyName}
                    </h3>
                    <p style={{ fontSize: 12, color: "#A1A1AA", margin: "0 0 20px", lineHeight: 1.5 }}>
                      Elegí qué plataformas backfillear ahora. Las no seleccionadas se pueden agregar después desde "Operaciones avanzadas".
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
                      {(detail.connections || [])
                        .filter((c: any) => c.platform === "VTEX" || c.platform === "MERCADOLIBRE")
                        .map((c: any) => {
                          const months = c.platform === "VTEX" ? detail.historyVtexMonths : detail.historyMlMonths;
                          return (
                            <label
                              key={c.platform}
                              style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "12px 14px",
                                background: bfPlatforms[c.platform] ? "rgba(255,94,26,0.08)" : "rgba(255,255,255,0.02)",
                                border: `1px solid ${bfPlatforms[c.platform] ? "rgba(255,94,26,0.3)" : "#1F1F23"}`,
                                borderRadius: 8, cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={!!bfPlatforms[c.platform]}
                                onChange={(e) => setBfPlatforms((p) => ({ ...p, [c.platform]: e.target.checked }))}
                                style={{ width: 16, height: 16, cursor: "pointer" }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                                  {c.platform === "VTEX" ? "VTEX" : "MercadoLibre"}
                                </div>
                                <div style={{ fontSize: 11, color: "#71717A", marginTop: 2 }}>
                                  {months} meses históricos · {c.status === "ACTIVE" ? "Conexión activa" : "Pendiente"}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                    </div>

                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setShowBackfillModal(false)}
                        disabled={approvingBackfill}
                        style={{
                          padding: "9px 16px", background: "transparent", color: "#A1A1AA",
                          border: "1px solid #27272A", borderRadius: 8,
                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={approveBackfill}
                        disabled={approvingBackfill || Object.values(bfPlatforms).every((v) => !v)}
                        style={{
                          padding: "9px 18px",
                          background: approvingBackfill ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
                          color: "#fff", border: "none", borderRadius: 8,
                          fontSize: 12, fontWeight: 700, cursor: approvingBackfill ? "wait" : "pointer",
                        }}
                      >
                        {approvingBackfill ? "Aprobando…" : `Aprobar ${Object.values(bfPlatforms).filter(Boolean).length} plataforma${Object.values(bfPlatforms).filter(Boolean).length === 1 ? "" : "s"}`}
                      </button>
                    </div>
                  </div>
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

              {/* S59: Operaciones avanzadas — disponibles en BACKFILLING / READY_FOR_REVIEW / ACTIVE */}
              {detail.createdOrgId && ["BACKFILLING", "READY_FOR_REVIEW", "ACTIVE"].includes(detail.status) && (
                <div style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: "1px solid #1F1F23",
                }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#71717A",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 12,
                  }}>
                    Operaciones avanzadas
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* S59: Agregar backfill de plataforma adicional */}
                    {(detail.connections || [])
                      .filter((c: any) => (c.platform === "VTEX" || c.platform === "MERCADOLIBRE") && c.status === "ACTIVE")
                      .map((c: any) => (
                        <button
                          key={`add-${c.platform}`}
                          onClick={() => addBackfillPlatform(c.platform)}
                          disabled={addingPlatform !== null}
                          style={{
                            width: "100%",
                            padding: "10px 14px",
                            background: "transparent",
                            color: "#60A5FA",
                            border: "1px solid rgba(96,165,250,0.4)",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: addingPlatform !== null ? "wait" : "pointer",
                            textAlign: "left",
                          }}
                        >
                          ➕ Backfillear {c.platform === "VTEX" ? "VTEX" : "MercadoLibre"} (extra)
                          <div style={{ fontSize: 10, color: "#A1A1AA", fontWeight: 400, marginTop: 2 }}>
                            Crea un job adicional para procesar la data histórica de esta plataforma. No toca lo ya cargado.
                          </div>
                        </button>
                      ))}

                    {/* Reset suave */}
                    <button
                      onClick={() => resetBackfill("soft")}
                      disabled={resetting !== "none"}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        background: "transparent",
                        color: "#FCD34D",
                        border: "1px solid rgba(251,191,36,0.4)",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: resetting !== "none" ? "wait" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      🔄 Reset suave (re-correr backfill)
                      <div style={{ fontSize: 10, color: "#A1A1AA", fontWeight: 400, marginTop: 2 }}>
                        Borra los jobs y vuelve a NEEDS_INFO. La data cargada se mantiene.
                        Después aprobás backfill de nuevo y el sistema rellena lo que falte.
                      </div>
                    </button>

                    {/* Reset wipe */}
                    <button
                      onClick={() => resetBackfill("wipe")}
                      disabled={resetting !== "none"}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        background: "transparent",
                        color: "#F87171",
                        border: "1px solid rgba(248,113,113,0.4)",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: resetting !== "none" ? "wait" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      ⚠️ Wipe completo (empezar de cero)
                      <div style={{ fontSize: 10, color: "#A1A1AA", fontWeight: 400, marginTop: 2 }}>
                        Borra TODA la data (orders, customers, products, etc.). Mantiene credenciales.
                        Solo para emergencias o cuenta conectada equivocada.
                      </div>
                    </button>

                    {resetting !== "none" && (
                      <div style={{ fontSize: 11, color: "#A1A1AA", textAlign: "center", padding: "8px 0" }}>
                        {resetting === "soft" ? "Reset suave en proceso…" : "Wipe completo en proceso…"}
                      </div>
                    )}
                  </div>
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
// ═══════════════════════════════════════════════════════════════
// ConnectionsList — Conexiones reales que cargo el cliente
// (lee Connections de la org, NO los campos legacy del onboarding_request)
// ═══════════════════════════════════════════════════════════════
const PLATFORM_META: Record<string, { name: string; color: string }> = {
  VTEX: { name: "VTEX", color: "#FF0080" },
  MERCADOLIBRE: { name: "MercadoLibre", color: "#FFE600" },
  META_ADS: { name: "Meta Ads", color: "#1877F2" },
  META_PIXEL: { name: "Meta Pixel", color: "#1877F2" },
  GOOGLE_ADS: { name: "Google Ads", color: "#4285F4" },
  GOOGLE_SEARCH_CONSOLE: { name: "Google Search Console", color: "#34A853" },
  GA4: { name: "Google Analytics 4", color: "#F9AB00" },
  TIENDANUBE: { name: "Tiendanube", color: "#00C2C7" },
  SHOPIFY: { name: "Shopify", color: "#95BF47" },
  WOOCOMMERCE: { name: "WooCommerce", color: "#7F54B3" },
  TIKTOK_ADS: { name: "TikTok Ads", color: "#FE2C55" },
};

function ConnectionsList({ connections }: { connections: any[] }) {
  if (!connections || connections.length === 0) {
    return (
      <DSection title="Conexiones cargadas por el cliente">
        <div style={{ padding: "14px 16px", background: "#0F0F11", border: "1px dashed #27272A", borderRadius: 8, fontSize: 12, color: "#71717A", textAlign: "center" }}>
          El cliente todavía no completó el wizard.
        </div>
      </DSection>
    );
  }

  return (
    <DSection title={`Conexiones del wizard · ${connections.length}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {connections.map((c) => {
          const meta = PLATFORM_META[c.platform] || { name: c.platform, color: "#71717A" };
          const statusColor = c.status === "ACTIVE" ? "#22C55E" : c.status === "ERROR" ? "#EF4444" : c.status === "PENDING" ? "#F59E0B" : "#71717A";
          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "#0F0F11",
                border: "1px solid #1F1F23",
                borderLeft: `3px solid ${meta.color}`,
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
                  {meta.name}
                </div>
                <div style={{ fontSize: 10.5, color: "#71717A" }}>
                  Cargada {formatRelative(c.createdAt)}
                  {c.lastSyncAt && <> · último sync {formatRelative(c.lastSyncAt)}</>}
                </div>
                {c.lastSyncError && (
                  <div style={{ fontSize: 10.5, color: "#FCA5A5", marginTop: 3, lineHeight: 1.4 }}>
                    Último error: {c.lastSyncError.slice(0, 100)}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  background: statusColor + "22",
                  color: statusColor,
                  border: `1px solid ${statusColor}55`,
                  borderRadius: 99,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {c.status}
              </span>
            </div>
          );
        })}
      </div>
    </DSection>
  );
}

// ═══════════════════════════════════════════════════════════════
// CredentialsTestBlock — F1.3: probar credenciales antes de aprobar
// ═══════════════════════════════════════════════════════════════
function CredentialsTestBlock({
  onTest,
  testing,
  result,
  connections,
}: {
  onTest: (opts?: { vtexTestSku?: string }) => void;
  testing: boolean;
  result: any;
  connections?: any[];
}) {
  const [vtexSku, setVtexSku] = React.useState("");
  const hasVtex = (connections || []).some((c: any) => c.platform === "VTEX");
  const summary = result?.summary;
  const allOk = summary && summary.failed === 0 && summary.passed > 0;
  const someFailed = summary && summary.failed > 0;

  // Listar plataformas que se van a testear (de las connections + NitroPixel)
  const platformsToTest = (connections || []).map((c: any) => {
    const meta = PLATFORM_META[c.platform];
    return meta?.name || c.platform;
  });
  // NitroPixel siempre se chequea adicionalmente
  if (!platformsToTest.includes("NitroPixel")) {
    platformsToTest.push("NitroPixel");
  }

  return (
    <div
      style={{
        marginBottom: 14,
        padding: 14,
        background: allOk
          ? "rgba(34,197,94,0.06)"
          : someFailed
          ? "rgba(239,68,68,0.06)"
          : "rgba(255,94,26,0.04)",
        border: `1px solid ${allOk ? "rgba(34,197,94,0.25)" : someFailed ? "rgba(239,68,68,0.25)" : "rgba(255,94,26,0.25)"}`,
        borderRadius: 10,
        transition: "all 0.25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: result ? 12 : 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: allOk ? "#86EFAC" : someFailed ? "#FCA5A5" : "#FFB088", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {testing ? "Probando…" : allOk ? "Todas las credenciales OK" : someFailed ? `${summary.failed} de ${summary.total} fallaron` : "Probar credenciales"}
          </div>
          <div style={{ fontSize: 12, color: "#D4D4D8", lineHeight: 1.5, marginBottom: result ? 0 : 6 }}>
            {testing
              ? "Cada plataforma puede tardar 2-5 segundos."
              : result
              ? `${summary.total} plataforma${summary.total === 1 ? "" : "s"} testeada${summary.total === 1 ? "" : "s"}.`
              : "Vamos a probar:"}
          </div>
          {!result && !testing && platformsToTest.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
              {platformsToTest.map((name: string) => (
                <span
                  key={name}
                  style={{
                    fontSize: 10.5,
                    padding: "3px 8px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid #27272A",
                    borderRadius: 99,
                    color: "#A1A1AA",
                    fontWeight: 500,
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
        {hasVtex && (
          <input
            type="text"
            placeholder="SKU VTEX de muestra (opcional)"
            value={vtexSku}
            onChange={(e) => setVtexSku(e.target.value.trim())}
            disabled={testing}
            style={{
              padding: "6px 10px",
              background: "rgba(0,0,0,0.35)",
              border: "1px solid #27272A",
              borderRadius: 6,
              color: "#E4E4E7",
              fontSize: 11,
              width: 220,
              outline: "none",
            }}
            title="Ingresá un SKU VTEX que sabes que tiene precio, costo e imagen cargados — para validar los campos con ese producto puntual."
          />
        )}
        <button
          onClick={() => onTest(vtexSku ? { vtexTestSku: vtexSku } : undefined)}
          disabled={testing}
          style={{
            padding: "7px 14px",
            background: allOk ? "rgba(34,197,94,0.15)" : "#FF5E1A",
            border: allOk ? "1px solid rgba(34,197,94,0.4)" : "none",
            borderRadius: 7,
            color: allOk ? "#86EFAC" : "#fff",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: testing ? "wait" : "pointer",
            opacity: testing ? 0.6 : 1,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {testing ? <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={11} />}
          {testing ? "Probando" : result ? "Probar de nuevo" : "Probar credenciales"}
        </button>
      </div>

      {result?.results && result.results.length === 0 && (
        <div style={{ fontSize: 11, color: "#A1A1AA", padding: "8px 0" }}>
          {result.note || "No hay connections cargadas todavía."}
        </div>
      )}

      {result?.results && result.results.length > 0 && (
        <>
        <div style={{ fontSize: 10.5, color: "#71717A", marginBottom: 6, lineHeight: 1.5 }}>
          Los números son <strong>histórico total</strong> de cada cuenta. El backfill solo procesa el rango pedido por el cliente.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {result.results.map((r: any, i: number) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                background: "rgba(0,0,0,0.25)",
                border: `1px solid ${r.ok ? ((r as any).hasWarnings || (r.areas || []).some((a: any) => a.hasWarnings || (a.subChecks || []).some((c: any) => c.warning || (c.optional && !c.ok))) ? "rgba(251,146,60,0.30)" : "rgba(34,197,94,0.2)") : "rgba(239,68,68,0.2)"}`,
                borderRadius: 6,
              }}
            >
              {r.ok ? (
                ((r as any).hasWarnings || (r.areas || []).some((a: any) => a.hasWarnings || (a.subChecks || []).some((c: any) => c.warning || (c.optional && !c.ok)))
                  ? <CheckCircle2 size={14} color="#FB923C" style={{ flexShrink: 0, marginTop: 1 }} />
                  : <CheckCircle2 size={14} color="#22C55E" style={{ flexShrink: 0, marginTop: 1 }} />)
              ) : (
                <XCircle size={14} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#E4E4E7", marginBottom: 1 }}>
                  {r.platform}
                </div>
                <div style={{ fontSize: 11, color: r.ok ? "#A1A1AA" : "#FCA5A5", lineHeight: 1.4, wordBreak: "break-word" }}>
                  {r.detail}
                </div>
                {r.hint && (
                  <div style={{ fontSize: 10.5, color: "#71717A", marginTop: 3, fontStyle: "italic" }}>
                    💡 {r.hint}
                  </div>
                )}
                {/* Desglose profundo por area + subChecks */}
                {Array.isArray(r.areas) && r.areas.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.areas.map((a: any, ai: number) => {
                      // Estado del area: OK / warning (pasa pero con alerta) / fail
                      const hasWarn = a.hasWarnings || (a.subChecks || []).some((c: any) => c.warning || (c.optional && !c.ok));
                      const state = !a.ok ? "fail" : (hasWarn ? "warn" : "ok");
                      const borderColor = state === "ok" ? "rgba(34,197,94,0.15)" : state === "warn" ? "rgba(251,146,60,0.20)" : "rgba(239,68,68,0.15)";
                      const titleColor = state === "ok" ? "#86EFAC" : state === "warn" ? "#FDBA74" : "#FCA5A5";
                      const titleIcon = state === "ok" ? "✓" : state === "warn" ? "⚠" : "✕";
                      return (
                        <div key={ai} style={{
                          padding: "6px 8px",
                          background: "rgba(255,255,255,0.02)",
                          border: `1px solid ${borderColor}`,
                          borderRadius: 5,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, color: titleColor, marginBottom: 3 }}>
                            {titleIcon} {a.area} <span style={{ color: "#71717A", fontWeight: 400 }}>— {a.detail}</span>
                          </div>
                          {Array.isArray(a.subChecks) && a.subChecks.length > 0 && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px", marginTop: 4, paddingLeft: 12 }}>
                              {a.subChecks.map((c: any, ci: number) => {
                                let icon = "✓";
                                let color = "#A1A1AA";
                                if (!c.ok) {
                                  if (c.optional) { icon = "–"; color = "#71717A"; }
                                  else if (c.warning) { icon = "⚠"; color = "#FDBA74"; }
                                  else { icon = "✕"; color = "#FCA5A5"; }
                                } else if (c.warning) { icon = "⚠"; color = "#FDBA74"; }
                                return (
                                  <div key={ci} style={{ fontSize: 10, color, display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ width: 10 }}>{icon}</span>
                                    <span style={{ flex: 1 }}>{c.label}</span>
                                    {c.value && <span style={{ color: "#71717A", fontSize: 9.5 }}>{c.value}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {a.hint && (
                            <div style={{ fontSize: 10, color: "#71717A", marginTop: 4, fontStyle: "italic", paddingLeft: 12 }}>
                              💡 {a.hint}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

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

// ─── Backfill progress (visible cuando status=BACKFILLING) ────
function BackfillProgress({ onboardingId }: { onboardingId: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/admin/onboardings/${onboardingId}/backfill-status`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        return;
      }
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // refresh cada 15s
    return () => clearInterval(t);
  }, [onboardingId]);

  if (error) {
    return (
      <div
        style={{
          padding: "12px 14px",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8,
          color: "#F87171",
          fontSize: 12,
          marginBottom: 20,
        }}
      >
        Error cargando progreso: {error}
      </div>
    );
  }

  if (!data) return null;

  const { jobs, summary } = data;

  return (
    <div
      style={{
        marginBottom: 20,
        padding: "16px 18px",
        background: "linear-gradient(135deg, rgba(255,94,26,0.08), rgba(255,140,74,0.04))",
        border: "1px solid rgba(255,94,26,0.2)",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
            Backfill en progreso
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            {summary.overallPct}% completo
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#A1A1AA", textAlign: "right" }}>
          {summary.completed}/{summary.total} jobs
          <br />
          {summary.running > 0 && (
            <span style={{ color: BRAND_ORANGE }}>{summary.running} corriendo</span>
          )}
          {summary.running === 0 && summary.queued > 0 && (
            <span style={{ color: "#71717A" }}>{summary.queued} en cola</span>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: `${summary.overallPct}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`,
            transition: "width 400ms ease",
          }}
        />
      </div>

      {/* Per-platform */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {jobs.map((j: any) => (
          <BackfillJobRow key={j.id} job={j} onboardingId={onboardingId} onForceComplete={load} />
        ))}
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px dashed rgba(255,255,255,0.08)",
          fontSize: 10,
          color: "#71717A",
          textAlign: "center",
        }}
      >
        Cuando todos los jobs terminen, el onboarding pasa a "Listo para revisar". Vos tenés que validar la cuenta (impersonate) y hacer click "Habilitar cliente" para que el cliente reciba el email y pueda entrar al producto.
      </div>
    </div>
  );
}

function BackfillJobRow({ job, onboardingId, onForceComplete }: { job: any; onboardingId?: string; onForceComplete?: () => void }) {
  const colorByStatus: Record<string, string> = {
    QUEUED: "#71717A",
    RUNNING: BRAND_ORANGE,
    COMPLETED: ACCENT_GREEN,
    FAILED: ACCENT_RED,
  };
  const tone = colorByStatus[job.status] || "#71717A";

  const platformColors: Record<string, string> = {
    VTEX: "#FF0080",
    MERCADOLIBRE: "#FFE600",
    META_ADS: "#1877F2",
    GOOGLE_ADS: "#4285F4",
  };
  const pc = platformColors[job.platform] || "#71717A";

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(0,0,0,0.2)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: pc }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", flex: 1 }}>
          {job.platform}
          <span style={{ fontSize: 10, color: "#71717A", fontWeight: 500, marginLeft: 6 }}>
            {job.monthsRequested === 120 ? "todo" : `${job.monthsRequested} meses`}
          </span>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 7px",
            background: `${tone}1A`,
            color: tone,
            borderRadius: 99,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {job.status}
        </span>
        <div style={{ fontSize: 11, color: "#A1A1AA", fontWeight: 600, minWidth: 36, textAlign: "right" }}>
          {job.progressPct}%
        </div>
      </div>
      <div
        style={{
          height: 3,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${job.progressPct}%`,
            height: "100%",
            background: tone,
            transition: "width 400ms ease",
          }}
        />
      </div>
      {(job.dbCount > 0 || job.processedCount > 0) && (
        <div style={{ fontSize: 10, color: "#71717A", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>
            {Number(job.dbCount || 0).toLocaleString("es-AR")} en base
            {job.totalEstimate && ` / ${job.totalEstimate.toLocaleString("es-AR")} estimadas`}
            {job.status === "RUNNING" && job.secondsSinceLastChunk !== null && (
              <span style={{ marginLeft: 8, color: job.looksStalled ? "#F87171" : "#52525B" }}>
                · última actividad hace {job.secondsSinceLastChunk < 60
                  ? `${job.secondsSinceLastChunk}s`
                  : `${Math.round(job.secondsSinceLastChunk / 60)} min`}
                {job.looksStalled && " (¿frenado?)"}
              </span>
            )}
          </span>
          {/* Boton "marcar como completado" cuando ya cargo todo lo que estimaba */}
          {job.status === "RUNNING"
            && onboardingId
            && onForceComplete
            && job.totalEstimate
            && job.dbCount >= job.totalEstimate * 0.99 && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!confirm(`Marcar el job ${job.platform} como completado? Ya tiene ${job.dbCount.toLocaleString("es-AR")} órdenes cargadas.`)) return;
                try {
                  const res = await fetch(`/api/admin/onboardings/${onboardingId}/force-complete-job`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId: job.id }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || "Error");
                  onForceComplete();
                } catch (err: any) {
                  alert("Error: " + err.message);
                }
              }}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                background: "rgba(34,197,94,0.15)",
                border: "1px solid rgba(34,197,94,0.4)",
                color: "#86efac",
                borderRadius: 5,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ✓ Marcar completado
            </button>
          )}
        </div>
      )}
      {job.lastError && (
        <div
          style={{
            marginTop: 6,
            padding: "5px 7px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 5,
            fontSize: 10,
            color: "#FCA5A5",
            fontFamily: "'SF Mono', Menlo, monospace",
            wordBreak: "break-word",
          }}
        >
          {job.lastError.slice(0, 200)}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// EmailFlowDebug — diagnostica por qué un email automático no llegó
// ══════════════════════════════════════════════════════════════
// Ejecuta el flujo paso a paso SIN modificar data. Devuelve un reporte
// estructurado donde se ve qué falló (template render, Resend auth, etc).
// ══════════════════════════════════════════════════════════════

function EmailFlowDebug() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<any>(null);
  const [which, setWhich] = useState<"invite" | "confirmation" | "activation" | "backfill_started" | "data_ready">("activation");
  const [resetEmail, setResetEmail] = useState("");
  const [resetState, setResetState] = useState<"idle" | "running" | "done">("idle");
  const [resetResult, setResetResult] = useState<any>(null);

  async function doReset() {
    const email = resetEmail.trim().toLowerCase();
    if (!email) { alert("Ingresá un email"); return; }
    if (!confirm(`⚠ Esto va a BORRAR TODO lo asociado a ${email} (lead, onboarding, user, org, connections, orders, etc).\n\nNo se puede deshacer. ¿Continuar?`)) return;
    setResetState("running");
    setResetResult(null);
    try {
      const r = await fetch("/api/admin/reset-test-env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      setResetResult(j);
    } catch (err: any) {
      setResetResult({ ok: false, error: err.message });
    } finally {
      setResetState("done");
    }
  }

  async function run(dryRun: boolean) {
    setState("running");
    setResult(null);
    try {
      const res = await fetch("/api/admin/debug-email-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, which }),
      });
      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setResult({ ok: false, summary: `Error de red: ${err.message}`, steps: [] });
    } finally {
      setState("done");
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: "6px 12px", fontSize: 12, color: "#A1A1AA",
            background: "transparent", border: "1px solid #27272A",
            borderRadius: 7, cursor: "pointer",
          }}
        >
          🔧 Debug: ¿por qué no llega un email?
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 24,
        padding: "16px 20px",
        background: "rgba(168,85,247,0.04)",
        border: "1px solid rgba(168,85,247,0.2)",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#A855F7", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            🔧 Email flow debug
          </div>
          <div style={{ fontSize: 13, color: "#A1A1AA", lineHeight: 1.5 }}>
            Diagnostica el flujo del <strong style={{ color: "#fff" }}>último onboarding creado</strong>: render del template, conexión a Resend, respuesta API. NO reenvía nada si usás "Dry run".
          </div>
        </div>
        <button
          onClick={() => { setOpen(false); setResult(null); setState("idle"); }}
          style={{ padding: "6px 10px", background: "transparent", color: "#71717A", border: "1px solid #27272A", borderRadius: 7, fontSize: 11, cursor: "pointer" }}
        >✕</button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#71717A", marginBottom: 6 }}>¿Qué email testear?</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { v: "invite", label: "Invitación" },
            { v: "confirmation", label: "Postulación recibida" },
            { v: "activation", label: "Cuenta activada" },
            { v: "backfill_started", label: "Backfill arrancó" },
            { v: "data_ready", label: "Data lista" },
          ].map((o: any) => (
            <button
              key={o.v}
              onClick={() => setWhich(o.v)}
              style={{
                padding: "5px 10px", fontSize: 11, borderRadius: 6,
                background: which === o.v ? "rgba(168,85,247,0.18)" : "transparent",
                border: `1px solid ${which === o.v ? "#A855F7" : "#27272A"}`,
                color: which === o.v ? "#C4B5FD" : "#A1A1AA",
                cursor: "pointer", fontWeight: 500,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => run(true)}
          disabled={state === "running"}
          style={{
            padding: "8px 14px", background: "#27272A", color: "#fff",
            border: 0, borderRadius: 7, fontSize: 12, fontWeight: 600,
            cursor: state === "running" ? "wait" : "pointer",
          }}
        >
          Dry run (solo diagnostica)
        </button>
        <button
          onClick={() => run(false)}
          disabled={state === "running"}
          style={{
            padding: "8px 14px", background: "#A855F7", color: "#fff",
            border: 0, borderRadius: 7, fontSize: 12, fontWeight: 600,
            cursor: state === "running" ? "wait" : "pointer",
          }}
        >
          Test real (envía email [DEBUG])
        </button>
      </div>

      {state === "running" && (
        <div style={{ color: "#A1A1AA", fontSize: 12 }}>Ejecutando diagnóstico...</div>
      )}

      {result && (
        <div>
          <div style={{
            padding: "10px 12px", marginBottom: 12,
            background: result.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${result.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            borderRadius: 7, fontSize: 12,
            color: result.ok ? "#4ADE80" : "#FCA5A5",
            fontWeight: 600,
          }}>
            {result.ok ? "✓" : "✗"} {result.summary}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(result.steps || []).map((s: any, i: number) => (
              <div
                key={i}
                style={{
                  padding: "8px 10px",
                  background: s.ok ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)",
                  border: `1px solid ${s.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.25)"}`,
                  borderRadius: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: s.ok ? "#4ADE80" : "#FCA5A5", fontSize: 13 }}>{s.ok ? "✓" : "✗"}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{s.step}</span>
                </div>
                {s.error && (
                  <div style={{ fontSize: 11, color: "#FCA5A5", fontFamily: "'SF Mono', Menlo, monospace", marginTop: 4, wordBreak: "break-word" }}>
                    {s.error}
                  </div>
                )}
                {s.detail && (
                  <pre style={{
                    fontSize: 10, color: "#A1A1AA", fontFamily: "'SF Mono', Menlo, monospace",
                    margin: "4px 0 0", padding: "6px 8px", background: "#0A0A0F",
                    borderRadius: 5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    maxHeight: 200, overflowY: "auto",
                  }}>
                    {typeof s.detail === "string" ? s.detail : JSON.stringify(s.detail, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Reset test env ──────────────────────────────────────── */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(168,85,247,0.15)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          🧹 Reset test environment
        </div>
        <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.5, marginBottom: 10 }}>
          Borra <strong style={{ color: "#fff" }}>todo</strong> lo asociado a un email: lead + onboarding + user + org + connections + orders + backfill jobs + webhook events. Perfecto para re-testear desde cero.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            type="email"
            placeholder="email del test a borrar"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            style={{ flex: 1, padding: "7px 12px", background: "#0A0A0F", border: "1px solid #27272A", borderRadius: 7, color: "#fff", fontSize: 12 }}
          />
          <button
            onClick={doReset}
            disabled={resetState === "running"}
            style={{
              padding: "7px 14px", background: "#EF4444", color: "#fff",
              border: 0, borderRadius: 7, fontSize: 12, fontWeight: 600,
              cursor: resetState === "running" ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {resetState === "running" ? "Borrando..." : "Borrar todo"}
          </button>
        </div>
        {resetResult && (
          <div style={{
            padding: "10px 12px",
            background: resetResult.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${resetResult.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.3)"}`,
            borderRadius: 7, fontSize: 11, color: "#D4D4D8", fontFamily: "'SF Mono', Menlo, monospace", whiteSpace: "pre-wrap",
          }}>
            {resetResult.ok
              ? `✓ Eliminados ${resetResult.totalDeleted} registros:\n${JSON.stringify(resetResult.deleted, null, 2)}`
              : `✗ Error: ${resetResult.error}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MigrationBanner — botón idempotente para ejecutar migración ML sync v2
// ══════════════════════════════════════════════════════════════
// Creada en S55 BIS+2 junto con el refactor de 4 capas de ML.
// Usa localStorage para "ocultar" el banner una vez que se ejecutó OK.
// La migración en sí es idempotente (CREATE IF NOT EXISTS).
// ══════════════════════════════════════════════════════════════

function MigrationBanner() {
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [log, setLog] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Si ya corrió OK antes, esconder el banner (localStorage flag)
    try {
      if (typeof window !== "undefined" && localStorage.getItem("ml-sync-migration-ok") === "1") {
        setHidden(true);
      }
    } catch {}
  }, []);

  async function run() {
    setState("running");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/migrate-ml-sync-infra", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json.error || `HTTP ${res.status}`);
        setState("error");
        return;
      }
      setLog(json.log || []);
      setState("ok");
      try { localStorage.setItem("ml-sync-migration-ok", "1"); } catch {}
    } catch (err: any) {
      setErrorMsg(err?.message || "Error de red");
      setState("error");
    }
  }

  if (hidden) return null;

  return (
    <div
      style={{
        marginBottom: 24,
        padding: "16px 20px",
        background: "linear-gradient(135deg, rgba(255,94,26,0.08), rgba(168,85,247,0.06))",
        border: "1px solid rgba(255,94,26,0.25)",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5E1A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            ⚙️ Infraestructura nueva
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4, letterSpacing: "-0.01em" }}>
            Migración MercadoLibre sync v2
          </div>
          <div style={{ fontSize: 13, color: "#A1A1AA", lineHeight: 1.5 }}>
            Crea las tablas <code style={{ color: "#fff" }}>sync_watermarks</code> + <code style={{ color: "#fff" }}>meli_webhook_events</code> y la columna <code style={{ color: "#fff" }}>externalUpdatedAt</code> en orders. Ejecutá una sola vez. Idempotente.
          </div>
          {state === "ok" && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "#4ADE80",
                fontFamily: "'SF Mono', Menlo, monospace",
                whiteSpace: "pre-line",
              }}
            >
              {log.join("\n")}
            </div>
          )}
          {state === "error" && errorMsg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "#FCA5A5",
                fontFamily: "'SF Mono', Menlo, monospace",
              }}
            >
              ✗ {errorMsg}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {state !== "ok" && (
            <button
              onClick={run}
              disabled={state === "running"}
              style={{
                padding: "9px 18px",
                background: state === "running" ? "#27272A" : "#FF5E1A",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: state === "running" ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {state === "running" ? "Ejecutando..." : state === "error" ? "Reintentar" : "Ejecutar migración"}
            </button>
          )}
          <button
            onClick={() => {
              try { localStorage.setItem("ml-sync-migration-ok", "1"); } catch {}
              setHidden(true);
            }}
            title="Ocultar (ya la ejecuté)"
            style={{
              padding: "9px 12px",
              background: "transparent",
              color: "#71717A",
              border: "1px solid #27272A",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
