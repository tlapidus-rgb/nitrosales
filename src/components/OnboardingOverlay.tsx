// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingOverlay v6 — pantalla entera, 3 columnas
// ══════════════════════════════════════════════════════════════
// Layout nuevo:
//   - Full viewport (100vw x 100vh) — no modal
//   - Columna izquierda: sidebar plataformas con tri-state (pending/use/skip)
//   - Columna centro: tutorial de texto + inputs de credenciales
//   - Columna derecha: tutorial VISUAL con screenshots (placeholder por ahora)
//
// Cambios vs v5:
//   - Full screen en vez de modal centrado
//   - 3 columnas en vez de 2
//   - "VTEX" ahora es "Plataforma Ecommerce" con dropdown aspiracional
//     (VTEX activo, Tiendanube/Shopify/WooCommerce/Magento "en desarrollo")
//   - NitroPixel lee orgId del endpoint state (ahora lo devuelve)
//   - Columna derecha con placeholder para screenshots (Parte 2)
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
  Ban,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import { BrandLogo, type BrandKey } from "./BrandLogo";
import { VisualTutorial } from "./VisualTutorials";
import OnboardingAurumChat from "./OnboardingAurumChat";
import { AurumOrb } from "./aurum/AurumOrb";

const BRAND_ORANGE = "#FF5E1A";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const ACCENT_GREEN = "#22C55E";
const ACCENT_RED = "#EF4444";

// ═══════════════════════════════════════════════════════════════
// Overlay container
// ═══════════════════════════════════════════════════════════════

export default function OnboardingOverlay() {
  const [state, setState] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/me/onboarding/state", { cache: "no-store" });
      if (!res.ok) {
        setState(null);
        return;
      }
      const json = await res.json();
      setState(json);
    } catch {
      setState(null);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    fetchState();
    const t = setInterval(fetchState, 30000);
    return () => clearInterval(t);
  }, []);

  if (!loaded || !state || !state.locked) return null;

  const isWizard = state.phase === "wizard";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0A0A0F",
        overflow: "hidden",
      }}
    >
      {/* Aurora de fondo */}
      <AuroraBackground />

      {/* Contenido */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100vw",
          height: "100vh",
          color: TEXT_PRIMARY,
          overflow: "hidden",
        }}
      >
        {isWizard && <WizardFullscreen orgId={state.orgId} onSubmitted={fetchState} onStepChange={setCurrentStep} />}
        {!isWizard && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "24px 24px 96px" }}>
            <div
              style={{
                width: "100%",
                maxWidth: 680,
                maxHeight: "92vh",
                background: "rgba(20,20,25,0.92)",
                border: `1px solid ${BORDER}`,
                borderRadius: 20,
                boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
                padding: 36,
                overflow: "auto",
                backdropFilter: "blur(40px)",
                WebkitBackdropFilter: "blur(40px)",
              }}
            >
              {state.phase === "validating" && (
                <ValidatingPhase
                  onReopen={async () => {
                    // POST reopen → state pasa a IN_PROGRESS → el proximo fetchState()
                    // va a devolver phase="wizard" y el overlay se transforma solo.
                    const res = await fetch("/api/me/onboarding/reopen-wizard", { method: "POST" });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json?.error || "No se pudo volver al wizard");
                    // Refrescar state inmediatamente para que el overlay cambie a wizard
                    await fetchState();
                  }}
                />
              )}
              {state.phase === "backfilling" && <BackfillingPhase progress={state.backfillProgress} />}
            </div>
          </div>
        )}

        {/* Botón horizontal "Hablá con Aurum" — Fase 0 del roadmap */}
        <AurumChatButton onClick={() => setChatOpen(true)} />
      </div>

      {/* Drawer del chat */}
      <OnboardingAurumChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        currentPhase={state.phase}
        currentStep={currentStep}
      />

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes auroraBlob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20vw, 15vh) scale(1.2); }
          66% { transform: translate(-10vw, 25vh) scale(0.9); }
        }
        @keyframes auroraBlob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-25vw, -20vh) scale(1.3); }
          66% { transform: translate(15vw, -10vh) scale(0.85); }
        }
        @keyframes auroraBlob3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-15vw, 20vh) scale(1.15); }
        }
        @keyframes pixelBreath {
          0%, 100% { transform: scale(1); opacity: 0.9; filter: brightness(1); }
          50% { transform: scale(1.05); opacity: 1; filter: brightness(1.15); }
        }
        @keyframes pixelOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pixelOrbitReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
      `}</style>
    </div>
  );
}

function AuroraBackground() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
      <div style={{
        position: "absolute", top: "20%", left: "15%",
        width: "50vw", height: "50vw", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,94,26,0.30) 0%, transparent 60%)",
        filter: "blur(100px)",
        animation: "auroraBlob1 22s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: "30%", right: "10%",
        width: "55vw", height: "55vw", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 60%)",
        filter: "blur(110px)",
        animation: "auroraBlob2 28s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "10%", left: "30%",
        width: "45vw", height: "45vw", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 60%)",
        filter: "blur(120px)",
        animation: "auroraBlob3 30s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(circle at 50% 50%, transparent 0%, rgba(0,0,0,0.5) 100%)",
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Validating + Backfilling
// ═══════════════════════════════════════════════════════════════

function ValidatingPhase({ onReopen }: { onReopen?: () => Promise<void> }) {
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const handleReopen = async () => {
    if (!onReopen) return;
    const ok = window.confirm(
      "¿Querés volver a editar tus datos?\n\n" +
      "Se va a reabrir el wizard con lo que cargaste hasta ahora. " +
      "Podés cambiar cualquier plataforma, reconectar MercadoLibre o corregir credenciales."
    );
    if (!ok) return;
    setReopening(true);
    setReopenError(null);
    try {
      await onReopen();
    } catch (err: any) {
      setReopenError(err?.message || "No se pudo volver al wizard. Contactá a soporte.");
      setReopening(false);
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ display: "inline-flex", marginBottom: 18 }}>
        <div style={iconCircle(BRAND_ORANGE)}>
          <Clock size={28} color={BRAND_ORANGE} />
        </div>
      </div>
      <Pretitle tone={BRAND_ORANGE}>Validando tus datos</Pretitle>
      <Title>Estamos revisando tu configuración</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 24px", maxWidth: 480, marginInline: "auto" }}>
        Nuestro equipo está validando las credenciales que cargaste. Te avisamos por email apenas
        aprobemos el backfill de tu data histórica.
      </p>

      {/* Opcion de volver atras al wizard — disponible mientras el admin
          todavia no aprueba el backfill. Se deshabilita una vez que arranca. */}
      {onReopen && (
        <div style={{
          padding: "14px 16px",
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          maxWidth: 480,
          marginInline: "auto",
          textAlign: "left",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 4 }}>
            ¿Te faltó cargar algo?
          </div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.5, marginBottom: 10 }}>
            Podés volver al wizard y editar tus datos mientras no hayamos aprobado el backfill.
            Lo que ya cargaste se mantiene.
          </div>
          <button
            type="button"
            onClick={handleReopen}
            disabled={reopening}
            style={{
              padding: "8px 14px",
              background: reopening ? "rgba(255,255,255,0.04)" : "transparent",
              color: reopening ? TEXT_MUTED : BRAND_ORANGE,
              border: `1px solid ${reopening ? BORDER : "rgba(255,94,26,0.35)"}`,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: reopening ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 160ms",
            }}
          >
            {reopening ? "Reabriendo…" : "← Volver a editar mis datos"}
          </button>
          {reopenError && (
            <div style={{ marginTop: 10, fontSize: 11, color: ACCENT_RED, lineHeight: 1.5 }}>
              {reopenError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BackfillingPhase({ progress }: { progress: any }) {
  const overallPct = progress?.overallPct || 0;
  const jobs = progress?.jobs || [];
  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ display: "inline-flex", marginBottom: 18 }}>
          <div style={iconCircle(BRAND_ORANGE)}>
            <Loader2 size={28} color={BRAND_ORANGE} style={{ animation: "spin 2s linear infinite" }} />
          </div>
        </div>
        <Pretitle tone={BRAND_ORANGE}>Procesando data histórica · {overallPct}%</Pretitle>
        <Title>Estamos trayendo tu historia</Title>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ width: `${overallPct}%`, height: "100%", background: `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`, transition: "width 600ms ease" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {jobs.map((j: any) => (
          <div key={j.platform} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRIMARY, flex: 1 }}>{j.platform}</div>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, fontWeight: 600 }}>{j.progressPct}%</div>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${j.progressPct}%`, height: "100%", background: BRAND_ORANGE, transition: "width 600ms ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Wizard Fullscreen — 3 columnas
