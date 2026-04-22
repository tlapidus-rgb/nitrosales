// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/email-templates
// ══════════════════════════════════════════════════════════════
// Editor de templates de email del flujo de onboarding.
// - Timeline visual: 2 fases (Pipeline pre-registro | Onboarding post-registro)
// - Cards por email con trigger explicativo
// - Drawer de edición con preview en vivo (iframe srcDoc)
// - Toggle "Activa" para variantes (solo 1 activa por templateKey)
// ══════════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from "react";
import {
  Mail, ChevronRight, X, Save, Check, Loader2, Eye,
  Send, Clock, Sparkles, AlertCircle, Trash2, Plus,
} from "lucide-react";

type Tpl = {
  id: string;
  templateKey: string;
  variant: string;
  label: string;
  flowStage: "pipeline" | "onboarding";
  stageOrder: number;
  trigger: string;
  subject: string;
  preheader: string;
  eyebrow: string | null;
  heroTop: string | null;
  heroAccent: string | null;
  subParagraphs: string[];
  ctaLabel: string | null;
  finePrint: string | null;
  isActive: boolean;
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Tpl[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Tpl | null>(null);
  const [migrating, setMigrating] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/admin/email-templates");
      const j = await r.json();
      if (!j.ok) {
        setError(j.error || "Error cargando templates");
        return;
      }
      setTemplates(j.templates || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function runMigration() {
    setMigrating(true);
    try {
      const r = await fetch("/api/admin/migrate-email-templates", { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        await load();
      } else {
        setError(j.error);
      }
    } finally {
      setMigrating(false);
    }
  }

  const grouped = useMemo(() => {
    if (!templates) return { pipeline: [], onboarding: [] };
    const pipeline: Tpl[] = [];
    const onboarding: Tpl[] = [];
    for (const t of templates) {
      if (t.flowStage === "pipeline") pipeline.push(t);
      else onboarding.push(t);
    }
    return { pipeline, onboarding };
  }, [templates]);

  // Agrupar variantes: lead_invite aparece como 1 card con sus 4 variantes dentro
  function groupByKey(list: Tpl[]) {
    const map = new Map<string, Tpl[]>();
    for (const t of list) {
      const key = t.templateKey;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // Sort variants: active first, then by variant key
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.variant.localeCompare(b.variant);
      });
    }
    return Array.from(map.entries()).sort((a, b) => a[1][0].stageOrder - b[1][0].stageOrder);
  }

  if (error && !templates) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0A0F", padding: "88px 24px 48px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", background: "#141419", border: "1px solid #1F1F2E", borderRadius: 14, padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <AlertCircle size={20} color="#F59E0B" />
            <div style={{ fontWeight: 700, color: "#fff" }}>Tabla no inicializada</div>
          </div>
          <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            La tabla <code style={{ color: "#FF5E1A" }}>email_templates</code> no existe todavía. Ejecutá la migración para crearla y cargar los 9 templates actuales.
          </p>
          <button
            onClick={runMigration}
            disabled={migrating}
            style={{
              padding: "10px 20px",
              background: "#FF5E1A",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              cursor: migrating ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {migrating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            {migrating ? "Migrando..." : "Ejecutar migración"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", padding: "88px 24px 48px" }}>
      {/* Hero */}
      <div style={{ maxWidth: 1200, margin: "0 auto 40px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5E1A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>
          📧 Templates de email
        </div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
          Los mails del flujo de onboarding
        </h1>
        <p style={{ margin: "12px 0 0", color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, maxWidth: 680 }}>
          Estos son todos los emails que NitroSales le manda a sus leads y clientes durante el flujo. Click en cualquier card para <strong style={{ color: "#fff" }}>editar el texto</strong> con preview en vivo. Los cambios se aplican inmediatamente.
        </p>
      </div>

      {templates === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={24} className="spin" color="#9CA3AF" />
        </div>
      ) : (
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* FASE 1: PIPELINE */}
          <PhaseBlock
            number="1"
            title="Pipeline — antes del registro"
            description="Cuando el lead todavía no llenó el formulario"
            color="#FF5E1A"
            groups={groupByKey(grouped.pipeline)}
            onSelect={setSelected}
            onReload={load}
          />

          {/* Arrow separator */}
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0", color: "#3F3F46" }}>
            <ChevronRight size={24} style={{ transform: "rotate(90deg)" }} />
          </div>

          {/* FASE 2: ONBOARDING */}
          <PhaseBlock
            number="2"
            title="Onboarding — después de postular"
            description="Desde que el lead completa el form hasta que la data histórica está lista"
            color="#22C55E"
            groups={groupByKey(grouped.onboarding)}
            onSelect={setSelected}
            onReload={load}
          />
        </div>
      )}

      {/* Drawer edit */}
      {selected && (
        <EditDrawer
          template={selected}
          onClose={() => setSelected(null)}
          onSave={async () => {
            await load();
            setSelected(null);
          }}
        />
      )}

      <style jsx global>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Phase block (Pipeline / Onboarding)
// ══════════════════════════════════════════════════════════════

function PhaseBlock({ number, title, description, color, groups, onSelect, onReload }: any) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${color}18`, border: `1px solid ${color}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 800, color,
        }}>
          {number}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>{title}</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>{description}</div>
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
        {groups.map(([key, variants]: any) => (
          <TemplateCard
            key={key}
            templateKey={key}
            variants={variants}
            onSelect={onSelect}
            onReload={onReload}
            phaseColor={color}
          />
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Template card (1 template, con variantes si aplica)
// ══════════════════════════════════════════════════════════════

function TemplateCard({ templateKey, variants, onSelect, onReload, phaseColor }: any) {
  const active = variants.find((v: Tpl) => v.isActive) || variants[0];
  const hasVariants = variants.length > 1;

  async function setActive(id: string) {
    try {
      await fetch(`/api/admin/email-templates/${id}/activate`, { method: "POST" });
      onReload();
    } catch (e) {
      // silent
    }
  }

  return (
    <div style={{
      background: "#141419",
      border: "1px solid #1F1F2E",
      borderRadius: 14,
      overflow: "hidden",
      transition: "border-color 160ms",
    }}>
      {/* Main card */}
      <button
        onClick={() => onSelect(active)}
        style={{
          width: "100%", textAlign: "left", padding: "20px 22px", background: "transparent",
          border: 0, cursor: "pointer", color: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 4 }}>
              {active.label.split(" — ")[0]}
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 6 }}>
              <Clock size={12} style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
              <span>{active.trigger}</span>
            </div>
          </div>
          <Eye size={16} color="#6B7280" />
        </div>

        {/* Subject preview */}
        <div style={{
          marginTop: 12,
          padding: "8px 12px",
          background: "#0A0A0F",
          border: "1px solid #1F1F2E",
          borderRadius: 7,
          fontSize: 12,
          color: "#E4E4E7",
          fontFamily: "'SF Mono', Menlo, monospace",
        }}>
          <span style={{ color: "#71717A" }}>Subject: </span>
          {active.subject}
        </div>
      </button>

      {/* Variants selector */}
      {hasVariants && (
        <div style={{ borderTop: "1px solid #1F1F2E", padding: "10px 12px 10px", background: "#0F0F14" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, padding: "0 10px" }}>
            {variants.length} variantes · una activa
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {variants.map((v: Tpl) => {
              const isOn = v.isActive;
              return (
                <button
                  key={v.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isOn) setActive(v.id);
                    else onSelect(v);
                  }}
                  style={{
                    padding: "6px 11px",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: isOn ? `${phaseColor}18` : "transparent",
                    border: `1px solid ${isOn ? phaseColor + "66" : "#27272A"}`,
                    color: isOn ? phaseColor : "#A1A1AA",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 120ms",
                  }}
                  title={isOn ? "Activa · click para editar" : "Click para activar"}
                >
                  {isOn && <Check size={11} />}
                  {v.variant === "default" ? "Default" : v.variant}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Edit drawer — right side panel con forma + preview
// ══════════════════════════════════════════════════════════════

function EditDrawer({ template, onClose, onSave }: { template: Tpl; onClose: () => void; onSave: () => void }) {
  const [draft, setDraft] = useState<Tpl>({ ...template, subParagraphs: [...(template.subParagraphs || [])] });
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Render preview on-the-fly (POST a endpoint temporal, o reutilizar el GET /render)
  async function refreshPreview() {
    setLoading(true);
    try {
      // Save first (in memory via PUT? No — use the render endpoint after saving temporarily)
      // Estrategia: guardar draft, luego pedir render. Simple y fiel.
      await persist(draft, false);
      const r = await fetch(`/api/admin/email-templates/${draft.id}/render?contactName=Juan&companyName=Arredo`);
      const j = await r.json();
      if (j.ok) setPreviewHtml(j.html);
    } finally {
      setLoading(false);
    }
  }

  async function persist(d: Tpl, closeAfter: boolean) {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/email-templates/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: d.subject,
          preheader: d.preheader,
          eyebrow: d.eyebrow,
          heroTop: d.heroTop,
          heroAccent: d.heroAccent,
          subParagraphs: d.subParagraphs,
          ctaLabel: d.ctaLabel,
          finePrint: d.finePrint,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      if (closeAfter) onSave();
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { refreshPreview(); /* eslint-disable-next-line */ }, []);

  function update(patch: Partial<Tpl>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }

  function updateSubParagraph(idx: number, value: string) {
    const next = [...draft.subParagraphs];
    next[idx] = value;
    update({ subParagraphs: next });
  }

  function addSubParagraph() {
    update({ subParagraphs: [...draft.subParagraphs, ""] });
  }

  function removeSubParagraph(idx: number) {
    const next = draft.subParagraphs.filter((_, i) => i !== idx);
    update({ subParagraphs: next });
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(6px)", zIndex: 200,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(100%, 1200px)", background: "#0A0A0F",
        zIndex: 201, display: "flex", borderLeft: "1px solid #1F1F2E",
        boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
      }}>
        {/* LEFT: form */}
        <div style={{ width: 460, borderRight: "1px solid #1F1F2E", overflowY: "auto", padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5E1A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                Editar template
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
                {draft.label}
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6, lineHeight: 1.5 }}>
                {draft.trigger}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: 0, color: "#9CA3AF", cursor: "pointer", padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {/* Variables help */}
          <div style={{
            background: "rgba(255,94,26,0.06)",
            border: "1px solid rgba(255,94,26,0.2)",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 24,
            fontSize: 12,
            color: "#D4D4D8",
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 600, color: "#fff", marginBottom: 6 }}>💡 Variables disponibles</div>
            Usá <code style={{ color: "#FF5E1A" }}>{"{contactName}"}</code> para el nombre del contacto,{" "}
            <code style={{ color: "#FF5E1A" }}>{"{companyName}"}</code> para la empresa.{" "}
            En "Hero acento", rodeá una palabra con <code style={{ color: "#FF5E1A" }}>{"{llaves}"}</code> para que salga en naranja.
          </div>

          <Field label="Subject (asunto del email)" value={draft.subject} onChange={(v) => update({ subject: v })} />
          <Field label="Preheader (preview en el inbox)" value={draft.preheader} onChange={(v) => update({ preheader: v })} multiline />
          <Field label="Eyebrow (tag sobre el hero)" value={draft.eyebrow || ""} onChange={(v) => update({ eyebrow: v || null })} placeholder="Ej: Invitación" />

          <div style={{ marginBottom: 18 }}>
            <Label>Hero</Label>
            <Field inline value={draft.heroTop || ""} onChange={(v) => update({ heroTop: v || null })} placeholder="Primera línea del titulo" />
            <div style={{ marginTop: 6 }}>
              <Field
                inline
                value={draft.heroAccent || ""}
                onChange={(v) => update({ heroAccent: v || null })}
                placeholder="Segunda línea (usá {palabra} para naranja)"
              />
            </div>
          </div>

          <Label>Párrafos del cuerpo</Label>
          {draft.subParagraphs.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 8 }}>
              <textarea
                value={p}
                onChange={(e) => updateSubParagraph(i, e.target.value)}
                rows={3}
                style={{
                  flex: 1, background: "#141419", border: "1px solid #27272A",
                  borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13,
                  fontFamily: "inherit", resize: "vertical", lineHeight: 1.5,
                }}
              />
              {draft.subParagraphs.length > 1 && (
                <button
                  onClick={() => removeSubParagraph(i)}
                  style={{ background: "transparent", border: "1px solid #27272A", borderRadius: 6, padding: 8, color: "#9CA3AF", cursor: "pointer" }}
                  title="Eliminar párrafo"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addSubParagraph}
            style={{
              padding: "7px 12px", fontSize: 12, color: "#9CA3AF",
              background: "transparent", border: "1px dashed #3F3F46", borderRadius: 7,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              marginBottom: 18,
            }}
          >
            <Plus size={12} /> Agregar párrafo
          </button>

          <Field label="CTA (texto del botón)" value={draft.ctaLabel || ""} onChange={(v) => update({ ctaLabel: v || null })} placeholder="Ej: Comenzar configuración" />
          <Field label="Fine print (letra chica al final)" value={draft.finePrint || ""} onChange={(v) => update({ finePrint: v || null })} multiline placeholder="Opcional" />

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 28, paddingTop: 20, borderTop: "1px solid #1F1F2E" }}>
            <button
              onClick={() => persist(draft, true)}
              disabled={saving || !dirty}
              style={{
                flex: 1, padding: "11px 18px", background: dirty ? "#FF5E1A" : "#27272A",
                color: "#fff", border: 0, borderRadius: 9, fontWeight: 700, fontSize: 13,
                cursor: dirty && !saving ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}
            >
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              onClick={refreshPreview}
              disabled={loading}
              style={{
                padding: "11px 18px", background: "transparent", color: "#E4E4E7",
                border: "1px solid #27272A", borderRadius: 9, fontWeight: 600, fontSize: 13,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7,
              }}
            >
              {loading ? <Loader2 size={14} className="spin" /> : <Eye size={14} />}
              Refrescar preview
            </button>
          </div>
        </div>

        {/* RIGHT: preview */}
        <div style={{ flex: 1, background: "#050508", overflowY: "auto", position: "relative" }}>
          <div style={{
            position: "sticky", top: 0, zIndex: 2,
            padding: "14px 20px", borderBottom: "1px solid #1F1F2E",
            background: "rgba(10,10,15,0.92)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9CA3AF", fontSize: 12 }}>
              <Eye size={13} />
              <span>Preview · destinatario de ejemplo <strong style={{ color: "#fff" }}>Juan</strong> de <strong style={{ color: "#fff" }}>Arredo</strong></span>
            </div>
          </div>
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              title="preview"
              style={{ width: "100%", height: "calc(100vh - 50px)", border: 0, background: "#0A0A0F" }}
            />
          ) : (
            <div style={{ padding: 60, textAlign: "center", color: "#6B7280" }}>
              {loading ? <Loader2 size={24} className="spin" /> : "Cargando preview..."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Helpers UI
// ══════════════════════════════════════════════════════════════

function Label({ children }: any) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, multiline, inline,
}: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; inline?: boolean }) {
  return (
    <div style={{ marginBottom: inline ? 0 : 18 }}>
      {label && <Label>{label}</Label>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{
            width: "100%", background: "#141419", border: "1px solid #27272A",
            borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13,
            fontFamily: "inherit", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box",
          }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%", background: "#141419", border: "1px solid #27272A",
            borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13,
            fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}
