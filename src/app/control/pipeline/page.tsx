// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/pipeline — Funnel visual de clientes
// ══════════════════════════════════════════════════════════════
// Vista Kanban con 7 etapas + sección de assets (URL onboarding,
// templates de email/WhatsApp copiables) + modal agregar lead.
//
// Fuente de data: GET /api/admin/pipeline
// Acciones: POST /api/admin/leads, PATCH /api/admin/leads/[id]
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Copy,
  Check,
  X,
  Mail,
  Phone,
  MessageCircle,
  Clock,
  Building2,
  ExternalLink,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Trash2,
  Send,
  ChevronDown,
} from "lucide-react";

// ── Etapas del funnel (orden visual) ──
const STAGES: Array<{
  key: string;
  label: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  hint: string;
}> = [
  {
    key: "LEAD",
    label: "Lead",
    description: "Prospect manual sin contactar",
    color: "#94A3B8",
    bg: "rgba(148,163,184,0.06)",
    border: "rgba(148,163,184,0.25)",
    hint: "Lo agregaste manualmente. Mandale el link cuando quieras.",
  },
  {
    key: "CONTACTADO",
    label: "Contactado",
    description: "Esperando que se postule",
    color: "#0EA5E9",
    bg: "rgba(14,165,233,0.06)",
    border: "rgba(14,165,233,0.25)",
    hint: "Le mandaste el link. Si no responde en X días, hacele follow-up.",
  },
  {
    key: "POSTULADO",
    label: "Postulado",
    description: "Aprobá la cuenta",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.25)",
    hint: "Completó el form. Tu turno: revisar y aprobar la cuenta.",
  },
  {
    key: "CUENTA_OK",
    label: "Cuenta aprobada",
    description: "Esperando que complete wizard",
    color: "#A855F7",
    bg: "rgba(168,85,247,0.06)",
    border: "rgba(168,85,247,0.25)",
    hint: "Le llegó email con credenciales. Tiene que loguearse y completar el wizard.",
  },
  {
    key: "WIZARD_OK",
    label: "Wizard listo",
    description: "Probá credenciales y aprobá backfill",
    color: "#FF5E1A",
    bg: "rgba(255,94,26,0.08)",
    border: "rgba(255,94,26,0.3)",
    hint: "Cargó credenciales. Probá que funcionen y aprobá el backfill.",
  },
  {
    key: "BACKFILLING",
    label: "Backfilling",
    description: "Procesando data histórica",
    color: "#EC4899",
    bg: "rgba(236,72,153,0.06)",
    border: "rgba(236,72,153,0.25)",
    hint: "Backfill corriendo. ~5 min para 12k órdenes con el motor nuevo.",
  },
  {
    key: "ACTIVO",
    label: "Activo",
    description: "Cliente operando",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.06)",
    border: "rgba(34,197,94,0.25)",
    hint: "Todo OK. Cliente usando NitroSales con su data real.",
  },
];

const APP_URL = "https://app.nitrosales.ai";
const ONBOARDING_URL = `${APP_URL}/onboarding`;

// ── Templates copiables ──
const TEMPLATE_EMAIL = `Hola {NOMBRE},

Te dejo el acceso a NitroSales para que arranquemos.

Hacé click acá y completás el form en 2 minutos:
${ONBOARDING_URL}

Después yo apruebo la cuenta y te llega un email para que pegues las credenciales de tus plataformas (VTEX, MercadoLibre, Meta, Google). Todo el flow toma menos de 10 minutos.

Cualquier duda me decís.

Tomy
NitroSales`;

const TEMPLATE_WHATSAPP = `Hola {NOMBRE}, te dejo el link para que te sumes a NitroSales 👇

${ONBOARDING_URL}

Completás el form en 2 min, yo apruebo la cuenta y arrancamos. Cualquier duda me escribís.`;

const TEMPLATE_FOLLOWUP = `Hola {NOMBRE}, ¿pudiste ver el link que te mandé de NitroSales?

${ONBOARDING_URL}

Cualquier cosa que no te haya quedado clara, decime y lo charlamos.`;

