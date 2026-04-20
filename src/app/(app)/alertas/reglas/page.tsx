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
  Pencil,
  Save,
  Info,
  Plus,
  ArrowRight,
  Check,
  Clock,
  Bolt,
  Search,
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
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);

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

  // Create rule (POST desde el wizard)
  const createNewRule = async (
    payload: any
  ): Promise<{ ok: boolean; error?: string; duplicate?: any }> => {
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: json?.error ?? `HTTP ${res.status}`,
          duplicate: json?.duplicate,
        };
      }
      await load();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  };

  // Save edits (PATCH desde el drawer)
  const saveEditedRule = async (
    ruleId: string,
    updates: Partial<Pick<Rule, "name" | "params" | "schedule" | "channels" | "cooldownMinutes" | "severity">>
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ruleId, ...updates }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { ok: false, error: `HTTP ${res.status} ${txt.slice(0, 160)}` };
      }
      // Reload para reflejar los cambios + nextFireAt re-computado
      await load();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
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
        padding: "32px 40px 64px",
        background: "#fafafa",
      }}
    >
      {/* Aurora premium con 3 capas */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(900px 500px at 85% -10%, rgba(244, 63, 94, 0.07), transparent 60%)," +
            "radial-gradient(700px 400px at 5% 30%, rgba(99, 102, 241, 0.05), transparent 60%)," +
            "radial-gradient(600px 400px at 50% 110%, rgba(245, 158, 11, 0.04), transparent 60%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1140, margin: "0 auto" }}>
        {/* Breadcrumb sutil */}
        <Link
          href="/alertas"
          style={{
            fontSize: 12,
            color: "#94a3b8",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 18,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
        >
          <ArrowLeft size={13} /> Alertas
        </Link>

        {/* Hero header card */}
        <div
          style={{
            background: "white",
            borderRadius: 18,
            border: "1px solid rgba(15, 23, 42, 0.05)",
            padding: "28px 32px",
            marginBottom: 16,
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02), 0 8px 24px rgba(15, 23, 42, 0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1, minWidth: 280 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "linear-gradient(135deg, #f43f5e, #f59e0b)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                flexShrink: 0,
                boxShadow: "0 6px 20px rgba(244, 63, 94, 0.25)",
              }}
            >
              <Settings2 size={26} />
            </div>
            <div>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#0f172a",
                  margin: 0,
                  marginBottom: 4,
                }}
              >
                Reglas personalizadas
              </h1>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, maxWidth: 480 }}>
                Tu inventario de monitoreos automáticos. Crealos con el wizard o pedíselos a Aurum en el chat.
              </div>
            </div>
          </div>

          {!loading && (
            <button
              onClick={() => setCreating(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "11px 18px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "white",
                border: "none",
                borderRadius: 11,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
                boxShadow: "0 4px 16px rgba(99, 102, 241, 0.35)",
                transition: "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 22px rgba(99, 102, 241, 0.45)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(99, 102, 241, 0.35)";
              }}
            >
              <Plus size={15} /> Nueva regla
            </button>
          )}
        </div>

        {/* KPI strip premium (3 cards grandes) */}
        {!loading && rules.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
            <KpiCardPremium label="Activas" value={totalActive} sub={`de ${rules.length} reglas`} tone="#10b981" Icon={Power} />
            <KpiCardPremium label="Reportes programados" value={totalScheduled} sub={totalScheduled === 1 ? "regla schedule" : "reglas schedule"} tone="#0ea5e9" Icon={Clock} />
            <KpiCardPremium label="Alertas condicionales" value={totalConditional} sub={totalConditional === 1 ? "regla condition" : "reglas condition"} tone="#f43f5e" Icon={Bolt} />
          </div>
        )}

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
        {!loading && rules.length === 0 && !error && <EmptyState onCreateClick={() => setCreating(true)} />}

        {/* Grupos por módulo */}
        {!loading && rules.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {rulesByModule.map(([module, ruleList]) => (
              <ModuleGroup
                key={module}
                module={module}
                rules={ruleList}
                catalog={catalog}
                onToggle={toggleEnabled}
                onDelete={(r) => setConfirmDelete(r)}
                onPreview={openPreview}
                onEdit={(r) => setEditing(r)}
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
              Usá <b style={{ color: "#6366f1" }}>"+ Nueva regla"</b> arriba para el wizard guiado paso a paso,
              o pedísela a Aurum en el chat con lenguaje natural — ej:{" "}
              <i style={{ color: "#475569" }}>"avisame si las cancelaciones de ML pasan el 5%"</i>.
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

      {/* Drawer de edición */}
      {editing && (
        <EditDrawer
          rule={editing}
          primitive={catalog.find((p) => p.key === editing.primitiveKey)}
          onSave={async (updates) => {
            const r = await saveEditedRule(editing.id, updates);
            if (r.ok) setEditing(null);
            return r;
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Wizard de creación */}
      {creating && (
        <CreateWizard
          catalog={catalog}
          existingRules={rules}
          onCreate={async (payload) => {
            const r = await createNewRule(payload);
            if (r.ok) setCreating(false);
            return r;
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════════════════════════════

function KpiCardPremium({
  label,
  value,
  sub,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  sub: string;
  tone: string;
  Icon: any;
}) {
  return (
    <div
      style={{
        padding: "20px 22px",
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15, 23, 42, 0.05)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02), 0 4px 14px rgba(15, 23, 42, 0.03)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Acento de color superior sutil */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${tone}, ${tone}40)`,
        }}
      />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#0f172a",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            {value}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{sub}</div>
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${tone}12`,
            color: tone,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={16} />
        </div>
      </div>
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
  onEdit,
}: {
  module: string;
  rules: Rule[];
  catalog: CatalogPrimitive[];
  onToggle: (r: Rule) => void;
  onDelete: (r: Rule) => void;
  onPreview: (r: Rule) => void;
  onEdit: (r: Rule) => void;
}) {
  const meta = moduleMeta(module);
  const Icon = meta.Icon;
  return (
    <div>
      {/* Header de grupo prominente con divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: meta.gradient,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            boxShadow: `0 4px 14px ${meta.tone}30`,
          }}
        >
          <Icon size={18} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
            {meta.label}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
            {rules.length} {rules.length === 1 ? "regla activa" : "reglas activas"}
          </div>
        </div>
        {/* Divider sutil */}
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(15,23,42,0.08), transparent)", marginLeft: 8 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              onEdit={() => onEdit(rule)}
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
  onEdit,
}: {
  rule: Rule;
  primitive?: CatalogPrimitive;
  moduleTone: string;
  onToggle: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onEdit: () => void;
}) {
  const isSchedule = rule.type === "schedule";
  const description = primitive?.description ?? "Sin descripción";
  const channels = rule.channels ?? [];
  const sevColor = rule.severity === "critical" ? "#ef4444" : rule.severity === "warning" ? "#f59e0b" : "#0ea5e9";
  const sevLabel = rule.severity === "critical" ? "Crítica" : rule.severity === "warning" ? "Atención" : "Info";

  return (
    <div
      style={{
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15, 23, 42, 0.05)",
        position: "relative",
        overflow: "hidden",
        opacity: rule.enabled ? 1 : 0.65,
        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02), 0 4px 14px rgba(15, 23, 42, 0.03)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)";
        e.currentTarget.style.borderColor = "rgba(15, 23, 42, 0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.02), 0 4px 14px rgba(15, 23, 42, 0.03)";
        e.currentTarget.style.borderColor = "rgba(15, 23, 42, 0.05)";
      }}
    >
      {/* Accent bar lateral del color de severidad */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: rule.enabled ? sevColor : "#cbd5e1",
        }}
      />

      <div style={{ padding: "20px 22px 20px 26px" }}>
        {/* TOP ROW: name + badges (left) | toggle switch (right) */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
                {rule.name}
              </div>
              <Badge label={isSchedule ? "Reporte" : "Condición"} tone={isSchedule ? "#0ea5e9" : "#f43f5e"} />
              <Badge label={sevLabel} tone={sevColor} />
              {!rule.enabled && <Badge label="Pausada" tone="#94a3b8" />}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, paddingRight: 16 }}>
              {description}
            </div>
          </div>

          {/* Toggle switch tipo iOS */}
          <ToggleSwitch enabled={rule.enabled} onClick={onToggle} />
        </div>

        {/* DETAIL CHIPS con backgrounds suaves */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
          {isSchedule && rule.schedule && (
            <DetailChip Icon={Calendar} text={describeSchedule(rule.schedule)} tone="#0ea5e9" />
          )}
          {!isSchedule && Object.keys(rule.params || {}).length > 0 && (
            <DetailChip Icon={Activity} text={describeParams(rule.params)} tone="#6366f1" />
          )}
          <DetailChip
            Icon={channels.includes("email") ? Mail : Bell}
            text={channels.length > 0 ? channels.join(" + ") : "in_app"}
            tone="#8b5cf6"
          />
          {rule.lastFiredAt && (
            <DetailChip
              Icon={CheckCircle2}
              text={`Última: ${formatRelative(rule.lastFiredAt)}`}
              tone="#10b981"
            />
          )}
          {isSchedule && rule.nextFireAt && (
            <DetailChip Icon={Clock} text={`Próxima: ${formatDate(rule.nextFireAt)}`} tone="#f59e0b" />
          )}
        </div>

        {/* ACTIONS: icon-only buttons row, divider arriba */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px dashed rgba(15, 23, 42, 0.06)",
            display: "flex",
            gap: 6,
            justifyContent: "flex-end",
          }}
        >
          <IconButton Icon={Play} label="Probar ahora" onClick={onPreview} tone="#6366f1" />
          <IconButton Icon={Pencil} label="Editar" onClick={onEdit} tone="#0ea5e9" />
          <IconButton Icon={Trash2} label="Borrar" onClick={onDelete} tone="#ef4444" />
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

// ── Detail chip con bg suave del tone ──
function DetailChip({ Icon, text, tone }: { Icon: any; text: string; tone: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        background: `${tone}0d`,
        border: `1px solid ${tone}1f`,
        borderRadius: 7,
        fontSize: 11,
        color: tone,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <Icon size={11} />
      <span>{text}</span>
    </div>
  );
}

// ── Toggle switch tipo iOS ──
function ToggleSwitch({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={enabled ? "Click para pausar" : "Click para activar"}
      style={{
        position: "relative",
        width: 38,
        height: 22,
        borderRadius: 999,
        background: enabled ? "linear-gradient(135deg, #10b981, #14b8a6)" : "#cbd5e1",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        boxShadow: enabled ? "0 2px 8px rgba(16, 185, 129, 0.35)" : "inset 0 1px 2px rgba(15,23,42,0.06)",
        padding: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: enabled ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "white",
          boxShadow: "0 2px 4px rgba(15, 23, 42, 0.2)",
          transition: "left 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </button>
  );
}

// ── Icon button compacto con tooltip ──
function IconButton({
  Icon,
  label,
  onClick,
  tone,
}: {
  Icon: any;
  label: string;
  onClick: () => void;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        background: "transparent",
        color: "#64748b",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${tone}0d`;
        e.currentTarget.style.color = tone;
        e.currentTarget.style.borderColor = `${tone}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#64748b";
        e.currentTarget.style.borderColor = "rgba(15, 23, 42, 0.08)";
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
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

      <div style={{ display: "inline-flex", gap: 10 }}>
        <button
          onClick={onCreateClick}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "white",
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 12px rgba(99, 102, 241, 0.25)",
          }}
        >
          <Plus size={14} /> Crear regla con wizard
        </button>
        <Link
          href="/chat"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            background: "white",
            color: "#a855f7",
            textDecoration: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid rgba(168, 85, 247, 0.25)",
          }}
        >
          <Sparkles size={14} /> Pedísela a Aurum
        </Link>
      </div>
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
// Edit Drawer
// ═══════════════════════════════════════════════════════════════════

function EditDrawer({
  rule,
  primitive,
  onSave,
  onClose,
}: {
  rule: Rule;
  primitive?: CatalogPrimitive;
  onSave: (updates: Partial<Rule>) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [name, setName] = useState(rule.name);
  const [params, setParams] = useState<Record<string, any>>(rule.params ?? {});
  const [schedule, setSchedule] = useState<any>(rule.schedule ?? { frequency: "daily", time: "09:00" });
  const [channels, setChannels] = useState<string[]>(rule.channels ?? ["in_app"]);
  const [severity, setSeverity] = useState(rule.severity);
  const [cooldown, setCooldown] = useState(rule.cooldownMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSchedule = rule.type === "schedule";
  const paramsSchema = primitive?.paramsSchema ?? {};
  const hasParams = Object.keys(paramsSchema).length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const r = await onSave({
      name,
      params,
      schedule: isSchedule ? schedule : undefined,
      channels,
      severity,
      cooldownMinutes: cooldown,
    } as any);
    setSaving(false);
    if (!r.ok) setError(r.error ?? "Error desconocido");
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
        zIndex: 110,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 540,
          background: "white",
          height: "100%",
          overflowY: "auto",
          boxShadow: "-12px 0 40px rgba(15, 23, 42, 0.18)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header sticky */}
        <div
          style={{
            position: "sticky",
            top: 0,
            background: "white",
            borderBottom: "1px solid rgba(15,23,42,0.06)",
            padding: "20px 24px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            zIndex: 5,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              Editar regla
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              {primitive?.label ?? rule.primitiveKey}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {primitive?.description ?? "Sin descripción"}
            </div>
          </div>
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
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Nombre */}
          <Field label="Nombre" hint="Cómo aparece en tu inventario">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </Field>

          {/* Parámetros del paramsSchema */}
          {hasParams && (
            <Section title="Parámetros" Icon={Activity}>
              {Object.entries(paramsSchema).map(([key, def]: [string, any]) => (
                <ParamField
                  key={key}
                  paramKey={key}
                  def={def}
                  value={params[key] ?? def.default}
                  onChange={(v) => setParams((prev) => ({ ...prev, [key]: v }))}
                />
              ))}
            </Section>
          )}

          {/* Schedule (si type=schedule) */}
          {isSchedule && (
            <Section title="¿Cuándo se ejecuta?" Icon={Calendar}>
              <Field label="Frecuencia">
                <select
                  value={schedule?.frequency ?? "daily"}
                  onChange={(e) => setSchedule({ ...schedule, frequency: e.target.value })}
                  style={inputStyle}
                >
                  <option value="daily">Cada día</option>
                  <option value="weekly">Cada semana</option>
                  <option value="monthly">Cada mes</option>
                </select>
              </Field>

              {schedule?.frequency === "weekly" && (
                <Field label="Día de la semana">
                  <select
                    value={schedule?.dayOfWeek ?? 1}
                    onChange={(e) => setSchedule({ ...schedule, dayOfWeek: Number(e.target.value) })}
                    style={inputStyle}
                  >
                    <option value={0}>Domingo</option>
                    <option value={1}>Lunes</option>
                    <option value={2}>Martes</option>
                    <option value={3}>Miércoles</option>
                    <option value={4}>Jueves</option>
                    <option value={5}>Viernes</option>
                    <option value={6}>Sábado</option>
                  </select>
                </Field>
              )}

              {schedule?.frequency === "monthly" && (
                <Field label="Día del mes" hint="1 al 31">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={schedule?.dayOfMonth ?? 1}
                    onChange={(e) => setSchedule({ ...schedule, dayOfMonth: Number(e.target.value) })}
                    style={inputStyle}
                  />
                </Field>
              )}

              <Field label="Hora" hint="Formato 24hs (HH:MM)">
                <input
                  type="time"
                  value={schedule?.time ?? "09:00"}
                  onChange={(e) => setSchedule({ ...schedule, time: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </Section>
          )}

          {/* Canales */}
          <Section title="Canal de notificación" Icon={Bell}>
            <ChannelToggle
              label="In-app"
              sub="En tu inbox de alertas"
              Icon={Bell}
              checked={channels.includes("in_app")}
              onChange={(checked) =>
                setChannels((prev) => (checked ? Array.from(new Set([...prev, "in_app"])) : prev.filter((c) => c !== "in_app")))
              }
            />
            <ChannelToggle
              label="Email"
              sub="Próximamente — se activa en la próxima fase"
              Icon={Mail}
              checked={channels.includes("email")}
              disabled
              onChange={() => {}}
            />
          </Section>

          {/* Severidad */}
          <Section title="Prioridad" Icon={AlertTriangle}>
            <div style={{ display: "flex", gap: 8 }}>
              <SeverityChip label="Crítica" value="critical" current={severity} onClick={() => setSeverity("critical" as any)} tone="#ef4444" />
              <SeverityChip label="Atención" value="warning" current={severity} onClick={() => setSeverity("warning" as any)} tone="#f59e0b" />
              <SeverityChip label="Info" value="info" current={severity} onClick={() => setSeverity("info" as any)} tone="#0ea5e9" />
            </div>
          </Section>

          {/* Cooldown */}
          {!isSchedule && (
            <Field label="Tiempo mínimo entre avisos" hint="Para evitar spam si el evento se repite">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={cooldown}
                  onChange={(e) => setCooldown(Number(e.target.value))}
                  style={{ ...inputStyle, maxWidth: 120 }}
                />
                <span style={{ fontSize: 13, color: "#64748b" }}>minutos</span>
              </div>
            </Field>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: 8,
                fontSize: 12,
                color: "#991b1b",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer sticky */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "white",
            borderTop: "1px solid rgba(15,23,42,0.06)",
            padding: "14px 24px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "9px 16px",
              background: "transparent",
              color: "#64748b",
              border: "1px solid rgba(15,23,42,0.1)",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "9px 16px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Create Wizard — Fase 8g-3c
// ═══════════════════════════════════════════════════════════════════

function CreateWizard({
  catalog,
  existingRules,
  onCreate,
  onClose,
}: {
  catalog: CatalogPrimitive[];
  existingRules: Rule[];
  onCreate: (payload: any) => Promise<{ ok: boolean; error?: string; duplicate?: any }>;
  onClose: () => void;
}) {
  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [moduleSel, setModuleSel] = useState<string | null>(null);
  const [primitive, setPrimitive] = useState<CatalogPrimitive | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Configuración de la regla
  const [name, setName] = useState("");
  const [params, setParams] = useState<Record<string, any>>({});
  const [schedule, setSchedule] = useState<any>({ frequency: "daily", time: "09:00" });
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const [severity, setSeverity] = useState<string>("info");
  const [cooldown, setCooldown] = useState<number>(60);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  // Estado de submit
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null);

  // Cuando se elige una primitiva, hidratar defaults
  const selectPrimitive = (p: CatalogPrimitive) => {
    setPrimitive(p);
    setName(p.label);
    // params con defaults
    const defaults: Record<string, any> = {};
    for (const [key, def] of Object.entries(p.paramsSchema || {})) {
      if ((def as any).default !== undefined) defaults[key] = (def as any).default;
    }
    setParams(defaults);
    setChannels(p.defaultChannels?.length ? [...p.defaultChannels.filter((c) => c === "in_app")] : ["in_app"]);
    setSeverity(p.defaultSeverity);
    setCooldown(p.defaultCooldownMinutes ?? 60);
    setStep(3);
  };

  // Lista de módulos con count de primitivas
  const modulesWithCounts = (() => {
    const counts: Record<string, number> = {};
    for (const p of catalog) {
      counts[p.module] = (counts[p.module] ?? 0) + 1;
    }
    const order = ["finanzas", "fiscal", "orders", "ml", "ads", "products", "aura", "competencia", "sistema", "security"];
    const result: Array<{ module: string; count: number }> = [];
    for (const m of order) if (counts[m]) result.push({ module: m, count: counts[m] });
    for (const [m, c] of Object.entries(counts)) if (!order.includes(m)) result.push({ module: m, count: c });
    return result;
  })();

  // Primitivas del módulo elegido (filtradas por search)
  const filteredPrimitives = (() => {
    if (!moduleSel) return [];
    let list = catalog.filter((p) => p.module === moduleSel);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.naturalExamples?.some((e) => e.toLowerCase().includes(q))
      );
    }
    return list;
  })();

  const handleSubmit = async (force = false) => {
    if (!primitive) return;
    setSaving(true);
    setError(null);
    setDuplicateInfo(null);

    const payload: any = {
      primitiveKey: primitive.key,
      name,
      params,
      channels,
      severity,
      cooldownMinutes: cooldown,
      allowDuplicate: force,
    };
    if (primitive.type === "schedule") payload.schedule = schedule;

    const r = await onCreate(payload);
    setSaving(false);

    if (!r.ok) {
      if (r.duplicate) {
        setDuplicateInfo(r.duplicate);
      } else {
        setError(r.error ?? "Error desconocido");
      }
    }
  };

  const isSchedule = primitive?.type === "schedule";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
        zIndex: 110,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          background: "white",
          height: "100%",
          overflowY: "auto",
          boxShadow: "-12px 0 40px rgba(15, 23, 42, 0.18)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header sticky */}
        <div
          style={{
            position: "sticky",
            top: 0,
            background: "white",
            borderBottom: "1px solid rgba(15,23,42,0.06)",
            padding: "20px 24px",
            zIndex: 5,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                Nueva regla · paso {step} de 4
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
                {step === 1 && "¿Qué querés monitorear?"}
                {step === 2 && `Elegí qué tipo de alerta`}
                {step === 3 && "Configurá los detalles"}
                {step === 4 && "Confirmá y creá"}
              </div>
            </div>
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
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Stepper */}
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 999,
                  background: n <= step ? "linear-gradient(90deg, #6366f1, #8b5cf6)" : "rgba(15,23,42,0.08)",
                  transition: "background 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", flex: 1 }}>
          {/* PASO 1: Elegir módulo */}
          {step === 1 && (
            <>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18, lineHeight: 1.5 }}>
                Elegí el área de NitroSales que querés monitorear. Cada área tiene varias alertas pre-armadas listas para usar.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {modulesWithCounts.map(({ module, count }) => {
                  const meta = moduleMeta(module);
                  const Icon = meta.Icon;
                  return (
                    <button
                      key={module}
                      onClick={() => {
                        setModuleSel(module);
                        setStep(2);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: 14,
                        background: "white",
                        border: "1px solid rgba(15,23,42,0.08)",
                        borderRadius: 12,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `${meta.tone}40`;
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(15,23,42,0.08)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 9,
                          background: meta.gradient,
                          color: "white",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                          {meta.label}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          {count} alertas disponibles
                        </div>
                      </div>
                      <ArrowRight size={14} style={{ color: "#cbd5e1" }} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* PASO 2: Elegir primitiva */}
          {step === 2 && moduleSel && (
            <>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.5 }}>
                Elegí qué tipo de alerta querés crear dentro de <b style={{ color: "#0f172a" }}>{moduleMeta(moduleSel).label}</b>.
              </div>

              {/* Search */}
              <div style={{ position: "relative", marginBottom: 14 }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar (ej: runway, cancelaciones, stock...)"
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 36px",
                    background: "#fafafa",
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#0f172a",
                    outline: "none",
                  }}
                />
              </div>

              {filteredPrimitives.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  No hay primitivas que matcheen "{searchQuery}". Probá con otra palabra.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredPrimitives.map((p) => {
                  const TypeIcon = p.type === "schedule" ? Clock : p.type === "anomaly" ? Bolt : AlertTriangle;
                  const typeLabel = p.type === "schedule" ? "Reporte" : p.type === "anomaly" ? "Anomalía" : "Condición";
                  const typeColor = p.type === "schedule" ? "#0ea5e9" : p.type === "anomaly" ? "#f59e0b" : "#f43f5e";
                  return (
                    <button
                      key={p.key}
                      onClick={() => selectPrimitive(p)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: 14,
                        background: "white",
                        border: "1px solid rgba(15,23,42,0.08)",
                        borderRadius: 10,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.4)";
                        e.currentTarget.style.background = "rgba(99, 102, 241, 0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(15,23,42,0.08)";
                        e.currentTarget.style.background = "white";
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: `${typeColor}15`,
                          color: typeColor,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <TypeIcon size={13} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                            {p.label}
                          </div>
                          <Badge label={typeLabel} tone={typeColor} />
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                          {p.description}
                        </div>
                        {p.naturalExamples?.[0] && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontStyle: "italic" }}>
                            ej: "{p.naturalExamples[0]}"
                          </div>
                        )}
                      </div>
                      <ArrowRight size={14} style={{ color: "#cbd5e1", flexShrink: 0, marginTop: 6 }} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* PASO 3: Configurar */}
          {step === 3 && primitive && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Resumen primitiva elegida */}
              <div
                style={{
                  padding: 12,
                  background: "rgba(99, 102, 241, 0.05)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 12,
                  color: "#475569",
                }}
              >
                <Check size={14} style={{ color: "#6366f1", flexShrink: 0 }} />
                <div>
                  <b style={{ color: "#0f172a" }}>{primitive.label}</b> — {primitive.description}
                </div>
              </div>

              <Field label="Nombre" hint="Cómo aparece en tu inventario">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                />
              </Field>

              {Object.keys(primitive.paramsSchema || {}).length > 0 && (
                <Section title="Parámetros" Icon={Activity}>
                  {Object.entries(primitive.paramsSchema).map(([key, def]: [string, any]) => (
                    <ParamField
                      key={key}
                      paramKey={key}
                      def={def}
                      value={params[key] ?? def.default}
                      onChange={(v) => setParams((prev) => ({ ...prev, [key]: v }))}
                    />
                  ))}
                </Section>
              )}

              {isSchedule && (
                <Section title="¿Cuándo se ejecuta?" Icon={Calendar}>
                  <Field label="Frecuencia">
                    <select
                      value={schedule?.frequency ?? "daily"}
                      onChange={(e) => setSchedule({ ...schedule, frequency: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="daily">Cada día</option>
                      <option value="weekly">Cada semana</option>
                      <option value="monthly">Cada mes</option>
                    </select>
                  </Field>
                  {schedule?.frequency === "weekly" && (
                    <Field label="Día de la semana">
                      <select
                        value={schedule?.dayOfWeek ?? 1}
                        onChange={(e) => setSchedule({ ...schedule, dayOfWeek: Number(e.target.value) })}
                        style={inputStyle}
                      >
                        <option value={0}>Domingo</option>
                        <option value={1}>Lunes</option>
                        <option value={2}>Martes</option>
                        <option value={3}>Miércoles</option>
                        <option value={4}>Jueves</option>
                        <option value={5}>Viernes</option>
                        <option value={6}>Sábado</option>
                      </select>
                    </Field>
                  )}
                  {schedule?.frequency === "monthly" && (
                    <Field label="Día del mes" hint="1 al 31">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={schedule?.dayOfMonth ?? 1}
                        onChange={(e) => setSchedule({ ...schedule, dayOfMonth: Number(e.target.value) })}
                        style={inputStyle}
                      />
                    </Field>
                  )}
                  <Field label="Hora" hint="Formato 24hs (HH:MM)">
                    <input
                      type="time"
                      value={schedule?.time ?? "09:00"}
                      onChange={(e) => setSchedule({ ...schedule, time: e.target.value })}
                      style={inputStyle}
                    />
                  </Field>
                </Section>
              )}

              <Section title="Canal de notificación" Icon={Bell}>
                <ChannelToggle
                  label="In-app"
                  sub="En tu inbox de alertas"
                  Icon={Bell}
                  checked={channels.includes("in_app")}
                  onChange={(checked) =>
                    setChannels((prev) => (checked ? Array.from(new Set([...prev, "in_app"])) : prev.filter((c) => c !== "in_app")))
                  }
                />
                <ChannelToggle
                  label="Email"
                  sub="Te llega a tu inbox de email"
                  Icon={Mail}
                  checked={channels.includes("email")}
                  onChange={(checked) =>
                    setChannels((prev) => (checked ? Array.from(new Set([...prev, "email"])) : prev.filter((c) => c !== "email")))
                  }
                />
              </Section>

              <Section title="Prioridad" Icon={AlertTriangle}>
                <div style={{ display: "flex", gap: 8 }}>
                  <SeverityChip label="Crítica" value="critical" current={severity} onClick={() => setSeverity("critical")} tone="#ef4444" />
                  <SeverityChip label="Atención" value="warning" current={severity} onClick={() => setSeverity("warning")} tone="#f59e0b" />
                  <SeverityChip label="Info" value="info" current={severity} onClick={() => setSeverity("info")} tone="#0ea5e9" />
                </div>
              </Section>

              {!isSchedule && (
                <Field label="Tiempo mínimo entre avisos" hint="Para evitar spam si el evento se repite">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="number"
                      min={0}
                      value={cooldown}
                      onChange={(e) => setCooldown(Number(e.target.value))}
                      style={{ ...inputStyle, maxWidth: 120 }}
                    />
                    <span style={{ fontSize: 13, color: "#64748b" }}>minutos</span>
                  </div>
                </Field>
              )}
            </div>
          )}

          {/* PASO 4: Resumen + crear */}
          {step === 4 && primitive && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                Revisá y confirmá. Una vez creada, podés editarla o pausarla cuando quieras.
              </div>

              <div
                style={{
                  padding: 18,
                  background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(139,92,246,0.05))",
                  border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: 12,
                }}
              >
                <SummaryRow label="Nombre" value={name} />
                <SummaryRow label="Qué monitorea" value={primitive.label} />
                <SummaryRow label="Tipo" value={primitive.type === "schedule" ? "Reporte programado" : "Alerta condicional"} />
                {Object.keys(params).length > 0 && (
                  <SummaryRow label="Parámetros" value={Object.entries(params).map(([k, v]) => `${k}=${v}`).join(", ")} />
                )}
                {isSchedule && <SummaryRow label="Cuándo" value={describeSchedule(schedule)} />}
                <SummaryRow label="Canales" value={channels.join(", ")} />
                <SummaryRow label="Prioridad" value={severity === "critical" ? "Crítica" : severity === "warning" ? "Atención" : "Info"} />
                {!isSchedule && <SummaryRow label="Cooldown" value={`${cooldown} minutos`} />}
              </div>

              {duplicateInfo && (
                <div
                  style={{
                    padding: "12px 14px",
                    background: "rgba(245, 158, 11, 0.06)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "#92400e",
                  }}
                >
                  <b>Ya tenés una regla equivalente.</b> Creada el {new Date(duplicateInfo.createdAt).toLocaleDateString("es-AR")}, {duplicateInfo.enabled ? "activa" : "desactivada"}.
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => handleSubmit(true)}
                      disabled={saving}
                      style={{
                        padding: "6px 12px",
                        background: "#92400e",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      Crear igual igual
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(239, 68, 68, 0.06)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#991b1b",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer sticky con navegación */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "white",
            borderTop: "1px solid rgba(15,23,42,0.06)",
            padding: "14px 24px",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <button
            onClick={() => {
              if (step === 1) onClose();
              else if (step === 2) {
                setStep(1);
                setModuleSel(null);
              } else if (step === 3) {
                setStep(2);
                setPrimitive(null);
              } else if (step === 4) setStep(3);
            }}
            disabled={saving}
            style={{
              padding: "9px 16px",
              background: "transparent",
              color: "#64748b",
              border: "1px solid rgba(15,23,42,0.1)",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {step === 1 ? "Cancelar" : "Volver"}
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            {step === 3 && (
              <button
                onClick={() => setStep(4)}
                disabled={!name.trim()}
                style={{
                  padding: "9px 16px",
                  background: name.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#e2e8f0",
                  color: name.trim() ? "white" : "#94a3b8",
                  border: "none",
                  borderRadius: 8,
                  cursor: name.trim() ? "pointer" : "not-allowed",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Revisar <ArrowRight size={13} />
              </button>
            )}
            {step === 4 && !duplicateInfo && (
              <button
                onClick={() => handleSubmit(false)}
                disabled={saving}
                style={{
                  padding: "9px 18px",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: saving ? 0.6 : 1,
                  boxShadow: "0 2px 12px rgba(99, 102, 241, 0.25)",
                }}
              >
                {saving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                {saving ? "Creando…" : "Crear regla"}
              </button>
            )}
          </div>
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
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: 12 }}>
      <span style={{ color: "#94a3b8", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "#0f172a", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ── Subcomponentes del drawer (también usados por el wizard) ──

const inputStyle: any = {
  width: "100%",
  padding: "9px 12px",
  background: "white",
  border: "1px solid rgba(15,23,42,0.12)",
  borderRadius: 8,
  fontSize: 13,
  color: "#0f172a",
  outline: "none",
  fontFamily: "inherit",
  fontVariantNumeric: "tabular-nums",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
        {label}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
          <Info size={11} /> {hint}
        </div>
      )}
      {children}
    </div>
  );
}

function Section({ title, Icon, children }: { title: string; Icon: any; children: any }) {
  return (
    <div
      style={{
        background: "#fafafa",
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={12} />
        {title}
      </div>
      {children}
    </div>
  );
}

function ParamField({
  paramKey,
  def,
  value,
  onChange,
}: {
  paramKey: string;
  def: any;
  value: any;
  onChange: (v: any) => void;
}) {
  const label = def.label ?? paramKey;
  const hint = [
    def.required ? "obligatorio" : null,
    def.min !== undefined && def.max !== undefined ? `entre ${def.min} y ${def.max}` : null,
    def.description ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (def.type === "number") {
    return (
      <Field label={label} hint={hint || undefined}>
        <input
          type="number"
          min={def.min}
          max={def.max}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          style={inputStyle}
        />
      </Field>
    );
  }
  if (def.type === "boolean") {
    return (
      <Field label={label} hint={hint || undefined}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span style={{ fontSize: 13, color: "#475569" }}>{value ? "Activado" : "Desactivado"}</span>
        </label>
      </Field>
    );
  }
  if (def.type === "string" && def.options?.length) {
    return (
      <Field label={label} hint={hint || undefined}>
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          {def.options.map((o: any) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (def.type === "string") {
    return (
      <Field label={label} hint={hint || undefined}>
        <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      </Field>
    );
  }
  // Fallback: array u otros tipos no soportados aún en UI
  return (
    <Field label={label} hint={hint || `Tipo "${def.type}" se edita por chat de Aurum por ahora`}>
      <div style={{ ...inputStyle, color: "#94a3b8", background: "#f1f5f9" }}>
        {JSON.stringify(value) || "—"}
      </div>
    </Field>
  );
}

function ChannelToggle({
  label,
  sub,
  Icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sub: string;
  Icon: any;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 10,
        background: checked ? "rgba(99, 102, 241, 0.05)" : "white",
        border: `1px solid ${checked ? "rgba(99,102,241,0.3)" : "rgba(15,23,42,0.08)"}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: checked ? "#6366f1" : "#cbd5e1",
          color: "white",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={13} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{sub}</div>
      </div>
    </label>
  );
}

function SeverityChip({
  label,
  value,
  current,
  onClick,
  tone,
}: {
  label: string;
  value: string;
  current: string;
  onClick: () => void;
  tone: string;
}) {
  const active = value === current;
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 10px",
        background: active ? `${tone}15` : "white",
        color: active ? tone : "#64748b",
        border: `1px solid ${active ? `${tone}40` : "rgba(15,23,42,0.1)"}`,
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, opacity: active ? 1 : 0.4 }} />
      {label}
    </button>
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
