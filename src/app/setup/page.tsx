// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /setup — Wizard de conexión de plataformas
// ══════════════════════════════════════════════════════════════
// El cliente ve aca las plataformas que marcó en el onboarding,
// divididas en "pendientes de conectar" y "ya conectadas". Cada
// plataforma pendiente es un card expandible con inputs +
// tutoriales embebidos. Al completar todas, CTA "Terminar" lleva
// al dashboard y arranca el backfill.
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Loader2,
} from "lucide-react";

const BRAND_ORANGE = "#FF5E1A";
const CARD_BG = "#141419";
const BORDER = "#1F1F2E";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const ACCENT_GREEN = "#22C55E";

interface Platform {
  key: "VTEX" | "MERCADOLIBRE" | "META_ADS" | "META_PIXEL" | "GOOGLE_ADS";
  name: string;
  color: string;
  description: string;
  oauth?: boolean;
}

const PLATFORM_META: Record<string, Platform> = {
  VTEX: {
    key: "VTEX",
    name: "VTEX",
    color: "#FF0080",
    description: "Ecommerce principal — pedidos, productos, stock en tiempo real.",
  },
  MERCADOLIBRE: {
    key: "MERCADOLIBRE",
    name: "MercadoLibre",
    color: "#FFE600",
    description: "Cuenta vendedor. Te vamos a redirigir a MELI para autorizar.",
    oauth: true,
  },
  META_ADS: {
    key: "META_ADS",
    name: "Meta Ads",
    color: "#1877F2",
    description: "Facebook & Instagram Ads — atribución, ROAS, creatividades.",
  },
  META_PIXEL: {
    key: "META_PIXEL",
    name: "Meta Pixel (CAPI)",
    color: "#1877F2",
    description: "Conversiones server-side hacia Meta para mejor match quality.",
  },
  GOOGLE_ADS: {
    key: "GOOGLE_ADS",
    name: "Google Ads",
    color: "#4285F4",
    description: "Search, Shopping, Performance Max — ROAS y atribución.",
    oauth: true,
  },
};

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/status", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        return;
      }
      setStatus(json);
      setError(null);
      // Auto-expandir el primer pendiente
      const firstPending = json.platforms.find((p: any) => p.needsSetup);
      if (firstPending) setExpandedKey(firstPending.platform);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectedPlatforms = useMemo(
    () => (status?.platforms || []).filter((p: any) => p.selected),
    [status]
  );
  const pending = selectedPlatforms.filter((p: any) => p.needsSetup);
  const active = selectedPlatforms.filter((p: any) => p.status === "ACTIVE");
  const allDone = selectedPlatforms.length > 0 && pending.length === 0;

  if (loading && !status) {
    return (
      <div style={{ padding: 80, textAlign: "center", color: TEXT_SECONDARY }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
        <div>Cargando tus plataformas…</div>
        <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            background: "rgba(255,94,26,0.1)",
            border: "1px solid rgba(255,94,26,0.25)",
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            color: BRAND_ORANGE,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 18,
          }}
        >
          <Sparkles size={12} />
          Setup inicial
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
            background: "linear-gradient(135deg, #fff 0%, #9CA3AF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Conectá tus plataformas
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          Te guiamos paso a paso. Todo encriptado con AES-256.
          <br />
          Cuando termines, empezamos a traer tu data histórica automáticamente.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "14px 18px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10,
            color: "#F87171",
            fontSize: 13,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {/* Progress */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: TEXT_PRIMARY, fontWeight: 600, marginBottom: 6 }}>
            {active.length}/{selectedPlatforms.length} conectadas
          </div>
          <div
            style={{
              height: 5,
              background: "rgba(255,255,255,0.05)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${
                  selectedPlatforms.length > 0
                    ? (active.length / selectedPlatforms.length) * 100
                    : 0
                }%`,
                height: "100%",
                background: `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`,
                transition: "width 400ms ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Pendientes */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionHeader
            title="Pendientes de conectar"
            count={pending.length}
            tone={BRAND_ORANGE}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map((p: any) => (
              <PlatformCard
                key={p.platform}
                meta={PLATFORM_META[p.platform]}
                publicCreds={p.publicCreds}
                expanded={expandedKey === p.platform}
                onToggle={() =>
                  setExpandedKey(expandedKey === p.platform ? null : p.platform)
                }
                onSaved={() => {
                  load();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ya conectadas */}
      {active.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionHeader title="Conectadas" count={active.length} tone={ACCENT_GREEN} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map((p: any) => (
              <ActiveRow key={p.platform} meta={PLATFORM_META[p.platform]} />
            ))}
          </div>
        </div>
      )}

      {/* CTA finalizar */}
      {allDone && (
        <div style={{ marginTop: 40, textAlign: "center" }}>
          <div
            style={{
              padding: "24px 28px",
              background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.04))",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 14,
              marginBottom: 20,
            }}
          >
            <CheckCircle2 size={28} color={ACCENT_GREEN} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
              Todo conectado
            </div>
            <div style={{ fontSize: 13, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
              Estamos trayendo tu data histórica en background. Vas a ver el progreso adentro del
              producto — podés empezar a explorar ya.
            </div>
          </div>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "14px 28px",
              background: `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: `0 4px 20px rgba(255,94,26,0.3)`,
            }}
          >
            Entrar al producto
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {selectedPlatforms.length === 0 && !loading && (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            background: CARD_BG,
            border: `1px dashed ${BORDER}`,
            borderRadius: 12,
            color: TEXT_SECONDARY,
          }}
        >
          No tenés ninguna plataforma configurada aún. Contactá a soporte.
        </div>
      )}
    </div>
  );
}

