// @ts-nocheck
"use client";

/**
 * /alertas/reglas — Fase 8g-3a (productivo)
 * ─────────────────────────────────────────────────────────────
 * Inventario visual de reglas creadas por el user (vía Aurum).
 * Acciones disponibles:
 *  - Toggle activar/desactivar (PATCH /api/alerts/rules)
 *  - Borrar regla (DELETE /api/alerts/rules?id=)
 *  - Probar ahora (GET /api/alerts/rules/preview?id=) — abre modal con preview
 * Agrupado por módulo (finanzas / orders / ml / ads / fiscal / products / etc).
 * Empty state con CTA a Aurum si no hay reglas.
 *
 * Crear desde UI con wizard guiado: Fase 8g-3c (próxima).
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Settings2,
  ArrowLeft,
  Bell,
  Mail,
  Trash2,
  Play,
  Power,
  Calendar,
  Activity,
  Sparkles,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ShoppingCart,
  Megaphone,
  Package,
  FileText,
  Server,
  Shield,
  Users,
  Zap,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

type Rule = {
  id: string;
  name: string;
  type: "schedule" | "condition" | "anomaly";
  primitiveKey: string;
  params: Record<string, any>;
  schedule: any;
  channels: string[];
  cooldownMinutes: number;
  severity: "critical" | "warning" | "info";
  enabled: boolean;
  lastFiredAt: string | null;
  nextFireAt: string | null;
  createdAt: string;
};

type CatalogPrimitive = {
  key: string;
  type: string;
  module: string;
  submodule?: string;
  label: string;
  description: string;
  defaultSeverity: string;
  defaultChannels: string[];
  defaultCooldownMinutes: number;
  paramsSchema: Record<string, any>;
  naturalExamples: string[];
};

const MODULE_META: Record<
  string,
  { label: string; Icon: any; gradient: string; tone: string }
> = {
  finanzas: { label: "Finanzas", Icon: TrendingUp, gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)", tone: "#6366f1" },
  fiscal: { label: "Fiscal", Icon: FileText, gradient: "linear-gradient(135deg, #0ea5e9, #06b6d4)", tone: "#0ea5e9" },
  orders: { label: "Ventas", Icon: ShoppingCart, gradient: "linear-gradient(135deg, #10b981, #14b8a6)", tone: "#10b981" },
  ml: { label: "MercadoLibre", Icon: Activity, gradient: "linear-gradient(135deg, #f59e0b, #f97316)", tone: "#f59e0b" },
  ads: { label: "Publicidad", Icon: Megaphone, gradient: "linear-gradient(135deg, #ec4899, #f43f5e)", tone: "#ec4899" },
  products: { label: "Productos", Icon: Package, gradient: "linear-gradient(135deg, #14b8a6, #0d9488)", tone: "#14b8a6" },
  aura: { label: "Aura (Creators)", Icon: Sparkles, gradient: "linear-gradient(135deg, #ff0080, #a855f7)", tone: "#ec4899" },
  competencia: { label: "Competencia", Icon: Users, gradient: "linear-gradient(135deg, #8b5cf6, #6366f1)", tone: "#8b5cf6" },
  sistema: { label: "Sistema", Icon: Server, gradient: "linear-gradient(135deg, #64748b, #475569)", tone: "#64748b" },
  security: { label: "Seguridad", Icon: Shield, gradient: "linear-gradient(135deg, #ef4444, #f43f5e)", tone: "#ef4444" },
};

function moduleMeta(module: string) {
  return MODULE_META[module] ?? {
    label: module,
    Icon: Settings2,
    gradient: "linear-gradient(135deg, #94a3b8, #64748b)",
    tone: "#64748b",
  };
}

// ═══════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════

export default function AlertasReglasPage() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [catalog, setCatalog] = useState<CatalogPrimitive[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState<{ rule: Rule; data: any | null; loading: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Rule | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/alerts/rules?includeCatalog=1", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      setRules(json.rules ?? []);
      setCatalog(json.catalog ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Toggle enabled
  const toggleEnabled = async (rule: Rule) => {
    const newEnabled = !rule.enabled;
    // Optimistic
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: newEnabled } : r)));
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: newEnabled }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt.slice(0, 120)}`);
      }
    } catch (e: any) {
      // rollback
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !newEnabled } : r)));
      setError(`No se pudo actualizar: ${e?.message ?? e}`);
      setTimeout(() => setError(null), 6000);
    }
  };

  // Delete rule
  const deleteRule = async (rule: Rule) => {
    setConfirmDelete(null);
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    try {
      const res = await fetch(`/api/alerts/rules?id=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt.slice(0, 120)}`);
      }
    } catch (e: any) {
      setError(`No se pudo borrar: ${e?.message ?? e}`);
      setTimeout(() => setError(null), 6000);
      // recargar para devolver estado correcto
      load();
    }
  };

  // Preview (probar ahora)
  const openPreview = async (rule: Rule) => {
    setPreviewOpen({ rule, data: null, loading: true });
    try {
      const res = await fetch(`/api/alerts/rules/preview?id=${encodeURIComponent(rule.id)}`, { cache: "no-store" });
      const json = await res.json();
      setPreviewOpen({ rule, data: json, loading: false });
    } catch (e: any) {
      setPreviewOpen({ rule, data: { error: String(e?.message ?? e) }, loading: false });
    }
  };

  // Group rules by module (via primitive lookup)
  const rulesByModule = (() => {
    const groups: Record<string, Rule[]> = {};
    for (const r of rules) {
      const prim = catalog.find((p) => p.key === r.primitiveKey);
      const mod = prim?.module ?? "sistema";
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(r);
    }
    // Sort modules by canonical order
    const order = ["finanzas", "fiscal", "orders", "ml", "ads", "products", "aura", "competencia", "sistema", "security"];
    const sorted: Array<[string, Rule[]]> = [];
    for (const m of order) {
      if (groups[m]) sorted.push([m, groups[m]]);
    }
    for (const [m, rs] of Object.entries(groups)) {
      if (!order.includes(m)) sorted.push([m, rs]);
    }
    return sorted;
  })();

  const totalActive = rules.filter((r) => r.enabled).length;
  const totalScheduled = rules.filter((r) => r.type === "schedule").length;
  const totalConditional = rules.filter((r) => r.type === "condition").length;

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100%",
        padding: "32px 40px",
        background: "#fafafa",
      }}
    >
      {/* Aurora */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(800px 400px at 80% -10%, rgba(244, 63, 94, 0.05), transparent 60%)," +
            "radial-gradient(700px 400px at 10% 110%, rgba(245, 158, 11, 0.04), transparent 60%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <Link
          href="/alertas"
          style={{
            fontSize: 13,
            color: "#64748b",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 20,
          }}
        >
          <ArrowLeft size={14} /> Volver a Alertas
        </Link>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, #f43f5e, #f59e0b)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                flexShrink: 0,
              }}
            >
              <Settings2 size={22} />
            </div>
            <div>
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#0f172a",
                  margin: 0,
                  marginBottom: 6,
                }}
              >
                Reglas personalizadas
              </h1>
              <div style={{ fontSize: 14, color: "#64748b", maxWidth: 560 }}>
                Tu inventario de reglas activas. Acá ves todo lo que NitroSales está monitoreando para vos.{" "}
                <b style={{ color: "#0f172a" }}>Crear nuevas:</b> pedíselo a Aurum en el chat.
              </div>
            </div>
          </div>

          {/* KPI strip */}
          {!loading && rules.length > 0 && (
            <div style={{ display: "flex", gap: 10 }}>
              <KpiCard label="Activas" value={String(totalActive)} sub={`de ${rules.length}`} tone="#10b981" />
              <KpiCard label="Reportes" value={String(totalScheduled)} sub="programados" tone="#0ea5e9" />
              <KpiCard label="Alertas" value={String(totalConditional)} sub="condicionales" tone="#f43f5e" />
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(239, 68, 68, 0.06)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: 10,
              fontSize: 13,
              color: "#991b1b",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 40, justifyContent: "center", color: "#94a3b8" }}>
            <Loader2 size={18} className="spin" />
            <span style={{ fontSize: 14 }}>Cargando tus reglas…</span>
            <style jsx>{`
              .spin {
                animation: spin 1s linear infinite;
              }
              @keyframes spin {
                from {
                  transform: rotate(0deg);
                }
                to {
                  transform: rotate(360deg);
                }
              }
            `}</style>
          </div>
        )}

        {/* Empty state */}
        {!loading && rules.length === 0 && !error && <EmptyState />}

        {/* Grupos por módulo */}
        {!loading && rules.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {rulesByModule.map(([module, ruleList]) => (
              <ModuleGroup
                key={module}
                module={module}
                rules={ruleList}
                catalog={catalog}
                onToggle={toggleEnabled}
                onDelete={(r) => setConfirmDelete(r)}
                onPreview={openPreview}
              />
            ))}
          </div>
        )}

        {/* Footer hint para crear más */}
        {!loading && rules.length > 0 && (
          <div
            style={{
              marginTop: 28,
              padding: 18,
              background: "linear-gradient(135deg, rgba(168, 85, 247, 0.05), rgba(244, 63, 94, 0.05))",
              border: "1px dashed rgba(168, 85, 247, 0.25)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #a855f7, #f43f5e)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                flexShrink: 0,
              }}
            >
              <Sparkles size={16} />
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
              <b style={{ color: "#0f172a" }}>¿Querés crear otra regla?</b>{" "}
              Pedíselo a Aurum en el chat con lenguaje natural — ej:{" "}
              <i style={{ color: "#475569" }}>"avisame si las cancelaciones de ML pasan el 5%"</i>.
              Te va a calibrar los detalles y crear la regla por vos.
            </div>
          </div>
        )}
      </div>

      {/* Modal preview */}
      {previewOpen && <PreviewModal state={previewOpen} onClose={() => setPreviewOpen(null)} />}

      {/* Modal confirmar delete */}
      {confirmDelete && (
        <ConfirmDeleteModal
          rule={confirmDelete}
          onConfirm={() => deleteRule(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════════════════════════════

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "white",
        borderRadius: 10,
        border: "1px solid rgba(15, 23, 42, 0.06)",
        minWidth: 92,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: tone,
          fontVariantNumeric: "tabular-nums",
          marginTop: 2,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#64748b" }}>{sub}</div>
    </div>
  );
}

function ModuleGroup({
  module,
  rules,
  catalog,
  onToggle,
  onDelete,
  onPreview,
}: {
  module: string;
  rules: Rule[];
  catalog: CatalogPrimitive[];
  onToggle: (r: Rule) => void;
  onDelete: (r: Rule) => void;
  onPreview: (r: Rule) => void;
}) {
  const meta = moduleMeta(module);
  const Icon = meta.Icon;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: meta.gradient,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
          }}
        >
          <Icon size={16} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
          {meta.label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            background: "white",
            border: "1px solid rgba(15,23,42,0.06)",
            padding: "2px 8px",
            borderRadius: 999,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {rules.length} {rules.length === 1 ? "regla" : "reglas"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rules.map((rule) => {
          const prim = catalog.find((p) => p.key === rule.primitiveKey);
          return (
            <RuleCard
              key={rule.id}
              rule={rule}
              primitive={prim}
              moduleTone={meta.tone}
              onToggle={() => onToggle(rule)}
              onDelete={() => onDelete(rule)}
              onPreview={() => onPreview(rule)}
            />
          );
        })}
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  primitive,
  moduleTone,
  onToggle,
  onDelete,
  onPreview,
}: {
  rule: Rule;
  primitive?: CatalogPrimitive;
  moduleTone: string;
  onToggle: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const isSchedule = rule.type === "schedule";
  const description = primitive?.description ?? "Sin descripción";
  const channels = rule.channels ?? [];
  const sevColor = rule.severity === "critical" ? "#ef4444" : rule.severity === "warning" ? "#f59e0b" : "#0ea5e9";

  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        border: "1px solid rgba(15, 23, 42, 0.06)",
        padding: 16,
        opacity: rule.enabled ? 1 : 0.6,
        transition: "opacity 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header con name + badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: sevColor,
                flexShrink: 0,
                opacity: rule.enabled ? 1 : 0.3,
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{rule.name}</div>
            <Badge label={isSchedule ? "Reporte" : "Condición"} tone={isSchedule ? "#0ea5e9" : "#f43f5e"} />
            {!rule.enabled && <Badge label="Desactivada" tone="#94a3b8" />}
          </div>

          {/* Descripción humana */}
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, lineHeight: 1.5 }}>
            {description}
          </div>

          {/* Detalle compacto */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: "#475569" }}>
            {isSchedule && rule.schedule && (
              <DetailItem Icon={Calendar} text={describeSchedule(rule.schedule)} />
            )}
            {!isSchedule && Object.keys(rule.params || {}).length > 0 && (
              <DetailItem Icon={Activity} text={describeParams(rule.params)} />
            )}
            <DetailItem
              Icon={channels.includes("email") ? Mail : Bell}
              text={`Canal: ${channels.join(", ") || "in_app"}`}
            />
            {rule.lastFiredAt && (
              <DetailItem
                Icon={CheckCircle2}
                text={`Última vez: ${formatRelative(rule.lastFiredAt)}`}
              />
            )}
            {isSchedule && rule.nextFireAt && (
              <DetailItem Icon={Calendar} text={`Próxima: ${formatDate(rule.nextFireAt)}`} />
            )}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <ActionButton
            Icon={Power}
            label={rule.enabled ? "Activa" : "Pausada"}
            tone={rule.enabled ? "#10b981" : "#94a3b8"}
            onClick={onToggle}
            tooltip={rule.enabled ? "Click para desactivar" : "Click para activar"}
          />
          <ActionButton Icon={Play} label="Probar ahora" tone="#6366f1" onClick={onPreview} tooltip="Ver cómo se vería la alerta" />
          <ActionButton Icon={Trash2} label="Borrar" tone="#ef4444" onClick={onDelete} tooltip="Eliminar la regla" />
        </div>
      </div>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: `${tone}15`,
        color: tone,
        padding: "2px 8px",
        borderRadius: 5,
      }}
    >
      {label}
    </span>
  );
}