export default function PipelinePage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pipeline", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        return;
      }
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1600, margin: "0 auto", color: "#E4E4E7", minHeight: "calc(100vh - 72px)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 16 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(255,94,26,0.1)", border: "1px solid rgba(255,94,26,0.25)", borderRadius: 99, marginBottom: 10 }}>
            <Sparkles size={11} color="#FF5E1A" />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#FF5E1A", textTransform: "uppercase", letterSpacing: "0.1em" }}>Pipeline</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
            Funnel de clientes
          </h1>
          <p style={{ color: "#71717A", fontSize: 13, margin: "6px 0 0" }}>
            Visualizá en qué etapa está cada cliente y qué tenés que hacer próximo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setShowTemplates(true)}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "1px solid #3F3F46",
              borderRadius: 8,
              color: "#D4D4D8",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Mail size={14} /> Templates y links
          </button>
          <button
            onClick={() => setShowAddLead(true)}
            style={{
              padding: "10px 18px",
              background: "linear-gradient(135deg, #FF5E1A, #FF8C4A)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 4px 16px rgba(255,94,26,0.25)",
            }}
          >
            <Plus size={14} /> Agregar lead
          </button>
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "10px 12px",
              background: "transparent",
              border: "1px solid #3F3F46",
              borderRadius: 8,
              color: "#A1A1AA",
              cursor: loading ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* Stats globales */}
      {data && <FunnelStats counts={data.counts} totalActive={data.totalActive} totalInProgress={data.totalInProgress} />}

      {/* Error state */}
      {error && (
        <div style={{ padding: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#FCA5A5", marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Kanban */}
      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(260px, 1fr))",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 24,
          }}
        >
          {STAGES.map((stage) => (
            <StageColumn
              key={stage.key}
              stage={stage}
              items={data.stages[stage.key] || []}
              onAction={load}
            />
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div style={{ padding: 60, textAlign: "center", color: "#71717A" }}>
          Cargando pipeline…
        </div>
      )}

      {/* Modals */}
      {showAddLead && (
        <AddLeadModal onClose={() => setShowAddLead(false)} onCreated={() => { setShowAddLead(false); load(); }} />
      )}
      {showTemplates && <TemplatesModal onClose={() => setShowTemplates(false)} />}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Stats globales del funnel
// ═══════════════════════════════════════════════════════════════
function FunnelStats({ counts, totalActive, totalInProgress }: any) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
      <StatCard label="Activos" value={totalActive} color="#22C55E" emoji="🚀" />
      <StatCard label="En proceso" value={totalInProgress} color="#FF5E1A" emoji="⏳" />
      <StatCard label="Esperan tu acción" value={(counts.POSTULADO || 0) + (counts.WIZARD_OK || 0)} color="#F59E0B" emoji="⚡" />
      <StatCard label="Total leads" value={(counts.LEAD || 0) + (counts.CONTACTADO || 0)} color="#0EA5E9" emoji="🎯" />
    </div>
  );
}

