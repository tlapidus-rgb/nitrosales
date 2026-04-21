// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingOverlay v2 — wizard por pasos, tutoriales quirúrgicos
// ══════════════════════════════════════════════════════════════
// 4 fases:
//   - wizard:     flow por pasos, uno por plataforma seleccionada.
//                 Cada paso tiene tutorial completo con rol/permisos exactos.
//   - validating: esperando aprobación admin del backfill.
//   - backfilling: jobs corriendo, overlay muestra progreso.
//   - done:       null (desbloqueado).
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";

const BRAND_ORANGE = "#FF5E1A";
const CARD_BG = "rgba(20,20,25,0.95)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const ACCENT_GREEN = "#22C55E";

// ─── Overlay container ───────────────────────────────────────
export default function OnboardingOverlay() {
  const [state, setState] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        background:
          "radial-gradient(circle at 20% 30%, rgba(255,94,26,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(168,85,247,0.08) 0%, transparent 50%), rgba(10,10,15,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        overflow: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "92vh",
          overflow: "auto",
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset",
          padding: 36,
          color: TEXT_PRIMARY,
        }}
      >
        {state.phase === "wizard" && <WizardFlow onSubmitted={fetchState} />}
        {state.phase === "validating" && <ValidatingPhase />}
        {state.phase === "backfilling" && <BackfillingPhase progress={state.backfillProgress} />}
      </div>
      <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Validating phase ────────────────────────────────────────
function ValidatingPhase() {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ display: "inline-flex", marginBottom: 18 }}>
        <div style={iconCircle(BRAND_ORANGE)}>
          <Clock size={28} color={BRAND_ORANGE} />
        </div>
      </div>
      <Pretitle tone={BRAND_ORANGE}>Validando tus datos</Pretitle>
      <Title>Estamos revisando tu configuración</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 20px", maxWidth: 480, marginInline: "auto" }}>
        Nuestro equipo está validando las credenciales que cargaste. Te avisamos por email apenas
        aprobemos el backfill de tu data histórica.{" "}
        <strong style={{ color: TEXT_PRIMARY }}>Esto suele tomar entre 2 y 24 hs hábiles.</strong>
      </p>
      <p style={{ color: TEXT_MUTED, fontSize: 12, marginTop: 24 }}>
        Podés cerrar esta ventana — te llega un email cuando esté listo.
      </p>
    </div>
  );
}