// ═══════════════════════════════════════════════════════════════

type Decision = "pending" | "use" | "skip";

interface Platform {
  key: BrandKey;
  name: string;
  subtitle: string;
  requiredFields: string[];
  hasHistory: boolean;
  missFeatures: string[];
  essential?: boolean;
  isEcommerce?: boolean;
  logoKey?: BrandKey; // Si se define, usa este logo en vez del key (ej: ECOMMERCE mosaico)
}

const ALL_PLATFORMS: Platform[] = [
  {
    key: "VTEX", name: "Plataforma Ecommerce",
    subtitle: "VTEX · Tiendanube · Shopify · …",
    requiredFields: ["provider", "accountName", "appKey", "appToken"],
    hasHistory: true,
    isEcommerce: true,
    logoKey: "ECOMMERCE" as BrandKey, // Mosaico generico en vez del logo VTEX
    missFeatures: [
      "Sincronización de pedidos en tiempo real",
      "Análisis de ventas, AOV, conversión",
      "Gestión de stock y productos",
      "Atribución a campañas de marketing",
    ],
  },
  {
    key: "MERCADOLIBRE", name: "MercadoLibre",
    subtitle: "Marketplace — OAuth directo",
    requiredFields: ["mlUserId"],
    hasHistory: true,
    missFeatures: [
      "Ventas de marketplace integradas",
      "Gestión de preguntas y claims",
      "Análisis de reputación y comisiones",
      "Atribución multi-canal",
    ],
  },
  {
    // BP-S58-003: META_ADS unifica Ads + Pixel CAPI. Antes habia 2 entries
    // separadas (META_ADS + META_PIXEL) pero generaban friccion (1 cliente
    // podia hacer una y olvidar la otra) y el enum Platform de Prisma no
    // tiene "META_PIXEL" anyway. Ahora todo en una sola seccion: el cliente
    // pone Ad Account + Token (obligatorios) y opcionalmente Business ID +
    // Pixel ID + Pixel Access Token.
    key: "META_ADS", name: "Meta (Ads + Pixel)",
    subtitle: "Facebook + Instagram Ads · Conversions API",
    requiredFields: ["adAccountId", "accessToken"],
    hasHistory: true,
    missFeatures: [
      "ROAS y CPA de Meta Ads",
      "Análisis de creatividades + fatigue",
      "Conversiones server-side (post-iOS14)",
      "Atribución multi-touch con NitroPixel",
    ],
  },
  {
    key: "GOOGLE_ADS", name: "Google Ads",
    subtitle: "Search, Shopping, PMax — OAuth después",
    requiredFields: ["customerId"],
    hasHistory: true,
    missFeatures: [
      "ROAS y CPA de Google Ads",
      "Análisis Search + Shopping + PMax",
      "Detección de keywords perdidas",
    ],
  },
  {
    key: "GSC", name: "Search Console",
    subtitle: "SEO — OAuth después",
    requiredFields: ["propertyUrl"],
    hasHistory: false,
    missFeatures: [
      "Tráfico orgánico desde Google",
      "Keywords ranking y CTR",
      "Detección de problemas de indexación",
    ],
  },
  {
    key: "NITROPIXEL", name: "NitroPixel",
    subtitle: "Tracking first-party — recomendado",
    requiredFields: ["confirmedInstalled"],
    hasHistory: false,
    // essential queda en false: el cliente puede skipear si no quiere/no
    // puede instalar el snippet ahora. El modal de skip le advierte que
    // pierde Analytics propias + atribucion multi-touch (ver missFeatures).
    missFeatures: [
      "Analytics propias de NitroSales (sin GA4)",
      "Atribución multi-touch real",
      "NitroScore de calidad de tracking",
      "Conversiones server-side a Meta y Google",
    ],
  },
];

// Proveedores ecommerce soportados (con logo oficial de cada uno)
const ECOMMERCE_PROVIDERS: Array<{ key: string; name: string; active: boolean; brand: BrandKey; accentColor: string }> = [
  { key: "vtex", name: "VTEX", active: true, brand: "VTEX", accentColor: "#FF3366" },
  { key: "tiendanube", name: "Tiendanube", active: false, brand: "TIENDANUBE", accentColor: "#0099E0" },
  { key: "shopify", name: "Shopify", active: false, brand: "SHOPIFY", accentColor: "#95BF47" },
  { key: "woocommerce", name: "WooCommerce", active: false, brand: "WOOCOMMERCE", accentColor: "#7F54B3" },
  { key: "magento", name: "Magento", active: false, brand: "MAGENTO", accentColor: "#EE672F" },
];

