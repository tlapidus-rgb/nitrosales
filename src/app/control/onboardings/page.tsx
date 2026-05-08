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
import {
  OnboardingDetailDrawer as DetailDrawer,
  formatRelative,
} from "@/components/control/OnboardingDetailDrawer";

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
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
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
                      <DeleteOnboardingButton req={req} onDeleted={load} />
                    </div>
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

function DeleteOnboardingButton({
  req,
  onDeleted,
}: {
  req: any;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;

    const hasOrg = !!req.createdOrgId;

    // Primer confirm — info detallada para identificar el onboarding sin
    // ambiguedad (incluye orgId, email, status — visible para el admin).
    const intro = hasOrg
      ? `🗑️ ELIMINAR CUENTA COMPLETA\n\n` +
        `Empresa: ${req.companyName}\n` +
        `OrgId: ${req.createdOrgId}\n` +
        `Email: ${req.contactEmail}\n` +
        `Status: ${req.status}\n\n` +
        `Borra TODO: organización, usuarios, data (orders, customers, products, eventos pixel, etc.) + el onboarding_request.\n\n` +
        `Como si el cliente nunca hubiera existido en la plataforma.\n\n` +
        `Esta acción NO SE PUEDE DESHACER. ¿Continuar?`
      : `🗑️ ELIMINAR onboarding\n\n` +
        `Empresa: ${req.companyName}\n` +
        `Email: ${req.contactEmail}\n` +
        `Status: ${req.status}\n\n` +
        `Este onboarding aún NO tiene cuenta creada. Solo borra la solicitud (onboarding_request).\n\n` +
        `¿Continuar?`;

    if (!confirm(intro)) return;

    // Segunda confirmacion — simple OK/Cancel, anti-misclick. Sin tipear
    // nada. Aplica a todos los casos (con o sin org) para uniformidad.
    const finalConfirm = hasOrg
      ? `Última confirmación.\n\n` +
        `Vas a eliminar TODA la cuenta de "${req.companyName}".\n` +
        `OrgId: ${req.createdOrgId}\n\n` +
        `¿Confirmás la eliminación definitiva?`
      : `Última confirmación.\n\n` +
        `Vas a eliminar el onboarding de "${req.companyName}".\n\n` +
        `¿Confirmás?`;

    if (!confirm(finalConfirm)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/onboardings/${req.id}/delete`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Error: ${json.error || res.statusText}`);
        setDeleting(false);
        return;
      }
      alert(
        hasOrg
          ? `Cuenta eliminada. ${json.totalDeleted || 0} registros borrados.`
          : `Onboarding eliminado.`
      );
      onDeleted();
    } catch (err: any) {
      alert(`Error de red: ${err?.message || "desconocido"}`);
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      title="Eliminar este onboarding/cuenta"
      style={{
        padding: "5px 8px",
        background: deleting ? "rgba(220,38,38,0.15)" : "transparent",
        border: "1px solid rgba(220,38,38,0.4)",
        borderRadius: 7,
        color: "#DC2626",
        fontSize: 11,
        fontWeight: 600,
        cursor: deleting ? "wait" : "pointer",
        opacity: deleting ? 0.6 : 1,
      }}
    >
      {deleting ? "Eliminando…" : "🗑️"}
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