function DetailItem({ Icon, text }: { Icon: any; text: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Icon size={12} style={{ color: "#94a3b8" }} />
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{text}</span>
    </div>
  );
}

function ActionButton({
  Icon,
  label,
  tone,
  onClick,
  tooltip,
}: {
  Icon: any;
  label: string;
  tone: string;
  onClick: () => void;
  tooltip?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        background: `${tone}10`,
        color: tone,
        border: `1px solid ${tone}25`,
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        minWidth: 100,
        justifyContent: "center",
        transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${tone}20`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `${tone}10`;
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        border: "1px solid rgba(15, 23, 42, 0.06)",
        padding: 48,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "linear-gradient(135deg, #a855f7, #f43f5e)",
          margin: "0 auto 18px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
        }}
      >
        <Sparkles size={28} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
        Todavía no tenés reglas
      </div>
      <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24, maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.5 }}>
        Las reglas son monitoreos automáticos: NitroSales chequea tus datos y te avisa solo cuando algo importante pasa, o te manda un reporte programado.
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
        Inspiración: pediselo así a Aurum
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480, margin: "0 auto 24px" }}>
        <ExampleChip text='"todos los días 9am mandame el resumen de ventas"' />
        <ExampleChip text='"avisame si las cancelaciones de ML pasan el 5%"' />
        <ExampleChip text='"todos los lunes mandame el ranking de productos top"' />
      </div>

      <Link
        href="/chat"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          background: "linear-gradient(135deg, #a855f7, #f43f5e)",
          color: "white",
          textDecoration: "none",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <Sparkles size={14} /> Abrir chat de Aurum
      </Link>
    </div>
  );
}

function ExampleChip({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "#fafafa",
        border: "1px solid rgba(15, 23, 42, 0.06)",
        borderRadius: 8,
        fontSize: 12,
        color: "#475569",
        textAlign: "left",
        fontStyle: "italic",
      }}
    >
      {text}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Modals
// ═══════════════════════════════════════════════════════════════════

function PreviewModal({
  state,
  onClose,
}: {
  state: { rule: Rule; data: any | null; loading: boolean };
  onClose: () => void;
}) {
  const { rule, data, loading } = state;
  return (
    <ModalShell title={`Preview · ${rule.name}`} onClose={onClose}>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 30, justifyContent: "center", color: "#94a3b8" }}>
          <Loader2 size={18} className="spin" />
          <span style={{ fontSize: 13 }}>Evaluando ahora mismo…</span>
        </div>
      )}

      {!loading && data?.error && (
        <div style={{ padding: 16, background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, fontSize: 13, color: "#991b1b" }}>
          <b>Error:</b> {data.error}
        </div>
      )}

      {!loading && data?.preview && (
        <>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
            Así se vería la alerta en <b>/alertas</b> con tus datos actuales:
          </div>
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#fafafa",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              borderLeft: `4px solid ${data.preview.severity === "critical" ? "#ef4444" : data.preview.severity === "warning" ? "#f59e0b" : "#0ea5e9"}`,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
              {data.preview.title}
            </div>
            <div style={{ fontSize: 13, color: "#475569", fontVariantNumeric: "tabular-nums", lineHeight: 1.6 }}>
              {data.preview.body}
            </div>
            {data.preview.cta && data.preview.ctaHref && (
              <Link
                href={data.preview.ctaHref}
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  fontSize: 12,
                  color: "#6366f1",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {data.preview.cta} →
              </Link>
            )}
          </div>
          <div style={{ marginTop: 14, padding: 10, background: data.preview.triggered ? "rgba(16, 185, 129, 0.06)" : "rgba(245, 158, 11, 0.06)", border: `1px solid ${data.preview.triggered ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)"}`, borderRadius: 8, fontSize: 12, color: data.preview.triggered ? "#065f46" : "#92400e" }}>
            {data.nota}
          </div>
        </>
      )}
    </ModalShell>
  );
}