function calcCompletion(platformKey: BrandKey, creds: any): number {
  const p = ALL_PLATFORMS.find((pl) => pl.key === platformKey);
  if (!p) return 0;
  // MERCADOLIBRE usa OAuth: si tiene tokens/mlUserId o _connected=true, 100%.
  // No importa si no están los requiredFields viejos (username, etc) porque
  // ya no se piden — se obtienen vía OAuth.
  if (platformKey === "MERCADOLIBRE") {
    if (creds?._connected || creds?.mlUserId || creds?.accessToken) return 100;
    return 0;
  }
  let fields = p.requiredFields;
  // Para ecommerce: si no seleccionó provider o no es "vtex", solo cuenta "provider"
  if (p.isEcommerce && creds?.provider !== "vtex") {
    fields = ["provider"];
  }
  const total = fields.length;
  const filled = fields.filter((f) => {
    const v = creds?.[f];
    return typeof v === "boolean" ? v === true : !!(v || "").toString().trim();
  }).length;
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

function WizardFullscreen({ orgId, onSubmitted, onStepChange }: { orgId: string | null; onSubmitted: () => void; onStepChange?: (step: string | null) => void }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [creds, setCreds] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number>>({
    VTEX: 12, MERCADOLIBRE: 12, META_ADS: 6, GOOGLE_ADS: 6,
  });
  // Info general del negocio — necesaria para reportes, Meta CAPI country code,
  // correcta atribucion timezone-aware y moneda en P&L. Defaults a Argentina.
  const [orgInfo, setOrgInfo] = useState<{ country: string; timezone: string; defaultCurrency: string }>({
    country: "AR",
    timezone: "America/Argentina/Buenos_Aires",
    defaultCurrency: "ARS",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipModalFor, setSkipModalFor] = useState<BrandKey | null>(null);
  const [focusedPlatform, setFocusedPlatform] = useState<BrandKey | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar state al montar — 2 fuentes, ordenadas por prioridad:
  //  1. sessionStorage: data fresca de la sesion actual (incluyendo lo que el
  //     user tipeo y no envio al backend). Se reinicia al cerrar tab pero
  //     sobrevive al redirect OAuth de MercadoLibre.
  //  2. /api/me/onboarding/saved-state: credenciales ya guardadas en DB
  //     + orgInfo + history. Fallback si el cliente volvio dias despues o
  //     uso "Volver a editar" desde ValidatingPhase.
  // Preferir cache si tiene decisions reales; sino DB.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      let fromCache: any = null;
      try {
        const cached = sessionStorage.getItem("nitro_wizard_state");
        if (cached) fromCache = JSON.parse(cached);
      } catch {}

      let fromDb: any = null;
      try {
        const res = await fetch("/api/me/onboarding/saved-state");
        if (res.ok) fromDb = await res.json();
      } catch {}

      const cacheHasData = fromCache && fromCache.decisions && Object.keys(fromCache.decisions).length > 0;
      const source = cacheHasData ? fromCache : fromDb;

      if (source) {
        // Filtrar plataformas que ya no existen en ALL_PLATFORMS (ej: META_PIXEL
        // post-S58-003). Sino, el sessionStorage de un cliente viejo puede
        // intentar enfocar una plataforma inexistente y crashear el render.
        const validKeys = new Set(ALL_PLATFORMS.map((p) => p.key));
        if (source.decisions && typeof source.decisions === "object") {
          const filtered: Record<string, Decision> = {};
          for (const [k, v] of Object.entries(source.decisions)) {
            if (validKeys.has(k as BrandKey)) filtered[k] = v as Decision;
          }
          setDecisions(filtered);
        }
        if (source.creds && typeof source.creds === "object") setCreds(source.creds);
        if (source.history && typeof source.history === "object") setHistory((h) => ({ ...h, ...source.history }));
        if (source.orgInfo && typeof source.orgInfo === "object") setOrgInfo((o) => ({ ...o, ...source.orgInfo }));
        if (typeof source.focusedPlatform === "string" && validKeys.has(source.focusedPlatform as BrandKey)) {
          setFocusedPlatform(source.focusedPlatform as BrandKey);
        }
      }
      setHydrated(true);
    })();
  }, []);

  // Auto-save del state a sessionStorage cada vez que cambia.
  // Solo despues de hidratar, para no sobrescribir con state vacio
  // en el primer render post-mount.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        "nitro_wizard_state",
        JSON.stringify({ decisions, creds, history, orgInfo, focusedPlatform }),
      );
    } catch {}
  }, [decisions, creds, history, orgInfo, focusedPlatform, hydrated]);

  // Comunicar el paso actual al overlay (para que Aurum tenga contexto)
  useEffect(() => {
    if (onStepChange) onStepChange(focusedPlatform);
  }, [focusedPlatform, onStepChange]);

  const setDecision = (k: string, d: Decision) => {
    setDecisions((s) => ({ ...s, [k]: d }));
    setError(null);
    if (d === "use" && !creds[k]) setCreds((c) => ({ ...c, [k]: {} }));
    if (d === "use") setFocusedPlatform(k as BrandKey);
  };

  const updateCred = (p: string, field: string, value: string | boolean) => {
    setCreds((c) => ({ ...c, [p]: { ...(c[p] || {}), [field]: value } }));
  };

  const usePlatforms = ALL_PLATFORMS.filter((p) => decisions[p.key] === "use");

  // La plataforma que se muestra en centro + derecha
  const displayed = focusedPlatform || (usePlatforms[0]?.key ?? null);

  const globalCompletion = useMemo(() => {
    const total = ALL_PLATFORMS.length;
    let decided = 0;
    for (const p of ALL_PLATFORMS) {
      const d = decisions[p.key] || "pending";
      if (d === "skip") decided += 1;
      else if (d === "use" && calcCompletion(p.key, creds[p.key]) === 100) decided += 1;
    }
    return Math.round((decided / total) * 100);
  }, [decisions, creds]);

  const submit = async () => {
    for (const p of ALL_PLATFORMS) {
      const d = decisions[p.key] || "pending";
      if (d === "pending") {
        setError(`Falta decidir sobre "${p.name}"`);
        return;
      }
      if (d === "use") {
        const completion = calcCompletion(p.key, creds[p.key]);
        if (completion < 100) {
          setError(`Completá todos los campos de "${p.name}"`);
          setFocusedPlatform(p.key);
          return;
        }
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const platformsArr = usePlatforms
        .filter((p) => p.key !== "NITROPIXEL")
        .map((p) => ({
          platform: p.key,
          credentials: creds[p.key] || {},
        }));
      const res = await fetch("/api/me/onboarding/submit-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: platformsArr,
          historyMonths: history,
          orgInfo,
          skipped: ALL_PLATFORMS.filter((p) => decisions[p.key] === "skip").map((p) => p.key),
          pixelInstalled: !!creds.NITROPIXEL?.confirmedInstalled,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        setSubmitting(false);
        return;
      }
      // Limpiar el state persistido: el wizard se envio OK y ya no hace falta.
      try { sessionStorage.removeItem("nitro_wizard_state"); } catch {}
      onSubmitted();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      {/* ─── COLUMNA IZQUIERDA: plataformas ─── */}
      <aside
        style={{
          width: 340,
          flexShrink: 0,
          background: "rgba(8,8,12,0.7)",
          borderRight: `1px solid ${BORDER}`,
          overflowY: "auto",
          padding: "28px 20px 110px",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(255,94,26,0.1)", border: "1px solid rgba(255,94,26,0.25)", borderRadius: 99, marginBottom: 14 }}>
          <Sparkles size={10} color={BRAND_ORANGE} />
          <span style={{ fontSize: 10, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.1em" }}>Onboarding</span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 6px", letterSpacing: "-0.01em" }}>
          Tu stack
        </h2>
        <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: "0 0 18px", lineHeight: 1.5 }}>
          Decidí cada plataforma: "la uso" o "no la uso".
        </p>

        {/* Progress global */}
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px dashed ${BORDER}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Completitud general
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                width: `${globalCompletion}%`, height: "100%",
                background: globalCompletion === 100 ? ACCENT_GREEN : `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`,
                transition: "width 300ms ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: globalCompletion === 100 ? ACCENT_GREEN : TEXT_SECONDARY, fontWeight: 700, minWidth: 30, textAlign: "right" }}>
              {globalCompletion}%
            </div>
          </div>
        </div>

        {/* Datos del negocio */}
        <BusinessInfoCard orgInfo={orgInfo} setOrgInfo={setOrgInfo} />

        {/* Lista de plataformas */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {ALL_PLATFORMS.map((p) => {
            const d = decisions[p.key] || "pending";
            const isUse = d === "use";
            const isSkip = d === "skip";
            const isFocused = displayed === p.key && isUse;
            const completion = isUse ? calcCompletion(p.key, creds[p.key]) : (isSkip ? 100 : 0);

            return (
              <div
                key={p.key}
                onClick={() => {
                  if (d === "pending") setDecision(p.key, "use");
                  else if (isUse) setFocusedPlatform(p.key);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 11px",
                  background: isFocused ? "rgba(255,94,26,0.10)" : isUse ? "rgba(255,94,26,0.04)" : isSkip ? "rgba(255,255,255,0.02)" : "transparent",
                  border: `1px solid ${isFocused ? "rgba(255,94,26,0.4)" : isUse ? "rgba(255,94,26,0.15)" : "transparent"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "all 160ms",
                  opacity: isSkip ? 0.55 : 1,
                }}
              >
                {/* Checkbox */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (d === "pending") setDecision(p.key, "use");
                    else if (isUse) setDecision(p.key, "pending");
                  }}
                  style={{
                    width: 18, height: 18, borderRadius: 5,
                    border: `2px solid ${isUse ? BRAND_ORANGE : "#3F3F46"}`,
                    background: isUse ? BRAND_ORANGE : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {isUse && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isSkip && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="3">
                      <line x1="5" y1="5" x2="19" y2="19" />
                      <line x1="19" y1="5" x2="5" y2="19" />
                    </svg>
                  )}
                </div>
                {/* Logo */}
                <div style={{ flexShrink: 0, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", filter: isSkip ? "grayscale(100%)" : "none" }}>
                  <BrandLogo brand={p.logoKey || p.key} size={24} />
                </div>
                {/* Nombre + progress */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: isUse ? "#fff" : isSkip ? TEXT_MUTED : TEXT_PRIMARY,
                    marginBottom: isUse ? 4 : 0,
                    textDecoration: isSkip ? "line-through" : "none",
                  }}>
                    {p.name}
                  </div>
                  {isUse && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{
                          width: `${completion}%`, height: "100%",
                          background: completion === 100 ? ACCENT_GREEN : BRAND_ORANGE,
                          transition: "width 300ms ease",
                        }} />
                      </div>
                      <div style={{ fontSize: 9, color: completion === 100 ? ACCENT_GREEN : TEXT_MUTED, fontWeight: 700, minWidth: 22, textAlign: "right" }}>
                        {completion === 100 ? "✓" : `${completion}%`}
                      </div>
                    </div>
                  )}
                  {isSkip && <div style={{ fontSize: 9, color: TEXT_MUTED, fontWeight: 500 }}>No la uso</div>}
                  {d !== "skip" && !p.essential && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSkipModalFor(p.key);
                      }}
                      style={{
                        fontSize: 9, color: TEXT_MUTED,
                        background: "transparent", border: "none", padding: 0,
                        cursor: "pointer", textDecoration: "underline",
                        marginTop: 2,
                      }}
                    >
                      No la uso
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Send button al final del sidebar */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px dashed ${BORDER}` }}>
          {error && (
            <div style={{
              marginBottom: 10, padding: "8px 10px",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6, color: "#F87171", fontSize: 11,
            }}>
              {error}
            </div>
          )}
          <button
            onClick={submit}
            disabled={submitting || globalCompletion < 100}
            style={{
              width: "100%", padding: "11px 16px",
              background: submitting || globalCompletion < 100 ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
              color: "#fff", border: "none", borderRadius: 9,
              fontSize: 13, fontWeight: 600,
              cursor: submitting ? "wait" : globalCompletion < 100 ? "not-allowed" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              opacity: globalCompletion < 100 ? 0.5 : 1,
            }}
          >
            {submitting ? (
              <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Enviando…</>
            ) : (
              <>Enviar para validación <ArrowRight size={13} /></>
            )}
          </button>
          {globalCompletion < 100 && (
            <div style={{ fontSize: 10, color: TEXT_MUTED, textAlign: "center", marginTop: 6 }}>
              {100 - globalCompletion}% faltante
            </div>
          )}
        </div>
      </aside>

      {/* ─── COLUMNA CENTRAL: tutorial texto + inputs ─── */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "36px 40px 120px",
          background: "rgba(10,10,15,0.55)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          maxWidth: "calc(100vw - 340px - 480px)",
        }}
      >
        {!displayed ? (
          <EmptyCenter />
        ) : (
          <PlatformCenterPanel
            platformKey={displayed}
            creds={creds[displayed] || {}}
            onChange={(field, value) => updateCred(displayed, field, value)}
            orgId={orgId}
            history={history[displayed]}
            onHistoryChange={(v) => setHistory((h) => ({ ...h, [displayed]: v }))}
          />
        )}
      </main>

      {/* ─── COLUMNA DERECHA: tutorial visual ─── */}
      <aside
        style={{
          width: 480,
          flexShrink: 0,
          background: "rgba(8,8,12,0.5)",
          borderLeft: `1px solid ${BORDER}`,
          overflowY: "auto",
          padding: "36px 28px 110px",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {displayed ? (
          <VisualTutorialPanel platformKey={displayed} />
        ) : (
          <EmptyRightPanel />
        )}
      </aside>

      {skipModalFor && (
        <SkipModal
          platform={ALL_PLATFORMS.find((p) => p.key === skipModalFor)!}
          onCancel={() => setSkipModalFor(null)}
          onConfirm={() => {
            setDecision(skipModalFor, "skip");
            setSkipModalFor(null);
            if (focusedPlatform === skipModalFor) setFocusedPlatform(null);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Center panel (inputs + tutorial texto)
// ═══════════════════════════════════════════════════════════════

function EmptyCenter() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", textAlign: "center", padding: "40px 20px" }}>
      <div style={iconCircle(BRAND_ORANGE)}>
        <Sparkles size={28} color={BRAND_ORANGE} />
      </div>
      <div style={{ height: 18 }} />
      <Pretitle tone={BRAND_ORANGE}>Bienvenido</Pretitle>
      <Title>Empezá decidiendo tu stack</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 auto", maxWidth: 460 }}>
        A la izquierda decidís cada plataforma. Acá en el centro vas a ver los campos a completar,
        y a la derecha el tutorial visual con capturas de las plataformas reales.
      </p>
    </div>
  );
}

function PlatformCenterPanel({ platformKey, creds, onChange, orgId, history, onHistoryChange }: any) {
  // Defensive: si llega un platformKey que ya no existe en ALL_PLATFORMS
  // (ej: META_PIXEL post-S58-003 desde sessionStorage viejo), no crashear.
  const p = ALL_PLATFORMS.find((pl) => pl.key === platformKey);
  if (!p) return <EmptyCenter />;
  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <BrandLogo brand={p.logoKey || platformKey} size={40} />
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#fff" }}>
            {p.name}
          </h2>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 3 }}>{p.subtitle}</div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        {platformKey === "VTEX" && <EcommerceInputs creds={creds} onChange={onChange} />}
        {platformKey === "MERCADOLIBRE" && <MlInputs creds={creds} onChange={onChange} />}
        {platformKey === "META_ADS" && <MetaAdsInputs creds={creds} onChange={onChange} />}
        {platformKey === "GOOGLE_ADS" && <GoogleAdsInputs creds={creds} onChange={onChange} />}
        {platformKey === "GSC" && <GscInputs creds={creds} onChange={onChange} />}
        {platformKey === "NITROPIXEL" && <NitroPixelInputs creds={creds} onChange={onChange} orgId={orgId} />}
      </div>


      {/* Rango histórico inline si aplica */}
      {p.hasHistory && (
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px dashed ${BORDER}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Rango histórico
          </div>
          <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: "0 0 10px", lineHeight: 1.6 }}>
            Cuánta historia querés traer de esta plataforma. Más tiempo = más data pero activación más lenta.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {[
              { months: 3, label: "3 meses", eta: "min" },
              { months: 6, label: "6 meses", eta: "~30 min" },
              { months: 12, label: "1 año", eta: "1-2 hs" },
              { months: 24, label: "2 años", eta: "3-6 hs" },
              { months: -1, label: "Todo", eta: "~1 día" },
            ].map((opt) => {
              const isActive = history === opt.months;
              return (
                <button key={opt.months} onClick={() => onHistoryChange(opt.months)} style={{
                  padding: "8px 4px",
                  background: isActive ? "rgba(255,94,26,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isActive ? BRAND_ORANGE : BORDER}`,
                  borderRadius: 7,
                  color: isActive ? "#fff" : TEXT_SECONDARY,
                  cursor: "pointer", textAlign: "center", fontSize: 11,
                }}>
                  <div style={{ fontWeight: isActive ? 700 : 500 }}>{opt.label}</div>
                  <div style={{ fontSize: 9, color: isActive ? BRAND_ORANGE : TEXT_MUTED, marginTop: 2 }}>{opt.eta}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Inputs per platform
// ═══════════════════════════════════════════════════════════════

function EcommerceInputs({ creds, onChange }: any) {
  const provider = creds.provider || "";
  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY, display: "block", marginBottom: 4 }}>
          ¿Qué plataforma ecommerce usás?
        </label>
        <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: 0, lineHeight: 1.5 }}>
          Seleccioná la plataforma donde operás tu tienda online. Las que están "en desarrollo"
          podés marcarlas para que te prioricemos cuando las integremos.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
        {ECOMMERCE_PROVIDERS.map((pv) => {
          const selected = provider === pv.key;
          return (
            <button
              key={pv.key}
              onClick={() => onChange("provider", pv.key)}
              style={{
                position: "relative",
                padding: "16px 12px 14px",
                background: selected
                  ? `linear-gradient(135deg, ${pv.accentColor}20, ${pv.accentColor}08)`
                  : "rgba(255,255,255,0.03)",
                border: `2px solid ${selected ? pv.accentColor : BORDER}`,
                borderRadius: 12,
                color: TEXT_PRIMARY,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                transition: "all 160ms",
                boxShadow: selected ? `0 6px 20px ${pv.accentColor}25` : "0 1px 2px rgba(0,0,0,0.2)",
              }}
              onMouseEnter={(e) => {
                if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = `${pv.accentColor}80`;
              }}
              onMouseLeave={(e) => {
                if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
              }}
            >
              {/* Check icon cuando seleccionado */}
              {selected && (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: pv.accentColor,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={11} />
                </div>
              )}

              <BrandLogo brand={pv.brand} size={40} />

              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: selected ? "#fff" : TEXT_PRIMARY, lineHeight: 1.2 }}>
                  {pv.name}
                </div>
                {!pv.active && (
                  <div style={{
                    marginTop: 4,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 9,
                    fontWeight: 600,
                    color: selected ? pv.accentColor : TEXT_MUTED,
                    padding: "2px 7px",
                    background: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    borderRadius: 99,
                  }}>
                    <Lock size={8} /> En desarrollo
                  </div>
                )}
                {pv.active && (
                  <div style={{
                    marginTop: 4,
                    fontSize: 9,
                    fontWeight: 600,
                    color: selected ? pv.accentColor : "#22C55E",
                    padding: "2px 7px",
                    background: selected ? "rgba(255,255,255,0.08)" : "rgba(34,197,94,0.08)",
                    borderRadius: 99,
                    display: "inline-block",
                  }}>
                    Disponible
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {provider === "vtex" && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, paddingTop: 16, borderTop: `1px dashed ${BORDER}` }}>
            Credenciales de VTEX
          </div>
          <Field label="Account Name" hint="Es el subdomain de tu tienda VTEX.">
            <Input value={creds.accountName || ""} onChange={(v) => onChange("accountName", v)} placeholder="miempresa" maxLength={60} />
          </Field>
          <Field label="App Key" hint="Empieza con 'vtexappkey-'. Formato típico: 'vtexappkey-empresa-XXXXXX' (~30-40 caracteres).">
            <Input value={creds.appKey || ""} onChange={(v) => onChange("appKey", v)} placeholder="vtexappkey-xxxxx-XXXXXX" mono />
            {creds.appKey && creds.appKey.length > 0 && creds.appKey.length < 20 && (
              <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 7, fontSize: 11, color: "#FBBF24", lineHeight: 1.5 }}>
                ⚠ Esta App Key parece corta ({creds.appKey.length} caracteres). Verificá que la copiaste completa — debería tener 30+ caracteres.
              </div>
            )}
          </Field>
          <Field label="App Token" hint="Token largo de 60+ caracteres. CUIDADO: copialo COMPLETO sin cortar — si te quedás con menos, no va a funcionar.">
            <Input value={creds.appToken || ""} onChange={(v) => onChange("appToken", v)} placeholder="2Zk8X4...Q3aZ (60+ caracteres)" mono />
            {creds.appToken && creds.appToken.length > 0 && creds.appToken.length < 40 && (
              <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 7, fontSize: 11, color: "#FCA5A5", lineHeight: 1.5 }}>
                ⚠ <strong>App Token incompleto</strong> ({creds.appToken.length} caracteres). El App Token de VTEX debería tener <strong>60+ caracteres</strong>.
                <br />
                Volvé a tu admin VTEX, copialo COMPLETO (sin que se corte) y pegalo de nuevo. Si no, NitroSales no va a poder leer tus ventas.
              </div>
            )}
          </Field>
          <Field label="Sales Channel ID (opcional)" hint="Si operás multi-canal (ej: retail, wholesale, marketplace), poné el ID principal. Si no sabés, dejalo vacío.">
            <Input value={creds.salesChannelId || ""} onChange={(v) => onChange("salesChannelId", v.replace(/[^0-9]/g, ""))} placeholder="1" maxLength={6} />
          </Field>
          <Field label="URL de tu tienda (opcional)" hint="Ej: https://www.tutienda.com.ar. Sirve para cruzar visitas del pixel con las ventas.">
            <Input value={creds.storeUrl || ""} onChange={(v) => onChange("storeUrl", v)} placeholder="https://www.tutienda.com.ar" maxLength={200} />
          </Field>
        </div>
      )}

      {provider && provider !== "vtex" && (
        <div style={{ marginTop: 4, padding: "16px 18px", background: "rgba(255,94,26,0.08)", border: "1px solid rgba(255,94,26,0.25)", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <BrandLogo brand={ECOMMERCE_PROVIDERS.find((pv) => pv.key === provider)!.brand} size={28} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                {ECOMMERCE_PROVIDERS.find((pv) => pv.key === provider)?.name}
              </div>
              <div style={{ fontSize: 10, color: BRAND_ORANGE, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Integración en desarrollo
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            Marcaste interés en <strong style={{ color: "#fff" }}>{ECOMMERCE_PROVIDERS.find((pv) => pv.key === provider)?.name}</strong>.
            Te vamos a priorizar y avisamos por email apenas esté lista la integración.
            Mientras tanto podés dejar esta plataforma marcada y completar las otras.
          </div>
        </div>
      )}
    </>
  );
}

function MlInputs({ creds, onChange }: any) {
  // El status real de la conexión viene de DB (tokens guardados después del OAuth).
  // Consultamos /api/me/connections/ml al montar y cada vez que ?ml_connected=true.
  const [serverStatus, setServerStatus] = useState<{ connected: boolean; mlUserId?: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/me/connections/ml", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.ok) {
          setServerStatus({ connected: !!json.connected, mlUserId: json.mlUserId });
          // Sincronizar con el state del wizard para que "calcCompletion" lo detecte
          if (json.connected && onChange) {
            onChange("mlUserId", String(json.mlUserId));
            onChange("_connected", true);
          }
        }
      } catch {}
    };
    load();
    // Si acabamos de volver del OAuth, refrescamos
    if (typeof window !== "undefined" && window.location.search.includes("ml_connected=true")) {
      setTimeout(load, 500);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnected = serverStatus?.connected || !!(creds?.accessToken && creds?.mlUserId);
  const mlUserId = serverStatus?.mlUserId || creds?.mlUserId;

  const handleConnect = () => {
    const returnTo = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    window.location.href = `/api/auth/mercadolibre/connect?returnTo=${encodeURIComponent(returnTo)}`;
  };

  if (isConnected) {
    return (
      <>
        <div
          style={{
            padding: "14px 16px",
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 10,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
            ✓
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#4ADE80" }}>
              MercadoLibre conectado
            </div>
            <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>
              ID de vendedor: {mlUserId}
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            style={{
              padding: "7px 13px",
              background: "transparent",
              color: TEXT_SECONDARY,
              border: `1px solid ${BORDER}`,
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reconectar
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={handleConnect}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 24px rgba(255,230,0,0.35), 0 0 0 1px rgba(255,230,0,0.4) inset";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(255,230,0,0.25), 0 0 0 1px rgba(0,0,0,0.04) inset";
          }}
          style={{
            width: "100%",
            padding: "14px 22px",
            background: "linear-gradient(135deg, #FFF159 0%, #FFE600 55%, #FFD100 100%)",
            color: "#1A1A1A",
            border: 0,
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            letterSpacing: "-0.01em",
            boxShadow: "0 4px 16px rgba(255,230,0,0.25), 0 0 0 1px rgba(0,0,0,0.04) inset",
            transition: "all 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Logo oficial de MercadoLibre (public/logos/mercadolibre.png) */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "rgba(255,255,255,0.5)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              flexShrink: 0,
            }}
          >
            <img
              src="/logos/mercadolibre.png"
              alt=""
              width={22}
              height={22}
              style={{ objectFit: "contain", display: "block" }}
            />
          </span>
          <span>Ingresar con MercadoLibre</span>
          <ArrowRight size={15} strokeWidth={2.5} style={{ opacity: 0.75, marginLeft: 2 }} />
        </button>
      </div>
      <InfoBox>
        Vas a entrar al login oficial de MercadoLibre para autorizar a <strong style={{ color: TEXT_PRIMARY }}>NitroSales</strong> a leer tus órdenes, productos y métricas. <strong style={{ color: TEXT_PRIMARY }}>Solo lectura</strong>, nunca modificamos nada en tu cuenta ML.
      </InfoBox>
    </>
  );
}

function MetaAdsInputs({ creds, onChange }: any) {
  return (
    <>
      {/* ─── Ads (obligatorio) ─── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        Meta Ads · obligatorio
      </div>
      <Field label="Ad Account ID" hint="Solo los números, sin 'act_'.">
        <Input value={creds.adAccountId || ""} onChange={(v) => onChange("adAccountId", v.replace(/[^0-9]/g, ""))} placeholder="123456789" mono maxLength={30} />
      </Field>
      <Field label="Access Token (System User)" hint="Empieza con 'EAA…'. Es el token con permisos ads_read + ads_management + business_management.">
        <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
      </Field>
      <Field label="Business ID (opcional)" hint="ID de tu Business Manager. Sirve para audiencias custom y conversiones avanzadas. Si no sabés, dejalo vacío.">
        <Input value={creds.businessId || ""} onChange={(v) => onChange("businessId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890123456" mono maxLength={20} />
      </Field>

      {/* ─── Pixel (opcional, mismo bloque) ─── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px dashed ${BORDER}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_PRIMARY, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Meta Pixel + Conversions API · opcional
        </div>
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.55, marginBottom: 14 }}>
          Sirve para mandar conversiones server-side a Meta y mejorar la atribución post-iOS14.
          Si no usás Meta Pixel, dejá los 2 campos vacíos.
        </div>
        <Field label="Pixel ID" hint="15-16 dígitos. Lo encontrás en business.facebook.com/events_manager.">
          <Input value={creds.pixelId || ""} onChange={(v) => onChange("pixelId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890123456" mono maxLength={20} />
        </Field>
        <Field label="Access Token CAPI" hint="Si dejás vacío, NitroSales usa el mismo token de Meta Ads de arriba (válido si tiene los 3 permisos correctos y está asignado al pixel).">
          <Input value={creds.pixelAccessToken || ""} onChange={(v) => onChange("pixelAccessToken", v)} placeholder="EAA... (opcional, dejá vacío para reusar el de arriba)" mono />
        </Field>
      </div>
    </>
  );
}

function GoogleAdsInputs({ creds, onChange }: any) {
  return (
    <>
      <Field label="Customer ID" hint="10 dígitos sin guiones.">
        <Input value={creds.customerId || ""} onChange={(v) => onChange("customerId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890" mono maxLength={10} />
      </Field>
      <Field label="Login Customer ID (opcional)" hint="Si tu cuenta está administrada por un MCC (manager), poné el ID del MCC. Si la cuenta es solo tuya, dejalo vacío.">
        <Input value={creds.loginCustomerId || ""} onChange={(v) => onChange("loginCustomerId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890" mono maxLength={10} />
      </Field>
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google para autorizar.
      </InfoBox>
    </>
  );
}

function GscInputs({ creds, onChange }: any) {
  return (
    <>
      <Field label="URL de tu propiedad" hint="La URL exacta como aparece en Search Console.">
        <Input value={creds.propertyUrl || ""} onChange={(v) => onChange("propertyUrl", v)} placeholder="https://www.tutienda.com/" mono />
      </Field>
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google.
      </InfoBox>
    </>
  );
}

function NitroPixelInputs({ creds, onChange, orgId }: any) {
  const [copied, setCopied] = useState(false);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://app.nitrosales.ai";
  const snippet = orgId
    ? `<!-- NitroPixel -->\n<script src="${appUrl}/api/pixel/script?org=${orgId}" async></script>`
    : `<!-- Cargando ID de tu organización... -->`;

  const copy = () => {
    if (!orgId) return;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div style={{
        padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(139,92,246,0.06))",
        border: "1px solid rgba(6,182,212,0.25)",
        borderRadius: 10,
        marginBottom: 18,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a5f3fc", marginBottom: 4 }}>
          Por qué es importante
        </div>
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
          NitroPixel es nuestra fuente de verdad para analytics. Captura sesiones, visitas,
          conversiones y atribución multi-touch sin depender de GA4.
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 6 }}>
          Tu snippet personalizado
        </div>
        <div style={{
          position: "relative",
          background: "rgba(0,0,0,0.45)",
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: "12px 14px",
          fontFamily: "'SF Mono', Menlo, Consolas, monospace",
          fontSize: 11,
          color: "#a5f3fc",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}>
          {snippet}
          {orgId && (
            <button
              onClick={copy}
              style={{
                position: "absolute", top: 10, right: 10,
                padding: "5px 10px",
                background: copied ? `${ACCENT_GREEN}20` : "rgba(255,255,255,0.08)",
                border: `1px solid ${copied ? ACCENT_GREEN : BORDER}`,
                borderRadius: 6,
                color: copied ? ACCENT_GREEN : TEXT_SECONDARY,
                fontSize: 10, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              {copied ? <><Check size={10} /> Copiado</> : <><Copy size={10} /> Copiar</>}
            </button>
          )}
        </div>
      </div>

      <label style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 14px",
        background: creds.confirmedInstalled ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${creds.confirmedInstalled ? "rgba(34,197,94,0.3)" : BORDER}`,
        borderRadius: 10, cursor: "pointer",
      }}>
        <div
          style={{
            width: 18, height: 18, borderRadius: 5,
            border: `2px solid ${creds.confirmedInstalled ? ACCENT_GREEN : "#3F3F46"}`,
            background: creds.confirmedInstalled ? ACCENT_GREEN : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
          }}
          onClick={() => onChange("confirmedInstalled", !creds.confirmedInstalled)}
        >
          {creds.confirmedInstalled && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <input type="checkbox" checked={!!creds.confirmedInstalled}
          onChange={(e) => onChange("confirmedInstalled", e.target.checked)}
          style={{ display: "none" }} />
        <div style={{ flex: 1, fontSize: 13, color: "#fff", fontWeight: 500 }}>
          Ya pegué el snippet en mi sitio (head o GTM)
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, fontWeight: 400, marginTop: 2 }}>
            NitroSales validará que recibimos pings antes de aprobar tu cuenta.
          </div>
        </div>
      </label>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Right column — tutorial visual (Parte 2, placeholder por ahora)
// ═══════════════════════════════════════════════════════════════

function EmptyRightPanel() {
  return (
    <div style={{ textAlign: "center", paddingTop: 60 }}>
      <div style={{ display: "inline-flex", marginBottom: 18, opacity: 0.5 }}>
        <div style={iconCircle("#6366F1")}>
          <ImageIcon size={28} color="#818CF8" />
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#818CF8", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
        Tutorial visual
      </div>
      <div style={{ fontSize: 14, color: TEXT_PRIMARY, fontWeight: 600, marginBottom: 8 }}>
        Capturas paso a paso
      </div>
      <p style={{ color: TEXT_SECONDARY, fontSize: 12, lineHeight: 1.7, margin: "0 20px", maxWidth: 320, marginInline: "auto" }}>
        Cuando selecciones una plataforma en el centro, acá vas a ver el tutorial visual con
        capturas de pantalla reales para que encuentres cada dato rápido.
      </p>
    </div>
  );
}

function VisualTutorialPanel({ platformKey }: { platformKey: BrandKey }) {
  return <VisualTutorial platformKey={platformKey} />;
}


// ═══════════════════════════════════════════════════════════════
// Skip modal
// ═══════════════════════════════════════════════════════════════

function SkipModal({ platform, onCancel, onConfirm }: { platform: Platform; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460, width: "100%",
          background: "#141419",
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ban size={18} color={ACCENT_RED} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT_RED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Atención
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "2px 0 0" }}>
              ¿Seguro que no usás {platform.name}?
            </h3>
          </div>
        </div>

        <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.6, margin: "0 0 14px" }}>
          Si marcás que no usás esta plataforma, vas a perder estas funcionalidades en NitroSales:
        </p>

        <ul style={{ margin: 0, paddingLeft: 18, color: TEXT_PRIMARY, fontSize: 12, lineHeight: 1.9 }}>
          {platform.missFeatures.map((f, i) => (
            <li key={i}>
              <span style={{ color: ACCENT_RED, marginRight: 4 }}>✕</span> {f}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
          Siempre podés conectarla después desde <strong style={{ color: TEXT_PRIMARY }}>Settings → Integraciones</strong>.
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "11px 16px",
            background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 9,
            color: TEXT_SECONDARY, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            Volver atrás
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "11px 16px",
            background: "rgba(239,68,68,0.12)", border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 9,
            color: "#FCA5A5", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            Confirmar, no la uso
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared
// ═══════════════════════════════════════════════════════════════

function InfoBox({ children }: any) {
  return (
    <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Info size={14} color="#60A5FA" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BusinessInfoCard — captura pais / timezone / moneda del negocio.
// Se renderiza arriba de "Tu stack" en la sidebar del wizard. Los
// valores se usan para: Meta CAPI (country code), reportes
// timezone-aware, conversiones y visualizacion de moneda en P&L.
// Defaults: Argentina. Usuario puede cambiarlos si opera en otro pais.
// ═══════════════════════════════════════════════════════════════
const COUNTRY_OPTIONS: Array<{ code: string; name: string; tz: string; currency: string }> = [
  { code: "AR", name: "Argentina", tz: "America/Argentina/Buenos_Aires", currency: "ARS" },
  { code: "UY", name: "Uruguay", tz: "America/Montevideo", currency: "UYU" },
  { code: "CL", name: "Chile", tz: "America/Santiago", currency: "CLP" },
  { code: "PE", name: "Perú", tz: "America/Lima", currency: "PEN" },
  { code: "CO", name: "Colombia", tz: "America/Bogota", currency: "COP" },
  { code: "MX", name: "México", tz: "America/Mexico_City", currency: "MXN" },
  { code: "BR", name: "Brasil", tz: "America/Sao_Paulo", currency: "BRL" },
  { code: "US", name: "Estados Unidos", tz: "America/New_York", currency: "USD" },
  { code: "ES", name: "España", tz: "Europe/Madrid", currency: "EUR" },
];

const CURRENCY_OPTIONS = ["ARS", "UYU", "CLP", "PEN", "COP", "MXN", "BRL", "USD", "EUR", "BOB", "PYG"];

function BusinessInfoCard({ orgInfo, setOrgInfo }: { orgInfo: any; setOrgInfo: (o: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === orgInfo.country);

  const onCountryChange = (code: string) => {
    const c = COUNTRY_OPTIONS.find((o) => o.code === code);
    if (!c) return;
    // Al cambiar pais, sugerir timezone + moneda del pais (pero mantener
    // lo que eligio el user si ya lo cambio manual).
    setOrgInfo({
      country: c.code,
      timezone: c.tz,
      defaultCurrency: c.currency,
    });
  };

  return (
    <div
      style={{
        marginBottom: 16,
        paddingBottom: 14,
        borderBottom: `1px dashed ${BORDER}`,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          color: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Datos del negocio
          </div>
          <div
            style={{
              fontSize: 10,
              padding: "1px 7px",
              borderRadius: 99,
              background: "rgba(34,197,94,0.10)",
              color: "#4ADE80",
              fontWeight: 600,
            }}
          >
            ✓ {selectedCountry?.name || orgInfo.country} · {orgInfo.defaultCurrency}
          </div>
        </div>
        <span style={{ fontSize: 12, color: TEXT_MUTED }}>{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* País */}
          <div>
            <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>
              País de operación
            </label>
            <select
              value={orgInfo.country}
              onChange={(e) => onCountryChange(e.target.value)}
              style={{
                width: "100%", padding: "7px 9px",
                background: "rgba(255,255,255,0.03)", color: "#fff",
                border: `1px solid ${BORDER}`, borderRadius: 7,
                fontSize: 11, outline: "none",
              }}
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code} style={{ background: "#141419" }}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Timezone */}
          <div>
            <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>
              Zona horaria
            </label>
            <input
              value={orgInfo.timezone}
              onChange={(e) => setOrgInfo({ ...orgInfo, timezone: e.target.value })}
              style={{
                width: "100%", padding: "7px 9px",
                background: "rgba(255,255,255,0.03)", color: "#fff",
                border: `1px solid ${BORDER}`, borderRadius: 7,
                fontSize: 11, outline: "none",
                fontFamily: "'SF Mono', Menlo, monospace",
              }}
            />
          </div>

          {/* Currency */}
          <div>
            <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>
              Moneda principal
            </label>
            <select
              value={orgInfo.defaultCurrency}
              onChange={(e) => setOrgInfo({ ...orgInfo, defaultCurrency: e.target.value })}
              style={{
                width: "100%", padding: "7px 9px",
                background: "rgba(255,255,255,0.03)", color: "#fff",
                border: `1px solid ${BORDER}`, borderRadius: 7,
                fontSize: 11, outline: "none",
              }}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c} style={{ background: "#141419" }}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.5, marginTop: 4 }}>
            Se usa para reportes timezone-aware, conversiones de moneda en P&L, y Meta CAPI.
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>{label}</label>
      </div>
      {children}
      {hint && <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, mono, maxLength }: any) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} maxLength={maxLength}
      style={{
        width: "100%", padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BORDER}`, borderRadius: 8,
        color: "#fff", fontSize: 12, outline: "none",
        fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : undefined,
        boxSizing: "border-box", transition: "border-color 120ms",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    />
  );
}

function Title({ children }: any) {
  return (
    <h1 style={{
      fontSize: 26, fontWeight: 700,
      letterSpacing: "-0.02em", margin: "0 0 14px",
      background: "linear-gradient(135deg, #fff 0%, #9CA3AF 100%)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    }}>
      {children}
    </h1>
  );
}

function Pretitle({ children, tone }: any) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: tone,
      textTransform: "uppercase", letterSpacing: "0.12em",
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function iconCircle(color: string) {
  return {
    width: 64, height: 64, borderRadius: "50%",
    background: `${color}1A`, border: `1px solid ${color}4D`,
    display: "flex", alignItems: "center", justifyContent: "center",
  } as React.CSSProperties;
}

// ═══════════════════════════════════════════════════════════════
// AurumChatButton — barra horizontal pegada abajo del overlay
// Fase 0 del onboarding roadmap. Abre el drawer con Aurum.
// ═══════════════════════════════════════════════════════════════
function AurumChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 18,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 22px 12px 14px",
        borderRadius: 999,
        border: "1px solid rgba(168,85,247,0.35)",
        background: "linear-gradient(135deg, rgba(255,0,128,0.18) 0%, rgba(168,85,247,0.22) 50%, rgba(0,212,255,0.18) 100%)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 10px 40px rgba(168,85,247,0.25), 0 2px 8px rgba(0,0,0,0.3)",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        animation: "aurumBtnPulse 3.5s ease-in-out infinite",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateX(-50%) translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 16px 52px rgba(168,85,247,0.38), 0 3px 12px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateX(-50%)";
        e.currentTarget.style.boxShadow = "0 10px 40px rgba(168,85,247,0.25), 0 2px 8px rgba(0,0,0,0.3)";
      }}
    >
      <AurumOrb size={26} />
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.2 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Hablá con Aurum</span>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", fontWeight: 400 }}>Te ayudo con dudas del onboarding</span>
      </span>
      <style jsx>{`
        @keyframes aurumBtnPulse {
          0%, 100% { box-shadow: 0 10px 40px rgba(168,85,247,0.25), 0 2px 8px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 12px 48px rgba(168,85,247,0.4), 0 2px 8px rgba(0,0,0,0.3); }
        }
      `}</style>
    </button>
  );
}
