"use client";

import { useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { AurumOrb } from "@/components/aurum/AurumOrb";
import { LivePulse } from "@/components/enterprise/ui";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Message = { role: "user" | "assistant"; content: string };
type ReasoningMode = "FLASH" | "CORE" | "DEEP";
type Confidence = "high" | "medium" | "low" | "none";

const MODES: Array<{ key: ReasoningMode; label: string; desc: string }> = [
  { key: "FLASH", label: "Flash", desc: "Rápido · Haiku" },
  { key: "CORE", label: "Core", desc: "Default · Sonnet" },
  { key: "DEEP", label: "Deep", desc: "Profundo · Opus" },
];

const SUGGESTIONS = [
  { title: "Auditoría completa", subtitle: "Radiografía total del negocio", prompt: "Haceme una auditoría completa del negocio" },
  { title: "Cuello de botella", subtitle: "Dónde se pierde la conversión", prompt: "Dónde está el mayor cuello de botella de conversión?" },
  { title: "Ads: pausar vs escalar", subtitle: "Decisiones de budget", prompt: "Qué campañas debería pausar y cuáles escalar?" },
  { title: "Unit economics", subtitle: "CAC, LTV, ticket promedio", prompt: "Analizá los unit economics: CAC, LTV, ticket promedio" },
  { title: "5 oportunidades ocultas", subtitle: "Lo que no estás viendo", prompt: "Dame 5 oportunidades de crecimiento que no estoy viendo" },
  { title: "Google vs Meta", subtitle: "Redistribución de budget", prompt: "Cómo redistribuyo el budget entre Google y Meta?" },
];

const THINKING_STATES = [
  "Leyendo tus datos",
  "Cruzando señales",
  "Buscando patrones",
  "Generando insights",
  "Finalizando",
];

// ── Onboarding Options ──
const INDUSTRIES = [
  { value: "juguetes", label: "Juguetes", icon: "\u{1F9F8}" },
  { value: "moda", label: "Moda & Indumentaria", icon: "\u{1F45A}" },
  { value: "electronica", label: "Electrónica & Tech", icon: "\u{1F4F1}" },
  { value: "alimentos", label: "Alimentos & Bebidas", icon: "\u{1F354}" },
  { value: "belleza", label: "Belleza & Cuidado Personal", icon: "\u{1F484}" },
  { value: "deportes", label: "Deportes & Fitness", icon: "\u{26BD}" },
  { value: "hogar", label: "Hogar & Deco", icon: "\u{1F3E0}" },
  { value: "otro", label: "Otro", icon: "\u{1F4E6}" },
];

const BUSINESS_TYPES = [
  { value: "Ecommerce puro", label: "Ecommerce puro", desc: "Solo venta online" },
  { value: "Omnichannel", label: "Omnichannel", desc: "Tiendas físicas + online" },
  { value: "Marketplace", label: "Marketplace", desc: "MercadoLibre, Amazon, etc." },
  { value: "Mayorista", label: "Mayorista", desc: "Venta B2B" },
];

const COUNTRIES = [
  { value: "argentina", label: "Argentina", flag: "\u{1F1E6}\u{1F1F7}" },
  { value: "mexico", label: "México", flag: "\u{1F1F2}\u{1F1FD}" },
  { value: "colombia", label: "Colombia", flag: "\u{1F1E8}\u{1F1F4}" },
  { value: "chile", label: "Chile", flag: "\u{1F1E8}\u{1F1F1}" },
  { value: "otro", label: "Otro", flag: "\u{1F30E}" },
];

const SALES_CHANNELS = ["Tienda propia", "MercadoLibre", "Tienda Nube", "VTEX", "Shopify", "Otros marketplaces"];
const AD_CHANNELS = ["Google Ads", "Meta Ads", "TikTok Ads", "MercadoLibre Ads", "Ninguno"];
const STAGES = [
  { value: "starting", label: "Recién arrancando", desc: "< 6 meses" },
  { value: "growth", label: "En crecimiento", desc: "6 meses - 2 años" },
  { value: "established", label: "Establecido", desc: "> 2 años" },
];

// AurumOrb se importa desde @/components/aurum/AurumOrb (mascota de marca —
// conserva su dorado propio, no se toca acá).

// ══════ Cycling Headline (welcome) ══════
const WELCOME_PHRASES = [
  "Razonando con tus números",
  "Cruzando ventas, ads y pixel",
  "Encontrando lo que no estás viendo",
];
function CyclingHeadline() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % WELCOME_PHRASES.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="h-5 mt-1 relative w-full max-w-md mx-auto">
      {WELCOME_PHRASES.map((phrase, i) => (
        <div
          key={i}
          className={cx(
            "absolute inset-0 text-[11px] font-geistmono uppercase tracking-[0.2em] text-center text-ink-40 transition-opacity duration-700",
            i === idx ? "opacity-100" : "opacity-0"
          )}
        >
          {phrase}
        </div>
      ))}
    </div>
  );
}