// ─── Components ─────────────────────────────────────────────
function SectionHeader({ title, count, tone }: { title: string; count: number; tone: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: tone,
      }}
    >
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: tone }} />
      {title}
      <span
        style={{
          fontSize: 10,
          padding: "2px 7px",
          background: `${tone}1A`,
          border: `1px solid ${tone}33`,
          borderRadius: 99,
          color: tone,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function ActiveRow({ meta }: { meta: Platform }) {
  if (!meta) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: meta.color,
          boxShadow: `0 0 8px ${meta.color}`,
        }}
      />
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#fff" }}>{meta.name}</div>
      <CheckCircle2 size={18} color={ACCENT_GREEN} />
    </div>
  );
}

// ─── PlatformCard (expandible con inputs por plataforma) ─────
function PlatformCard({
  meta,
  publicCreds,
  expanded,
  onToggle,
  onSaved,
}: {
  meta: Platform;
  publicCreds: any;
  expanded: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creds, setCreds] = useState<any>(() => ({ ...(publicCreds || {}) }));

  if (!meta) return null;

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/setup/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: meta.key, credentials: creds }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error || "Error");
        setSaving(false);
        return;
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${expanded ? `${meta.color}44` : BORDER}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 160ms",
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#fff",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: meta.color,
            boxShadow: `0 0 8px ${meta.color}`,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{meta.name}</div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 3 }}>{meta.description}</div>
        </div>
        {expanded ? <ChevronDown size={16} color={TEXT_SECONDARY} /> : <ChevronRight size={16} color={TEXT_SECONDARY} />}
      </button>

      {expanded && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
          {err && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8,
                color: "#F87171",
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              {err}
            </div>
          )}

          {meta.key === "VTEX" && <VtexForm creds={creds} setCreds={setCreds} />}
          {meta.key === "MERCADOLIBRE" && <MlForm creds={creds} setCreds={setCreds} />}
          {meta.key === "META_ADS" && <MetaAdsForm creds={creds} setCreds={setCreds} />}
          {meta.key === "META_PIXEL" && <MetaPixelForm creds={creds} setCreds={setCreds} />}
          {meta.key === "GOOGLE_ADS" && <GoogleAdsForm creds={creds} setCreds={setCreds} />}

          <button
            onClick={save}
            disabled={saving}
            style={{
              marginTop: 14,
              padding: "10px 18px",
              background: saving ? "#27272A" : meta.color,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saving ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                Conectando…
              </>
            ) : (
              <>
                Conectar {meta.name}
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Inputs / Fields genericos ───────────────────────────────
function Field({
  label,
  children,
  tutorial,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  tutorial?: { title: string; steps: string[]; docUrl?: string };
  hint?: string;
}) {
  const [showTutorial, setShowTutorial] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>{label}</label>
        {tutorial && (
          <button
            type="button"
            onClick={() => setShowTutorial((s) => !s)}
            style={{
              fontSize: 10,
              padding: "2px 7px",
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${BORDER}`,
              borderRadius: 5,
              color: TEXT_SECONDARY,
              cursor: "pointer",
            }}
          >
            {showTutorial ? "Ocultar tutorial" : "¿Cómo lo obtengo?"}
          </button>
        )}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 5 }}>{hint}</div>}
      {tutorial && showTutorial && (
        <div
          style={{
            marginTop: 10,
            padding: "12px 14px",
            background: "rgba(255,255,255,0.02)",
            border: `1px dashed ${BORDER}`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>
            {tutorial.title}
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.7 }}>
            {tutorial.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {tutorial.docUrl && (
            <a
              href={tutorial.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginTop: 8,
                fontSize: 11,
                color: BRAND_ORANGE,
                textDecoration: "none",
              }}
            >
              Ver doc oficial <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  maxLength?: number;
}) {
  return (
    <input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        width: "100%",
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        color: "#fff",
        fontSize: 13,
        outline: "none",
        fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : undefined,
        boxSizing: "border-box",
      }}
    />
  );
}

// ─── Forms por plataforma ───────────────────────────────────
function VtexForm({ creds, setCreds }: any) {
  return (
    <>
      <Field
        label="Account Name"
        tutorial={{
          title: "¿Cuál es mi Account Name?",
          steps: [
            "Es el subdomain de tu admin VTEX.",
            "Si tu admin es 'miempresa.myvtex.com', tu account name es 'miempresa'.",
            "Si es 'miempresa.vtexcommercestable.com.br', es 'miempresa'.",
          ],
        }}
      >
        <Input
          value={creds.accountName}
          onChange={(v) => setCreds({ ...creds, accountName: v })}
          placeholder="miempresa"
          maxLength={60}
        />
      </Field>
      <Field
        label="App Key"
        tutorial={{
          title: "¿Cómo genero App Key + Token?",
          steps: [
            "Entrá a VTEX Admin.",
            "Cuenta → Gestión de usuarios → App Keys.",
            "Click 'Crear key' (nombre sugerido: 'NitroSales').",
            "Roles mínimos: Order Viewer, Catalog Read, Product Viewer.",
            "Copiar App Key y App Token (solo se muestran una vez).",
          ],
          docUrl:
            "https://developers.vtex.com/docs/guides/api-authentication-using-application-keys",
        }}
      >
        <Input
          value={creds.appKey}
          onChange={(v) => setCreds({ ...creds, appKey: v })}
          placeholder="vtexappkey-..."
          mono
        />
      </Field>
      <Field label="App Token">
        <Input
          value={creds.appToken}
          onChange={(v) => setCreds({ ...creds, appToken: v })}
          placeholder="Token largo alfanumérico"
          mono
        />
      </Field>
    </>
  );
}

function MlForm({ creds, setCreds }: any) {
  return (
    <>
      <Field
        label="Nombre de usuario ML"
        hint="Después de guardar, te redirigimos a MELI para autorizar vía OAuth."
        tutorial={{
          title: "¿Dónde veo mi usuario ML?",
          steps: [
            "Entrá a mercadolibre.com.ar logueado.",
            "Arriba a la derecha, click en tu nombre.",
            "Tu usuario aparece en el menú.",
            "Pegalo acá sin la @.",
          ],
        }}
      >
        <Input
          value={creds.username}
          onChange={(v) => setCreds({ ...creds, username: v })}
          placeholder="tuusuario"
          maxLength={60}
        />
      </Field>
    </>
  );
}

function MetaAdsForm({ creds, setCreds }: any) {
  return (
    <>
      <Field
        label="Ad Account ID"
        tutorial={{
          title: "¿Cómo encuentro mi Ad Account ID?",
          steps: [
            "business.facebook.com logueado.",
            "Configuración del negocio → Cuentas → Cuentas publicitarias.",
            "Copiá el ID (empieza con 'act_').",
          ],
          docUrl: "https://www.facebook.com/business/help/1492627900875762",
        }}
      >
        <Input
          value={creds.adAccountId}
          onChange={(v) => setCreds({ ...creds, adAccountId: v })}
          placeholder="act_123456789"
          mono
        />
      </Field>
      <Field
        label="Access Token (System User)"
        tutorial={{
          title: "¿Cómo genero el Access Token?",
          steps: [
            "Business Manager → Usuarios del sistema.",
            "Agregar → crear usuario con rol Admin.",
            "Asignar tu Ad Account.",
            "Generar token con permisos: ads_management, ads_read, business_management.",
            "Usar System User, NO personal (los personales expiran).",
          ],
          docUrl: "https://developers.facebook.com/docs/marketing-api/system-users",
        }}
      >
        <Input
          value={creds.accessToken}
          onChange={(v) => setCreds({ ...creds, accessToken: v })}
          placeholder="Token de System User"
          mono
        />
      </Field>
    </>
  );
}

function MetaPixelForm({ creds, setCreds }: any) {
  return (
    <>
      <Field
        label="Pixel ID"
        tutorial={{
          title: "¿Qué es el Pixel ID?",
          steps: [
            "Es distinto del Ad Account ID — identifica el pixel de conversiones.",
            "business.facebook.com/events_manager.",
            "Seleccioná tu pixel → Configuración → ID del pixel (15-16 dígitos).",
          ],
          docUrl: "https://www.facebook.com/business/help/952192354843755",
        }}
      >
        <Input
          value={creds.pixelId}
          onChange={(v) => setCreds({ ...creds, pixelId: v.replace(/[^0-9]/g, "") })}
          placeholder="1234567890123456"
          mono
          maxLength={20}
        />
      </Field>
      <Field
        label="Access Token para CAPI"
        hint="Puede ser el mismo System User token de Meta Ads si tiene ads_management."
      >
        <Input
          value={creds.accessToken}
          onChange={(v) => setCreds({ ...creds, accessToken: v })}
          placeholder="Token de acceso"
          mono
        />
      </Field>
    </>
  );
}

function GoogleAdsForm({ creds, setCreds }: any) {
  return (
    <>
      <Field
        label="Customer ID"
        hint="Después de guardar, te redirigimos a Google para autorizar vía OAuth."
        tutorial={{
          title: "¿Cómo encuentro mi Customer ID?",
          steps: [
            "ads.google.com logueado.",
            "Arriba a la derecha, ves un número 123-456-7890.",
            "Pegalo SIN los guiones (solo los 10 dígitos).",
          ],
          docUrl: "https://support.google.com/google-ads/answer/1704344",
        }}
      >
        <Input
          value={creds.customerId}
          onChange={(v) => setCreds({ ...creds, customerId: v.replace(/[^0-9]/g, "") })}
          placeholder="1234567890"
          mono
          maxLength={10}
        />
      </Field>
    </>
  );
}