function StatCard({ label, value, color, emoji }: any) {
  return (
    <div style={{
      padding: "14px 16px",
      background: "#0F0F11",
      border: "1px solid #1F1F23",
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div>
        <div style={{ fontSize: 11, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: color, marginTop: 2, lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Columna del Kanban
// ═══════════════════════════════════════════════════════════════
function StageColumn({ stage, items, onAction }: any) {
  return (
    <div
      style={{
        background: stage.bg,
        border: `1px solid ${stage.border}`,
        borderRadius: 12,
        padding: 12,
        minHeight: 400,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header de columna */}
      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `1px dashed ${stage.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: stage.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {stage.label}
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            background: stage.color + "22",
            color: stage.color,
            borderRadius: 99,
          }}>
            {items.length}
          </span>
        </div>
        <p style={{ fontSize: 10.5, color: "#71717A", margin: 0, lineHeight: 1.4 }}>
          {stage.description}
        </p>
      </div>

      {/* Lista de cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {items.length === 0 ? (
          <div style={{
            padding: 20,
            textAlign: "center",
            color: "#52525B",
            fontSize: 11,
            fontStyle: "italic",
            border: `1px dashed ${stage.border}`,
            borderRadius: 8,
            background: "rgba(0,0,0,0.2)",
          }}>
            Vacío
          </div>
        ) : (
          items.map((item: any) => (
            <PipelineCard key={item.id} item={item} stage={stage} onAction={onAction} />
          ))
        )}
      </div>

      {/* Hint al pie */}
      <div style={{
        marginTop: 10,
        padding: "8px 10px",
        background: "rgba(0,0,0,0.25)",
        borderRadius: 6,
        fontSize: 10.5,
        color: "#A1A1AA",
        lineHeight: 1.5,
      }}>
        💡 {stage.hint}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Card de cliente/lead en el pipeline
// ═══════════════════════════════════════════════════════════════
function PipelineCard({ item, stage, onAction }: any) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const isLead = item.type === "lead";
  const isOnboarding = item.type === "onboarding";

  const handleMarkContacted = async (e: any) => {
    e.stopPropagation();
    if (!confirm(`¿Marcar a ${item.companyName} como contactado?`)) return;
    setActing(true);
    try {
      await fetch(`/api/admin/leads/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markContacted: true, markEmailSent: true }),
      });
      onAction();
    } finally {
      setActing(false);
    }
  };

  const handleSendEmail = async (e: any, variant: "invite" | "followup" = "invite") => {
    e.stopPropagation();
    if (!item.contactEmail) {
      alert("Este lead no tiene email cargado");
      return;
    }
    const label = variant === "followup" ? "follow-up" : "invitación";
    if (!confirm(`¿Enviar email de ${label} a ${item.contactEmail}?`)) return;
    setActing(true);
    try {
      const res = await fetch(`/api/admin/leads/${item.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Error: ${json.error}`);
      }
      onAction();
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async (e: any) => {
    e.stopPropagation();
    if (!confirm(`¿Borrar el lead ${item.companyName}? Esta acción no se puede deshacer.`)) return;
    setActing(true);
    try {
      await fetch(`/api/admin/leads/${item.id}`, { method: "DELETE" });
      onAction();
    } finally {
      setActing(false);
    }
  };

  const handleOpenOnboarding = () => {
    router.push(`/control/onboardings?id=${item.id}`);
  };

  return (
    <div
      onClick={isOnboarding ? handleOpenOnboarding : undefined}
      style={{
        padding: 12,
        background: "#141416",
        border: "1px solid #27272A",
        borderRadius: 8,
        cursor: isOnboarding ? "pointer" : "default",
        transition: "all 0.15s ease",
        animation: "slideUp 0.3s ease-out",
      }}
      onMouseEnter={(e) => {
        if (isOnboarding) {
          e.currentTarget.style.borderColor = stage.color;
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#27272A";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Nombre empresa */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <Building2 size={12} color={stage.color} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.companyName}
          </span>
        </div>
        {isOnboarding && <ChevronRight size={12} color="#52525B" />}
      </div>

      {/* Contacto */}
      {item.contactName && (
        <div style={{ fontSize: 11, color: "#A1A1AA", marginBottom: 4 }}>
          {item.contactName}
        </div>
      )}

      {/* Email + tel */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {item.contactEmail && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#71717A" }}>
            <Mail size={10} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.contactEmail}</span>
          </div>
        )}
        {item.contactPhone && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#71717A" }}>
            <Phone size={10} /> {item.contactPhone}
          </div>
        )}
      </div>

      {/* Timestamps relevantes */}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #27272A", fontSize: 10, color: "#52525B" }}>
        {isLead && item.lastContactedAt && (
          <div>📧 Contactado {formatRelative(item.lastContactedAt)}</div>
        )}
        {isLead && !item.lastContactedAt && (
          <div>➕ Agregado {formatRelative(item.createdAt)}</div>
        )}
        {isOnboarding && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={9} />
            <span>{formatRelative(item.updatedAt)}</span>
          </div>
        )}
      </div>

      {/* Acciones rápidas para LEADS */}
      {isLead && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {stage.key === "LEAD" && item.contactEmail && (
            <button
              onClick={(e) => handleSendEmail(e, "invite")}
              disabled={acting}
              style={{
                padding: "7px 10px",
                background: "linear-gradient(135deg, rgba(255,94,26,0.2), rgba(255,140,74,0.2))",
                border: "1px solid rgba(255,94,26,0.4)",
                borderRadius: 6,
                color: "#FF8C4A",
                fontSize: 11,
                fontWeight: 600,
                cursor: acting ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <Send size={11} /> Enviar invitación
            </button>
          )}
          {stage.key === "CONTACTADO" && item.contactEmail && (
            <button
              onClick={(e) => handleSendEmail(e, "followup")}
              disabled={acting}
              style={{
                padding: "7px 10px",
                background: "rgba(168,85,247,0.15)",
                border: "1px solid rgba(168,85,247,0.4)",
                borderRadius: 6,
                color: "#C084FC",
                fontSize: 11,
                fontWeight: 600,
                cursor: acting ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <Send size={11} /> Reenviar follow-up
            </button>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            {stage.key === "LEAD" && (
              <button
                onClick={handleMarkContacted}
                disabled={acting}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  background: "transparent",
                  border: "1px solid rgba(14,165,233,0.3)",
                  borderRadius: 6,
                  color: "#0EA5E9",
                  fontSize: 10.5,
                  fontWeight: 500,
                  cursor: acting ? "wait" : "pointer",
                }}
              >
                Marcar contactado
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={acting}
              style={{
                padding: "6px 8px",
                background: "transparent",
                border: "1px solid #3F3F46",
                borderRadius: 6,
                color: "#71717A",
                cursor: acting ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                marginLeft: stage.key === "CONTACTADO" ? "auto" : 0,
              }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: agregar lead manual (simplificado - solo email + auto-send)
// ═══════════════════════════════════════════════════════════════
function AddLeadModal({ onClose, onCreated }: any) {
  const [form, setForm] = useState({
    contactEmail: "",
    contactName: "",
    companyName: "",
    sendInvite: true, // default ON: el mail sale automáticamente
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced, setAdvanced] = useState({
    contactPhone: "",
    industry: "",
    estimatedMonthlyOrders: "",
    source: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.contactEmail.trim().toLowerCase();
    if (form.sendInvite && !email) {
      setError("Para mandar la invitación necesito el email del lead");
      return;
    }
    if (form.sendInvite && !form.companyName.trim()) {
      setError("Para personalizar el email y el form, necesito el nombre de la empresa");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("El email no parece válido");
      return;
    }
    if (!form.sendInvite && !email && !form.companyName.trim() && !form.contactName.trim()) {
      setError("Cargá al menos email, nombre del contacto o empresa");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...advanced, contactEmail: email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        setSubmitting(false);
        return;
      }
      // Si envió email, mostrar success state breve
      if (form.sendInvite && json.emailResult?.ok) {
        setSuccessInfo({ email, status: "sent" });
        setTimeout(() => onCreated(), 1500);
      } else if (form.sendInvite && !json.emailResult?.ok) {
        setError(`Lead creado pero email falló: ${json.emailResult?.error || "?"}`);
        setTimeout(() => onCreated(), 2500);
      } else {
        onCreated();
      }
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (successInfo) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#0F0F11", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 14, padding: 32, maxWidth: 420, textAlign: "center", animation: "slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Check size={28} color="#22C55E" />
          </div>
          <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "#fff", fontWeight: 600 }}>Email enviado</h3>
          <p style={{ color: "#A1A1AA", fontSize: 13, margin: 0 }}>
            Le mandamos la invitación a <strong style={{ color: "#fff" }}>{successInfo.email}</strong>. Va a aparecer en la columna "Contactado".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} style={{ background: "#0F0F11", border: "1px solid #1F1F23", borderRadius: 14, padding: 28, maxWidth: 480, width: "100%", maxHeight: "92vh", overflowY: "auto", animation: "slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#fff", fontWeight: 600 }}>Agregar lead</h3>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "#71717A", cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>
        <p style={{ color: "#71717A", fontSize: 12, margin: "0 0 22px", lineHeight: 1.5 }}>
          Por defecto se manda automáticamente el email con el link al form. Cuando el lead lo complete, va a aparecer en la columna "Postulado" para que apruebes la cuenta.
        </p>

        <Field
          label={`Empresa ${form.sendInvite ? "*" : ""}`}
          value={form.companyName}
          onChange={(v: string) => setForm({ ...form, companyName: v })}
          placeholder="Arredo, TV Compras, etc."
          autoFocus
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field
            label={`Email ${form.sendInvite ? "*" : ""}`}
            value={form.contactEmail}
            onChange={(v: string) => setForm({ ...form, contactEmail: v })}
            placeholder="juan@miempresa.com"
            type="email"
          />
          <Field
            label="Nombre"
            value={form.contactName}
            onChange={(v: string) => setForm({ ...form, contactName: v })}
            placeholder="Juan"
          />
        </div>

        {/* Toggle "Enviar email automaticamente" */}
        <label style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "12px 14px",
          background: form.sendInvite ? "rgba(255,94,26,0.08)" : "rgba(255,255,255,0.02)",
          border: `1px solid ${form.sendInvite ? "rgba(255,94,26,0.3)" : "#27272A"}`,
          borderRadius: 9,
          cursor: "pointer",
          marginTop: 6,
          marginBottom: 6,
          transition: "all 0.15s ease",
        }}>
          <input
            type="checkbox"
            checked={form.sendInvite}
            onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })}
            style={{ marginTop: 2, accentColor: "#FF5E1A" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: form.sendInvite ? "#FF5E1A" : "#D4D4D8", marginBottom: 2 }}>
              Enviar email de invitación ahora
            </div>
            <div style={{ fontSize: 11, color: "#71717A", lineHeight: 1.5 }}>
              Le llega al instante un email con el link al form de onboarding. Lo marca como "Contactado" automáticamente.
            </div>
          </div>
        </label>

        {/* Toggle avanzado */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "transparent",
            border: "none",
            color: "#71717A",
            fontSize: 11.5,
            cursor: "pointer",
            padding: "8px 0",
            marginTop: 4,
          }}
        >
          <ChevronDown size={12} style={{ transform: showAdvanced ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
          {showAdvanced ? "Ocultar" : "Más datos (opcional)"}
        </button>

        {showAdvanced && (
          <div style={{ animation: "slideUp 200ms ease-out" }}>
            <Field
              label="Teléfono"
              value={advanced.contactPhone}
              onChange={(v: string) => setAdvanced({ ...advanced, contactPhone: v })}
              placeholder="+54 9 11 5555-1234"
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field
                label="Industria"
                value={advanced.industry}
                onChange={(v: string) => setAdvanced({ ...advanced, industry: v })}
                placeholder="Indumentaria, Hogar, etc"
              />
              <Field
                label="Órdenes/mes"
                value={advanced.estimatedMonthlyOrders}
                onChange={(v: string) => setAdvanced({ ...advanced, estimatedMonthlyOrders: v })}
                placeholder="500"
                type="number"
              />
            </div>
            <Field
              label="Source"
              value={advanced.source}
              onChange={(v: string) => setAdvanced({ ...advanced, source: v })}
              placeholder="Referido / LinkedIn / Conferencia"
            />
            <Field
              label="Notas"
              value={advanced.notes}
              onChange={(v: string) => setAdvanced({ ...advanced, notes: v })}
              placeholder="Cualquier nota relevante"
              textarea
            />
          </div>
        )}

        {error && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#FCA5A5", fontSize: 11.5, marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 16px", background: "transparent", border: "1px solid #3F3F46", borderRadius: 8, color: "#A1A1AA", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button type="submit" disabled={submitting} style={{ flex: 2, padding: "10px 16px", background: submitting ? "#27272A" : "linear-gradient(135deg, #FF5E1A, #FF8C4A)", border: "none", borderRadius: 8, color: "#fff", cursor: submitting ? "wait" : "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {submitting ? "Procesando…" : form.sendInvite ? <><Send size={13} /> Crear y enviar email</> : "Crear lead"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", textarea = false }: any) {
  const Component: any = textarea ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#A1A1AA", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <Component
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        rows={textarea ? 3 : undefined}
        style={{
          width: "100%",
          padding: "9px 12px",
          background: "#1A1A1D",
          border: "1px solid #27272A",
          borderRadius: 7,
          color: "#fff",
          fontSize: 13,
          outline: "none",
          resize: textarea ? "vertical" : undefined,
          fontFamily: "inherit",
        }}
        onFocus={(e: any) => e.currentTarget.style.borderColor = "#FF5E1A"}
        onBlur={(e: any) => e.currentTarget.style.borderColor = "#27272A"}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal: templates de email/WhatsApp + URLs
// ═══════════════════════════════════════════════════════════════
function TemplatesModal({ onClose }: any) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#0F0F11", border: "1px solid #1F1F23", borderRadius: 14, padding: 28, maxWidth: 720, width: "100%", maxHeight: "92vh", overflowY: "auto", animation: "slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#fff", fontWeight: 600 }}>Templates y links</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#71717A", cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>
        <p style={{ color: "#71717A", fontSize: 12, margin: "0 0 24px" }}>
          Copiá y pegá. Reemplazá <code style={{ background: "#27272A", padding: "1px 5px", borderRadius: 3, color: "#FF5E1A" }}>{"{NOMBRE}"}</code> con el nombre de tu contacto.
        </p>

        {/* URL principal */}
        <CopyBlock
          label="URL del onboarding"
          icon={<ExternalLink size={14} color="#FF5E1A" />}
          value={ONBOARDING_URL}
          mono
        />

        {/* Templates */}
        <CopyBlock
          label="Email de bienvenida (cold outreach)"
          icon={<Mail size={14} color="#0EA5E9" />}
          value={TEMPLATE_EMAIL}
        />

        <CopyBlock
          label="WhatsApp inicial"
          icon={<MessageCircle size={14} color="#22C55E" />}
          value={TEMPLATE_WHATSAPP}
        />

        <CopyBlock
          label="Email de follow-up"
          icon={<Mail size={14} color="#A855F7" />}
          value={TEMPLATE_FOLLOWUP}
        />

        <div style={{ marginTop: 20, padding: 12, background: "rgba(255,94,26,0.06)", border: "1px solid rgba(255,94,26,0.2)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5E1A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Tip</div>
          <p style={{ fontSize: 12, color: "#D4D4D8", margin: 0, lineHeight: 1.5 }}>
            Cuando le mandes el link a un lead, marcá "✓ Marcar contactado" en su card. Eso lo mueve a la columna "Contactado" para que tengas claro a quién esperás respuesta.
          </p>
        </div>
      </div>
    </div>
  );
}

function CopyBlock({ label, value, icon, mono = false }: any) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {icon} {label}
        </div>
        <button
          onClick={handleCopy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,94,26,0.15)",
            border: copied ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,94,26,0.4)",
            borderRadius: 6,
            color: copied ? "#22C55E" : "#FF5E1A",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {copied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
        </button>
      </div>
      <div
        style={{
          padding: 12,
          background: "#1A1A1D",
          border: "1px solid #27272A",
          borderRadius: 7,
          fontSize: mono ? 12 : 12.5,
          color: "#D4D4D8",
          fontFamily: mono ? "ui-monospace, SF Mono, Menlo, monospace" : "inherit",
          whiteSpace: "pre-wrap",
          maxHeight: 200,
          overflowY: "auto",
          lineHeight: 1.5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────
function formatRelative(iso: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-AR");
}