// ─── Backfilling phase ───────────────────────────────────────
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
        <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: 0, maxWidth: 480, marginInline: "auto" }}>
          Cuando termine, todo el producto se desbloquea automáticamente. Podés cerrar la pestaña
          o esperar acá — te avisamos por email también.
        </p>
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
            {j.processed > 0 && (
              <div style={{ fontSize: 10, color: TEXT_SECONDARY, marginTop: 4 }}>
                {j.processed.toLocaleString("es-AR")} procesadas
                {j.totalEstimate && ` / ${j.totalEstimate.toLocaleString("es-AR")} estimadas`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Wizard flow — pasos guiados
// ═══════════════════════════════════════════════════════════════

const ALL_PLATFORMS = [
  { key: "VTEX", name: "VTEX", color: "#FF0080", description: "Ecommerce — pedidos, productos, stock" },
  { key: "MERCADOLIBRE", name: "MercadoLibre", color: "#FFE600", description: "Marketplace — OAuth después" },
  { key: "META_ADS", name: "Meta Ads", color: "#1877F2", description: "Facebook + Instagram Ads" },
  { key: "META_PIXEL", name: "Meta Pixel", color: "#1877F2", description: "Conversiones API server-side" },
  { key: "GOOGLE_ADS", name: "Google Ads", color: "#4285F4", description: "Search, Shopping, PMax" },
];

function WizardFlow({ onSubmitted }: { onSubmitted: () => void }) {
  // State
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [creds, setCreds] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number>>({
    VTEX: 12,
    MERCADOLIBRE: 12,
    META_ADS: 6,
    GOOGLE_ADS: 6,
  });
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pasos dinámicos: intro + plataformas seleccionadas + historia + confirmar
  const activePlatforms = ALL_PLATFORMS.filter((p) => selected[p.key]);
  const steps = useMemo(() => {
    const s: Array<{ id: string; label: string; kind: string; platform?: string }> = [
      { id: "intro", label: "Plataformas", kind: "intro" },
    ];
    for (const p of activePlatforms) {
      s.push({ id: `platform:${p.key}`, label: p.name, kind: "platform", platform: p.key });
    }
    if (activePlatforms.length > 0) {
      s.push({ id: "history", label: "Histórico", kind: "history" });
      s.push({ id: "confirm", label: "Confirmar", kind: "confirm" });
    }
    return s;
  }, [activePlatforms.map((p) => p.key).join(",")]);

  const currentStep = steps[step] || steps[0];
  const totalSteps = steps.length;

  const toggleSelected = (k: string) => setSelected((s) => ({ ...s, [k]: !s[k] }));
  const updateCred = (p: string, field: string, value: string) =>
    setCreds((c) => ({ ...c, [p]: { ...(c[p] || {}), [field]: value } }));

  const validateCurrentPlatform = (): string | null => {
    if (currentStep.kind !== "platform") return null;
    const p = currentStep.platform!;
    const c = creds[p] || {};
    switch (p) {
      case "VTEX":
        if (!c.accountName?.trim()) return "Account Name requerido";
        if (!c.appKey?.trim()) return "App Key requerido";
        if (!c.appToken?.trim()) return "App Token requerido";
        break;
      case "MERCADOLIBRE":
        if (!c.username?.trim()) return "Usuario ML requerido";
        break;
      case "META_ADS":
        if (!c.adAccountId?.trim()) return "Ad Account ID requerido";
        if (!c.accessToken?.trim()) return "Access Token requerido";
        break;
      case "META_PIXEL":
        if (!c.pixelId?.trim()) return "Pixel ID requerido";
        if (!c.accessToken?.trim()) return "Access Token requerido";
        break;
      case "GOOGLE_ADS":
        if (!c.customerId?.trim()) return "Customer ID requerido";
        break;
    }
    return null;
  };

  const handleNext = () => {
    setError(null);
    if (currentStep.kind === "intro" && activePlatforms.length === 0) {
      setError("Seleccioná al menos una plataforma para continuar");
      return;
    }
    const v = validateCurrentPlatform();
    if (v) {
      setError(v);
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step > 0) setStep(step - 1);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const platformsArr = activePlatforms.map((p) => ({
        platform: p.key,
        credentials: creds[p.key] || {},
      }));
      const res = await fetch("/api/me/onboarding/submit-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: platformsArr, historyMonths: history }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        setSubmitting(false);
        return;
      }
      onSubmitted();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const isLast = step === steps.length - 1;

  return (
    <div>
      {/* Progress */}
      <StepProgress currentIndex={step} total={totalSteps} label={currentStep.label} />

      {/* Body */}
      <div style={{ marginTop: 24 }}>
        {currentStep.kind === "intro" && (
          <IntroStep selected={selected} onToggle={toggleSelected} />
        )}
        {currentStep.kind === "platform" && (
          <PlatformStep
            platformKey={currentStep.platform!}
            creds={creds[currentStep.platform!] || {}}
            onChange={(field, value) => updateCred(currentStep.platform!, field, value)}
          />
        )}
        {currentStep.kind === "history" && (
          <HistoryStep
            active={activePlatforms.map((p) => p.key)}
            history={history}
            onChange={(k, v) => setHistory((h) => ({ ...h, [k]: v }))}
          />
        )}
        {currentStep.kind === "confirm" && (
          <ConfirmStep activePlatforms={activePlatforms} history={history} creds={creds} />
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 16, padding: "10px 14px",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8, color: "#F87171", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Navigation */}
      <div style={{ marginTop: 28, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleBack}
          disabled={step === 0 || submitting}
          style={{
            padding: "10px 18px",
            background: "transparent",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            color: step === 0 ? TEXT_MUTED : TEXT_SECONDARY,
            fontSize: 13,
            fontWeight: 500,
            cursor: step === 0 || submitting ? "not-allowed" : "pointer",
            opacity: step === 0 ? 0.4 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ArrowLeft size={14} /> Atrás
        </button>

        {isLast ? (
          <button
            onClick={submit}
            disabled={submitting}
            style={primaryBtn(submitting)}
          >
            {submitting ? (
              <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Enviando…</>
            ) : (
              <>Enviar para validación <ArrowRight size={14} /></>
            )}
          </button>
        ) : (
          <button onClick={handleNext} style={primaryBtn(false)}>
            Continuar <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step progress bar ───────────────────────────────────────
function StepProgress({ currentIndex, total, label }: { currentIndex: number; total: number; label: string }) {
  const pct = total > 1 ? (currentIndex / (total - 1)) * 100 : 0;
  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Paso {currentIndex + 1} de {total} · {label}
        </div>
        <div style={{ fontSize: 11, color: TEXT_MUTED }}>{Math.round(pct)}%</div>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`,
          transition: "width 400ms ease",
        }} />
      </div>
    </div>
  );
}

// ─── Step: intro ─────────────────────────────────────────────
function IntroStep({ selected, onToggle }: { selected: Record<string, boolean>; onToggle: (k: string) => void }) {
  return (
    <div>
      <Title>Bienvenido a NitroSales</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 24px" }}>
        Vamos a conectar tus plataformas paso a paso. Marcá las que usás — el orden y el detalle
        de cada una lo vamos a ir viendo juntos en las pantallas siguientes.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ALL_PLATFORMS.map((p) => {
          const isSelected = !!selected[p.key];
          return (
            <button
              key={p.key}
              onClick={() => onToggle(p.key)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px",
                background: isSelected ? `${p.color}0D` : "rgba(255,255,255,0.02)",
                border: `1px solid ${isSelected ? `${p.color}44` : BORDER}`,
                borderRadius: 12,
                cursor: "pointer",
                transition: "all 160ms",
                textAlign: "left",
                color: "inherit",
                width: "100%",
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 5,
                border: `2px solid ${isSelected ? p.color : "#3F3F46"}`,
                background: isSelected ? p.color : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {isSelected && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: isSelected ? "#fff" : TEXT_PRIMARY }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>{p.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step: platform ──────────────────────────────────────────
function PlatformStep({ platformKey, creds, onChange }: {
  platformKey: string;
  creds: any;
  onChange: (field: string, value: string) => void;
}) {
  if (platformKey === "VTEX") return <VtexStep creds={creds} onChange={onChange} />;
  if (platformKey === "MERCADOLIBRE") return <MlStep creds={creds} onChange={onChange} />;
  if (platformKey === "META_ADS") return <MetaAdsStep creds={creds} onChange={onChange} />;
  if (platformKey === "META_PIXEL") return <MetaPixelStep creds={creds} onChange={onChange} />;
  if (platformKey === "GOOGLE_ADS") return <GoogleAdsStep creds={creds} onChange={onChange} />;
  return null;
}

// ─── Step: VTEX ──────────────────────────────────────────────
function VtexStep({ creds, onChange }: any) {
  return (
    <PlatformHeader color="#FF0080" name="VTEX" description="Vamos a crear una App Key con permisos de lectura para que NitroSales pueda traer tus pedidos, productos y stock.">
      <Tutorial
        title="Cómo crear la App Key en VTEX (5 min)"
        steps={[
          { text: "Abrí tu admin VTEX", detail: "https://{tu-cuenta}.myvtex.com/admin — reemplazá {tu-cuenta} por tu subdomain (ej. arredo)." },
          { text: "Menú lateral → ícono de Apps (puzzle piece) → Application Keys", detail: "Si no ves 'Application Keys', andá a: Cuenta → Gestión de usuarios → App Keys." },
          { text: "Click en 'Manage my keys' → 'Generate New'", detail: "Si es la primera vez, puede pedirte confirmar que querés habilitar la feature." },
          { text: "Label: escribí 'NitroSales'", detail: "Es solo un nombre interno para identificarlo." },
          { text: "Asignar Roles → buscá y seleccioná 'Owner (Admin Super)'", detail: "Es el rol recomendado por VTEX para integraciones de lectura de analytics. Podés refinarlo después si querés permisos más granulares (ver abajo)." },
          { text: "Click 'Generate'", detail: "VTEX crea el par de credenciales." },
          { text: "Copiá AHORA el App Key y el App Token — el Token solo se muestra UNA VEZ", detail: "Si se pierde, tenés que regenerarlo." },
        ]}
        docUrl="https://developers.vtex.com/docs/guides/api-authentication-using-application-keys"
      />
      <AltRoleInfo>
        <strong style={{ color: TEXT_PRIMARY }}>Alternativa más segura (opcional):</strong> en vez de "Owner", creá un rol custom con estos permisos mínimos:
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
          <li>OMS · List orders / Get order</li>
          <li>Catalog · Get Product / Get SKU</li>
          <li>Master Data v1 · Read (CL / CM)</li>
        </ul>
      </AltRoleInfo>

      <div style={{ marginTop: 20 }}>
        <Field label="Account Name" hint="Es el subdomain de tu tienda VTEX (ej: 'arredo' si tu admin es arredo.myvtex.com).">
          <Input value={creds.accountName || ""} onChange={(v) => onChange("accountName", v)} placeholder="arredo" maxLength={60} />
        </Field>
        <Field label="App Key" hint="Empieza con 'vtexappkey-'.">
          <Input value={creds.appKey || ""} onChange={(v) => onChange("appKey", v)} placeholder="vtexappkey-xxxxx-XXXXXX" mono />
        </Field>
        <Field label="App Token" hint="Alfanumérico largo. Copialo del modal de VTEX (solo se muestra una vez).">
          <Input value={creds.appToken || ""} onChange={(v) => onChange("appToken", v)} placeholder="ABCD1234..." mono />
        </Field>
      </div>
    </PlatformHeader>
  );
}

// ─── Step: MercadoLibre ──────────────────────────────────────
function MlStep({ creds, onChange }: any) {
  return (
    <PlatformHeader color="#FFE600" textColor="#78350F" name="MercadoLibre" description="Para conectar MELI vamos a usar OAuth (el método seguro oficial). Acá solo necesitamos tu usuario de vendedor para identificar la cuenta.">
      <Tutorial
        title="Dónde ves tu usuario de MercadoLibre"
        steps={[
          { text: "Entrá a mercadolibre.com.ar logueado con tu cuenta vendedor", detail: "Tiene que ser la cuenta donde tenés tus publicaciones." },
          { text: "Arriba a la derecha, click en tu nombre", detail: "Se abre un menú desplegable." },
          { text: "Tu usuario aparece en el menú", detail: "Es alfanumérico, a veces empieza con '@'." },
          { text: "Pegalo acá sin la '@'", detail: "" },
        ]}
      />

      <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Info size={14} color="#60A5FA" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, cuando NitroSales apruebe tus datos, te vamos a pedir que autorices a NitroSales desde tu cuenta MELI vía un login oficial de MercadoLibre. No necesitamos tu contraseña — OAuth es el método seguro estándar.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <Field label="Usuario MercadoLibre">
          <Input value={creds.username || ""} onChange={(v) => onChange("username", v)} placeholder="tuusuario (sin @)" maxLength={60} />
        </Field>
      </div>
    </PlatformHeader>
  );
}

// ─── Step: Meta Ads ──────────────────────────────────────────
function MetaAdsStep({ creds, onChange }: any) {
  return (
    <PlatformHeader color="#1877F2" name="Meta Ads" description="Necesitamos un System User token de tu Business Manager (dura para siempre, no vence). Con eso traemos tus campañas, inversión y resultados de Facebook e Instagram Ads.">
      <Tutorial
        title="Parte 1: Ad Account ID (30 segundos)"
        steps={[
          { text: "Abrí business.facebook.com logueado", detail: "" },
          { text: "Click en el engranaje arriba izquierda → 'Configuración del negocio'", detail: "" },
          { text: "Menú izquierdo: Cuentas → Cuentas publicitarias", detail: "" },
          { text: "Copiá el ID de la cuenta que querés conectar", detail: "Son solo números (ej: 123456789). Ignorá el prefijo 'act_' si aparece." },
        ]}
      />

      <Tutorial
        title="Parte 2: System User + Access Token (5 min)"
        steps={[
          { text: "Business Manager → Configuración → Usuarios → Usuarios del sistema", detail: "" },
          { text: "Click 'Agregar' → Nombre: 'NitroSales System User' → rol 'Administrador'", detail: "" },
          { text: "Click sobre el nuevo usuario → 'Agregar activos'", detail: "" },
          { text: "Seleccionar: Cuentas publicitarias → tu cuenta → permiso 'Administración de la cuenta publicitaria'", detail: "Si no ves 'Administración', asigná 'Acceso completo'." },
          { text: "Click 'Generar token'", detail: "Se abre un modal." },
          { text: "App: si no tenés una, tenés que crear una gratuita en developers.facebook.com primero (ver nota abajo)", detail: "Para NitroSales creá una app tipo 'Business' — no necesita review ni publicarse." },
          { text: "Permisos a seleccionar: ads_read, ads_management, business_management", detail: "No marques otros — solo esos 3." },
          { text: "Click 'Generate Token' y copialo AHORA", detail: "Es muy largo, empieza con 'EAA...'. Solo se muestra una vez." },
        ]}
        docUrl="https://developers.facebook.com/docs/marketing-api/system-users"
      />

      <AltRoleInfo>
        <strong style={{ color: TEXT_PRIMARY }}>Por qué System User y no tu token personal:</strong> los tokens personales vencen a los 60 días. Los de System User duran para siempre. Es el método recomendado por Meta para integraciones permanentes.
      </AltRoleInfo>

      <div style={{ marginTop: 20 }}>
        <Field label="Ad Account ID" hint="Solo los números (sin 'act_').">
          <Input value={creds.adAccountId || ""} onChange={(v) => onChange("adAccountId", v.replace(/[^0-9]/g, ""))} placeholder="123456789" mono maxLength={30} />
        </Field>
        <Field label="Access Token (System User)">
          <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
        </Field>
      </div>
    </PlatformHeader>
  );
}

// ─── Step: Meta Pixel ────────────────────────────────────────
function MetaPixelStep({ creds, onChange }: any) {
  return (
    <PlatformHeader color="#1877F2" name="Meta Pixel (Conversiones API)" description="El Pixel es distinto de Meta Ads — maneja el tracking de conversiones server-side. Con esto mandamos tus compras directo a Meta sin depender del navegador, mejorando el match rate.">
      <Tutorial
        title="Parte 1: Pixel ID (1 min)"
        steps={[
          { text: "Abrí business.facebook.com/events_manager", detail: "" },
          { text: "Seleccioná tu pixel en el listado", detail: "Si no tenés uno, click '+ Conectar fuente de datos' → Web → Pixel de Meta." },
          { text: "Tab 'Configuración'", detail: "" },
          { text: "Copiá el 'ID del pixel' (15-16 dígitos)", detail: "No es el Ad Account ID — son distintos." },
        ]}
      />

      <Tutorial
        title="Parte 2: Access Token CAPI (2 min)"
        steps={[
          { text: "Mismo pixel → tab 'Configuración'", detail: "" },
          { text: "Scrollear hasta 'Conversions API' → 'Configurar manualmente'", detail: "" },
          { text: "Click 'Generar token de acceso'", detail: "Genera un token dedicado para el pixel. Es distinto del System User de Meta Ads." },
          { text: "Copialo AHORA — solo se muestra una vez", detail: "" },
        ]}
      />

      <AltRoleInfo>
        <strong style={{ color: TEXT_PRIMARY }}>Nota:</strong> si ya tenés el System User de Meta Ads con permiso <code style={{ background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: 4 }}>ads_management</code>, ese mismo token también sirve acá. Pero Meta recomienda uno dedicado por pixel para mejor trazabilidad.
      </AltRoleInfo>

      <div style={{ marginTop: 20 }}>
        <Field label="Pixel ID" hint="15-16 dígitos, solo números.">
          <Input value={creds.pixelId || ""} onChange={(v) => onChange("pixelId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890123456" mono maxLength={20} />
        </Field>
        <Field label="Access Token CAPI">
          <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
        </Field>
      </div>
    </PlatformHeader>
  );
}

// ─── Step: Google Ads ────────────────────────────────────────
function GoogleAdsStep({ creds, onChange }: any) {
  return (
    <PlatformHeader color="#4285F4" name="Google Ads" description="Para Google Ads usamos OAuth (login oficial de Google) — acá solo necesitamos tu Customer ID para identificar la cuenta.">
      <Tutorial
        title="Dónde está el Customer ID"
        steps={[
          { text: "Abrí ads.google.com logueado con tu cuenta", detail: "" },
          { text: "Arriba a la derecha, al lado del selector de cuentas, ves un número con formato 123-456-7890", detail: "Puede aparecer también como 'CID: 1234567890'." },
          { text: "Copialo SIN los guiones", detail: "Solo los 10 dígitos." },
        ]}
        docUrl="https://support.google.com/google-ads/answer/1704344"
      />

      <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Info size={14} color="#60A5FA" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, cuando NitroSales apruebe tus datos, te vamos a llevar a un login oficial de Google donde autorizás a NitroSales como app. No pedimos tu contraseña — es OAuth estándar.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <Field label="Customer ID" hint="10 dígitos sin guiones.">
          <Input value={creds.customerId || ""} onChange={(v) => onChange("customerId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890" mono maxLength={10} />
        </Field>
      </div>
    </PlatformHeader>
  );
}

// ─── Step: History ───────────────────────────────────────────
function HistoryStep({ active, history, onChange }: { active: string[]; history: Record<string, number>; onChange: (k: string, v: number) => void }) {
  const OPTIONS = [
    { months: 3, label: "3 meses", eta: "minutos" },
    { months: 6, label: "6 meses", eta: "~30 min" },
    { months: 12, label: "1 año", eta: "1-2 hs" },
    { months: 24, label: "2 años", eta: "3-6 hs" },
    { months: -1, label: "Todo", eta: "~1 día" },
  ];
  const PLATFORMS_HISTORY: Record<string, { name: string; color: string }> = {
    VTEX: { name: "VTEX", color: "#FF0080" },
    MERCADOLIBRE: { name: "MercadoLibre", color: "#FFE600" },
    META_ADS: { name: "Meta Ads", color: "#1877F2" },
    GOOGLE_ADS: { name: "Google Ads", color: "#4285F4" },
  };
  const filtered = active.filter((k) => PLATFORMS_HISTORY[k]);

  return (
    <div>
      <Title>Cuánta historia querés traer</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 20px" }}>
        Más tiempo = más data histórica disponible desde día 1, pero la activación tarda más. Podés elegir distinto por plataforma.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filtered.map((k) => {
          const meta = PLATFORMS_HISTORY[k];
          const value = history[k] ?? 12;
          return (
            <div key={k} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>{meta.name}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                {OPTIONS.map((opt) => {
                  const active = value === opt.months;
                  return (
                    <button key={opt.months} onClick={() => onChange(k, opt.months)} style={{
                      padding: "8px 4px",
                      background: active ? `${meta.color}1A` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${active ? meta.color : BORDER}`,
                      borderRadius: 7,
                      color: active ? "#fff" : TEXT_SECONDARY,
                      cursor: "pointer",
                      textAlign: "center",
                      fontSize: 11,
                    }}>
                      <div style={{ fontWeight: active ? 700 : 500 }}>{opt.label}</div>
                      <div style={{ fontSize: 9, color: active ? meta.color : TEXT_MUTED, marginTop: 2 }}>{opt.eta}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step: Confirm ───────────────────────────────────────────
function ConfirmStep({ activePlatforms, history, creds }: { activePlatforms: any[]; history: Record<string, number>; creds: Record<string, any> }) {
  const HIST_LABEL = (m: number) => {
    if (m === -1) return "Todo lo disponible";
    if (m === 1) return "1 mes";
    return `${m} meses`;
  };

  return (
    <div>
      <Title>Revisá antes de enviar</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 20px" }}>
        Cuando envíes, NitroSales valida los datos y aprueba el backfill (2-24 hs). Recibís email cuando esté listo.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activePlatforms.map((p) => (
          <div key={p.key} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#fff" }}>{p.name}</div>
              <CheckCircle2 size={14} color={ACCENT_GREEN} />
            </div>
            <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 6, paddingLeft: 17 }}>
              Credenciales cargadas · Historia: <strong style={{ color: TEXT_PRIMARY }}>{HIST_LABEL(history[p.key] ?? 12)}</strong>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, display: "flex", gap: 8 }}>
        <ShieldCheck size={14} color={ACCENT_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
          Tus credenciales viajan encriptadas con TLS y se guardan cifradas con AES-256.
        </div>
      </div>
    </div>
  );
}

// ─── Shared components ──────────────────────────────────────
function PlatformHeader({ color, textColor, name, description, children }: any) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#fff" }}>{name}</h2>
      </div>
      <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7, margin: "0 0 18px" }}>{description}</p>
      {children}
    </div>
  );
}

function Tutorial({ title, steps, docUrl }: { title: string; steps: Array<{ text: string; detail?: string }>; docUrl?: string }) {
  return (
    <div style={{
      padding: "14px 16px",
      background: "rgba(255,94,26,0.04)",
      border: "1px solid rgba(255,94,26,0.18)",
      borderRadius: 10,
      marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        {title}
      </div>
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: 10, marginBottom: i === steps.length - 1 ? 0 : 10 }}>
            <div style={{
              minWidth: 18, height: 18, borderRadius: "50%",
              background: "rgba(255,94,26,0.15)",
              border: "1px solid rgba(255,94,26,0.35)",
              color: BRAND_ORANGE,
              fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: 1,
            }}>
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 1.6 }}>{s.text}</div>
              {s.detail && (
                <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6, marginTop: 3 }}>{s.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {docUrl && (
        <a href={docUrl} target="_blank" rel="noopener noreferrer" style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          marginTop: 12, fontSize: 11, color: BRAND_ORANGE, textDecoration: "none",
          paddingTop: 8, borderTop: "1px dashed rgba(255,94,26,0.2)",
        }}>
          Ver doc oficial <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

function AltRoleInfo({ children }: any) {
  return (
    <div style={{
      padding: "10px 12px",
      background: "rgba(255,255,255,0.02)",
      border: `1px dashed ${BORDER}`,
      borderRadius: 8,
      fontSize: 11,
      color: TEXT_SECONDARY,
      lineHeight: 1.6,
      marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
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
      value={value}
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
        fontSize: 12,
        outline: "none",
        fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : undefined,
        boxSizing: "border-box",
        transition: "border-color 120ms",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    />
  );
}

function Title({ children }: any) {
  return (
    <h1 style={{
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: "-0.02em",
      margin: "0 0 14px",
      background: "linear-gradient(135deg, #fff 0%, #9CA3AF 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    }}>
      {children}
    </h1>
  );
}

function Pretitle({ children, tone }: any) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: tone,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function iconCircle(color: string) {
  return {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: `${color}1A`,
    border: `1px solid ${color}4D`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties;
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 22px",
    background: disabled ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "wait" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    boxShadow: disabled ? "none" : "0 4px 14px rgba(255,94,26,0.28)",
  };
}