// ══════ Thinking Indicator ══════
function AurumThinking() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % THINKING_STATES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-4 py-2">
      <AurumOrb size={42} thinking />
      <div className="flex flex-col">
        <div key={idx} className="text-sm font-medium text-ink">
          {THINKING_STATES[idx]}
          <span className="ml-1 opacity-60">...</span>
        </div>
        <div className="mt-1 flex gap-1">
          {THINKING_STATES.map((_, i) => (
            <div
              key={i}
              className={cx(
                "h-[2px] rounded-full transition-all duration-500",
                i <= idx ? "bg-ink" : "bg-hairline-2"
              )}
              style={{ width: i === idx ? 18 : 6 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { data: session } = useSession();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [onboardingData, setOnboardingData] = useState({
    industry: "",
    customIndustry: "",
    businessType: "",
    country: "",
    salesChannels: [] as string[],
    adChannels: [] as string[],
    businessStage: "",
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ReasoningMode>("CORE");
  const [autoDetected, setAutoDetected] = useState<Record<string, Confidence>>({});
  const [autoDetecting, setAutoDetecting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/onboarding");
        const data = await res.json();
        const needs = !data.businessContext;
        setNeedsOnboarding(needs);

        // ── Onboarding Inteligente: si necesita onboarding, intentar
        // auto-detectar campos desde la DB antes de mostrar el wizard
        if (needs) {
          setAutoDetecting(true);
          try {
            const adRes = await fetch("/api/aurum/context-autodetect");
            if (adRes.ok) {
              const ad = await adRes.json();
              const det = ad.detected || {};
              const updates: Partial<typeof onboardingData> = {};
              const detectedMap: Record<string, Confidence> = {};

              if (det.industry?.value && det.industry.confidence !== "none") {
                updates.industry = det.industry.value;
                detectedMap.industry = det.industry.confidence;
              }
              if (det.salesChannels?.value && det.salesChannels.confidence !== "none") {
                updates.salesChannels = det.salesChannels.value;
                detectedMap.salesChannels = det.salesChannels.confidence;
              }
              if (det.adChannels?.value && det.adChannels.confidence !== "none") {
                updates.adChannels = det.adChannels.value;
                detectedMap.adChannels = det.adChannels.confidence;
              }

              if (Object.keys(updates).length > 0) {
                setOnboardingData((prev) => ({ ...prev, ...updates }));
                setAutoDetected(detectedMap);
              }
            }
          } catch (err) {
            console.warn("[autodetect] failed:", err);
          }
          setAutoDetecting(false);
        }
      } catch {
        setNeedsOnboarding(false);
      }
      setCheckingOnboarding(false);
    }
    check();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const toggleMultiSelect = (arr: string[], value: string) => {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  };

  const submitOnboarding = async () => {
    setSavingOnboarding(true);
    setOnboardingError("");
    try {
      const industry = onboardingData.industry === "otro" && onboardingData.customIndustry
        ? onboardingData.customIndustry
        : onboardingData.industry;

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry,
          businessType: onboardingData.businessType,
          country: onboardingData.country,
          salesChannels: onboardingData.salesChannels,
          adChannels: onboardingData.adChannels.filter((c) => c !== "Ninguno"),
          businessStage: onboardingData.businessStage,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        setOnboardingError(errData.error || `Error del servidor (${res.status})`);
        setSavingOnboarding(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setNeedsOnboarding(false);
      } else {
        setOnboardingError(data.error || "Error al guardar la configuración");
      }
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setOnboardingError("Error de conexión. Intentá de nuevo.");
    }
    setSavingOnboarding(false);
  };

  const sendMessage = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    const updated: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(updated);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: updated.slice(0, -1), mode }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || data.error || "Error" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexión." },
      ]);
    }
    setLoading(false);
  };

  function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return (
            <strong key={j} className="font-semibold text-ink">
              {p.slice(2, -2)}
            </strong>
          );
        return <span key={j}>{p}</span>;
      });
      if (line.startsWith("### "))
        return (
          <h4 key={i} className="font-semibold text-sm mt-4 mb-1.5 text-ink">
            {line.replace("### ", "")}
          </h4>
        );
      if (line.startsWith("## "))
        return (
          <h3 key={i} className="font-semibold text-base mt-5 mb-2 text-ink">
            {line.replace("## ", "")}
          </h3>
        );
      if (line.startsWith("---"))
        return <hr key={i} className="my-3 border-hairline" />;
      if (line.trim().startsWith("- ") || line.trim().startsWith("• "))
        return (
          <div key={i} className="flex gap-2 my-0.5">
            <span className="text-ink-40">•</span>
            <span>{line.replace(/^[\s]*[-•]\s/, "")}</span>
          </div>
        );
      return (
        <span key={i}>
          {i > 0 && <br />}
          {parts}
        </span>
      );
    });
  }

  const canvasClass = "h-full w-full flex flex-col overflow-hidden bg-canvas px-6 py-6 lg:px-8";

  if (checkingOnboarding) {
    return (
      <div className={cx(canvasClass, "items-center justify-center")}>
        <div className="flex flex-col items-center gap-4">
          <AurumOrb size={56} thinking />
          <div className="text-sm font-medium text-ink-60">Despertando a Aurum</div>
        </div>
      </div>
    );
  }

  // ══════ ONBOARDING WIZARD ══════
  if (needsOnboarding) {
    const optionClass = (sel: boolean) =>
      cx(
        "rounded-xl border transition-colors duration-150 ease-ent",
        sel ? "bg-ink border-ink" : "bg-white border-hairline-2 hover:border-hairline"
      );

    const AutoBadge = ({ field }: { field: string }) => {
      const conf = autoDetected[field];
      if (!conf || conf === "none") return null;
      return (
        <span
          className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-geistmono uppercase tracking-wider align-middle bg-accent-soft text-accent border border-accent/20"
          title={`Auto-detectado con confianza ${conf}`}
        >
          ✓ Auto
        </span>
      );
    };

    const steps = [
      <div key="industry">
        <h3 className="text-xl font-semibold text-ink mb-2">
          En qué rubro está tu negocio?<AutoBadge field="industry" />
        </h3>
        <p className="text-sm mb-5 text-ink-60">
          {autoDetected.industry
            ? "Detectamos esto desde tu catálogo. Podés cambiarlo si está mal."
            : "Aurum adapta sus insights a tu estacionalidad y benchmarks"}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {INDUSTRIES.map((ind) => {
            const sel = onboardingData.industry === ind.value;
            return (
              <button
                key={ind.value}
                onClick={() => setOnboardingData({ ...onboardingData, industry: ind.value })}
                className={cx("p-3 text-left", optionClass(sel))}
              >
                <span className="text-2xl">{ind.icon}</span>
                <div className={cx("text-sm font-medium mt-1", sel ? "text-white" : "text-ink-60")}>
                  {ind.label}
                </div>
              </button>
            );
          })}
        </div>
        {onboardingData.industry === "otro" && (
          <input
            type="text"
            placeholder="Describí tu rubro..."
            value={onboardingData.customIndustry}
            onChange={(e) => setOnboardingData({ ...onboardingData, customIndustry: e.target.value })}
            className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm outline-none transition bg-surface border border-hairline-2 text-ink placeholder:text-ink-40 focus:border-hairline"
          />
        )}
      </div>,
      <div key="type">
        <h3 className="text-xl font-semibold text-ink mb-5">Qué tipo de negocio es?</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {BUSINESS_TYPES.map((bt) => {
            const sel = onboardingData.businessType === bt.value;
            return (
              <button
                key={bt.value}
                onClick={() => setOnboardingData({ ...onboardingData, businessType: bt.value })}
                className={cx("p-4 text-left", optionClass(sel))}
              >
                <div className={cx("font-medium", sel ? "text-white" : "text-ink")}>{bt.label}</div>
                <div className={cx("text-xs mt-0.5", sel ? "text-white/70" : "text-ink-60")}>{bt.desc}</div>
              </button>
            );
          })}
        </div>
      </div>,
      <div key="country">
        <h3 className="text-xl font-semibold text-ink mb-2">En qué país operás principalmente?</h3>
        <p className="text-sm mb-5 text-ink-60">Para el calendario comercial y la moneda</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {COUNTRIES.map((c) => {
            const sel = onboardingData.country === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setOnboardingData({ ...onboardingData, country: c.value })}
                className={cx("p-3 text-center", optionClass(sel))}
              >
                <span className="text-2xl">{c.flag}</span>
                <div className={cx("text-sm font-medium mt-1", sel ? "text-white" : "text-ink-60")}>
                  {c.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>,
      <div key="sales">
        <h3 className="text-xl font-semibold text-ink mb-2">
          Dónde vendés?<AutoBadge field="salesChannels" />
        </h3>
        <p className="text-sm mb-5 text-ink-60">
          {autoDetected.salesChannels
            ? "Detectamos estos canales en tus integraciones activas."
            : "Podés elegir varios"}
        </p>
        <div className="flex flex-wrap gap-2">
          {SALES_CHANNELS.map((ch) => {
            const sel = onboardingData.salesChannels.includes(ch);
            return (
              <button
                key={ch}
                onClick={() =>
                  setOnboardingData({ ...onboardingData, salesChannels: toggleMultiSelect(onboardingData.salesChannels, ch) })
                }
                className={cx(
                  "px-4 py-2 rounded-full text-sm border transition-colors duration-150 ease-ent",
                  sel ? "bg-ink border-ink text-white font-medium" : "bg-white border-hairline-2 text-ink-60 hover:border-hairline"
                )}
              >
                {ch}
              </button>
            );
          })}
        </div>
      </div>,
      <div key="ads">
        <h3 className="text-xl font-semibold text-ink mb-2">
          Dónde hacés publicidad?<AutoBadge field="adChannels" />
        </h3>
        <p className="text-sm mb-5 text-ink-60">
          {autoDetected.adChannels
            ? "Detectamos estas plataformas en tus integraciones activas."
            : "Podés elegir varios"}
        </p>
        <div className="flex flex-wrap gap-2">
          {AD_CHANNELS.map((ch) => {
            const sel = onboardingData.adChannels.includes(ch);
            return (
              <button
                key={ch}
                onClick={() =>
                  setOnboardingData({
                    ...onboardingData,
                    adChannels:
                      ch === "Ninguno"
                        ? ["Ninguno"]
                        : toggleMultiSelect(onboardingData.adChannels.filter((c) => c !== "Ninguno"), ch),
                  })
                }
                className={cx(
                  "px-4 py-2 rounded-full text-sm border transition-colors duration-150 ease-ent",
                  sel ? "bg-ink border-ink text-white font-medium" : "bg-white border-hairline-2 text-ink-60 hover:border-hairline"
                )}
              >
                {ch}
              </button>
            );
          })}
        </div>
      </div>,
      <div key="stage">
        <h3 className="text-xl font-semibold text-ink mb-5">En qué etapa está tu negocio?</h3>
        <div className="grid grid-cols-3 gap-3">
          {STAGES.map((s) => {
            const sel = onboardingData.businessStage === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setOnboardingData({ ...onboardingData, businessStage: s.value })}
                className={cx("p-4 text-center", optionClass(sel))}
              >
                <div className={cx("font-medium", sel ? "text-white" : "text-ink")}>{s.label}</div>
                <div className={cx("text-xs mt-0.5", sel ? "text-white/70" : "text-ink-60")}>{s.desc}</div>
              </button>
            );
          })}
        </div>
      </div>,
    ];

    const canAdvance = [
      onboardingData.industry && (onboardingData.industry !== "otro" || onboardingData.customIndustry),
      onboardingData.businessType,
      onboardingData.country,
      onboardingData.salesChannels.length > 0,
      onboardingData.adChannels.length > 0,
      onboardingData.businessStage,
    ][onboardingStep];

    return (
      <div className={cx(canvasClass, "items-center justify-center")}>
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <AurumOrb size={64} />
            <h2 className="text-3xl font-medium mt-4 tracking-tight text-ink">
              Configurar Aurum
            </h2>
            <p className="text-sm mt-1 text-ink-60">
              Contanos sobre tu negocio para que Aurum te dé análisis personalizados
            </p>
          </div>

          <div className="flex gap-1.5 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={cx(
                  "h-[3px] flex-1 rounded-full transition-colors duration-500",
                  i <= onboardingStep ? "bg-ink" : "bg-hairline-2"
                )}
              />
            ))}
          </div>

          <div className="rounded-2xl p-7 mb-6 bg-elevated border border-hairline shadow-ent-xs">
            {steps[onboardingStep]}
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setOnboardingStep(Math.max(0, onboardingStep - 1))}
              className={cx(
                "px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ease-ent",
                onboardingStep === 0 ? "text-ink-40 cursor-not-allowed" : "text-ink-60 hover:text-ink"
              )}
              disabled={onboardingStep === 0}
            >
              ← Anterior
            </button>

            {onboardingStep < steps.length - 1 ? (
              <button
                onClick={() => setOnboardingStep(onboardingStep + 1)}
                disabled={!canAdvance}
                className={cx(
                  "px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-150 ease-ent",
                  canAdvance ? "bg-ink text-white hover:bg-ink/90" : "bg-surface-2 text-ink-40 cursor-not-allowed"
                )}
              >
                Siguiente →
              </button>
            ) : (
              <button
                onClick={submitOnboarding}
                disabled={!canAdvance || savingOnboarding}
                className={cx(
                  "px-7 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-150 ease-ent",
                  canAdvance && !savingOnboarding ? "bg-ink text-white hover:bg-ink/90" : "bg-surface-2 text-ink-40 cursor-not-allowed"
                )}
              >
                {savingOnboarding ? "Despertando Aurum..." : "Activar Aurum"}
              </button>
            )}
          </div>

          {onboardingError && (
            <div className="mt-4 p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">
              {onboardingError}
            </div>
          )}

          <p className="text-center text-xs mt-4 text-ink-40">
            Paso {onboardingStep + 1} de {steps.length} · Podés editarlo desde Sinapsis
          </p>
        </div>
      </div>
    );
  }

  // ══════ AURUM CHAT ══════
  const isEmpty = messages.length === 0;

  return (
    <div className={cx(canvasClass)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <AurumOrb size={40} thinking={loading} />
          <div>
            <h2 className="text-2xl font-medium tracking-tight leading-none text-ink">Aurum</h2>
            <div className="mt-1.5">
              <LivePulse status="LIVE" label="Inteligencia activa" />
            </div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-hairline">
          <span className="text-[10px] font-geistmono uppercase tracking-widest text-ink-40">
            Growth · Insights · Acciones
          </span>
        </div>
      </div>

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-2">
        {isEmpty && !loading && (
          <div className="flex flex-col items-center text-center mt-6 mb-8">
            {/* Pre-headline badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5 bg-surface border border-hairline">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-40" />
              <span className="text-[9px] font-geistmono uppercase tracking-[0.22em] text-ink-40">
                Intelligence Engine · v1
              </span>
            </div>

            <AurumOrb size={92} />

            <h3 className="text-3xl font-medium mt-5 tracking-tight text-ink" style={{ letterSpacing: "-0.01em" }}>
              Qué querés entender hoy?
            </h3>

            <CyclingHeadline />

            <p className="text-[13px] mt-4 max-w-md leading-relaxed text-ink-60">
              Accedo en tiempo real a ventas, ads, tráfico, clientes y productos. Cada respuesta
              trae diagnóstico, insights, oportunidades y plan de acción.
            </p>
          </div>
        )}

        <div className="space-y-5 pb-4">
          {messages.map((msg, i) => (
            <div key={i} className={cx("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <div className="flex gap-3 max-w-[88%]">
                  <div className="mt-1">
                    <AurumOrb size={32} />
                  </div>
                  <div className="rounded-2xl px-5 py-4 bg-elevated border border-hairline shadow-ent-xs">
                    <div className="text-[13.5px] leading-relaxed text-ink">
                      {renderContent(msg.content)}
                    </div>
                  </div>
                </div>
              )}
              {msg.role === "user" && (
                <div className="rounded-2xl px-4 py-3 max-w-[75%] text-[13.5px] leading-relaxed bg-ink text-white">
                  {msg.content}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-5 py-3 bg-elevated border border-hairline shadow-ent-xs">
                <AurumThinking />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggestions */}
      {isEmpty && !loading && (
        <div className="mb-4 flex-shrink-0">
          <p className="text-[10px] font-geistmono uppercase tracking-[0.2em] mb-3 text-ink-40">
            Análisis estratégicos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s.prompt)}
                className="group relative text-left rounded-xl px-4 py-3 transition-all duration-150 ease-ent bg-elevated border border-hairline shadow-ent-xs hover:border-hairline-2 hover:shadow-ent-soft"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink">{s.title}</div>
                    <div className="text-[11px] mt-0.5 text-ink-60">{s.subtitle}</div>
                  </div>
                  {/* Arrow appears on hover */}
                  <svg
                    className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-150 -translate-x-1 group-hover:translate-x-0 text-ink-40"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mode selector */}
      <div className="flex-shrink-0 mb-2 flex items-center justify-center gap-2">
        {MODES.map((m) => {
          const sel = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cx(
                "px-3 py-1.5 rounded-full text-[11px] font-geistmono uppercase tracking-wider border transition-colors duration-150 ease-ent",
                sel ? "bg-ink border-ink text-white" : "bg-white border-hairline-2 text-ink-60 hover:border-hairline"
              )}
              title={m.desc}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-2 rounded-2xl pl-5 pr-2 py-2 bg-elevated border border-hairline-2 focus-within:border-hairline transition-colors duration-150 ease-ent">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Preguntá lo que quieras entender de tu negocio..."
            className="flex-1 bg-transparent text-[14px] outline-none py-2 text-ink placeholder:text-ink-40"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className={cx(
              "rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors duration-150 ease-ent flex items-center gap-2",
              loading || !input.trim() ? "bg-surface-2 text-ink-40 cursor-not-allowed" : "bg-ink text-white hover:bg-ink/90"
            )}
          >
            <span>Enviar</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-center mt-2 text-ink-40">
          Aurum puede equivocarse. Verificá decisiones críticas con tus datos.
        </p>
      </div>
    </div>
  );
}