function ConfirmDeleteModal({
  rule,
  onConfirm,
  onCancel,
}: {
  rule: Rule;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell title="Borrar regla" onClose={onCancel}>
      <div style={{ fontSize: 14, color: "#475569", marginBottom: 8, lineHeight: 1.5 }}>
        Vas a borrar la regla <b style={{ color: "#0f172a" }}>"{rule.name}"</b>.
      </div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        No vas a recibir más alertas de este tipo. Esta acción no se puede deshacer.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "8px 16px",
            background: "transparent",
            color: "#64748b",
            border: "1px solid rgba(15,23,42,0.1)",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          style={{
            padding: "8px 16px",
            background: "#ef4444",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Trash2 size={13} /> Borrar
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: any }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 16,
          padding: 24,
          maxWidth: 540,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function describeSchedule(schedule: any): string {
  if (!schedule) return "—";
  const freq = schedule.frequency;
  const time = schedule.time ?? "00:00";
  if (freq === "daily") return `Cada día · ${time}`;
  if (freq === "weekly") {
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const day = days[schedule.dayOfWeek ?? 1];
    return `Cada ${day} · ${time}`;
  }
  if (freq === "monthly") return `Día ${schedule.dayOfMonth ?? 1} de cada mes · ${time}`;
  return `${freq} · ${time}`;
}

function describeParams(params: Record<string, any>): string {
  const parts = Object.entries(params)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v).slice(0, 20) : v}`);
  return parts.join(", ");
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "hace instantes";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `hace ${diffD}d`;
  return date.toLocaleDateString("es-AR");
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
