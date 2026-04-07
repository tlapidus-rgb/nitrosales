"use client";

import { useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; content: string };
type ReasoningMode = "FLASH" | "CORE" | "DEEP";
type Confidence = "high" | "medium" | "low" | "none";

const MODES: Array<{
  key: ReasoningMode;
  label: string;
  desc: string;
  color: string;
}> = [
  { key: "FLASH", label: "Flash", desc: "Rápido · Haiku", color: "#60a5fa" },
  { key: "CORE", label: "Core", desc: "Default · Sonnet", color: "#fbbf24" },
  { key: "DEEP", label: "Deep", desc: "Profundo · Opus", color: "#a78bfa" },
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
  { value: "electronica", label: "Electr\u00f3nica & Tech", icon: "\u{1F4F1}" },
  { value: "alimentos", label: "Alimentos & Bebidas", icon: "\u{1F354}" },
  { value: "belleza", label: "Belleza & Cuidado Personal", icon: "\u{1F484}" },
  { value: "deportes", label: "Deportes & Fitness", icon: "\u{26BD}" },
  { value: "hogar", label: "Hogar & Deco", icon: "\u{1F3E0}" },
  { value: "otro", label: "Otro", icon: "\u{1F4E6}" },
];

const BUSINESS_TYPES = [
  { value: "Ecommerce puro", label: "Ecommerce puro", desc: "Solo venta online" },
  { value: "Omnichannel", label: "Omnichannel", desc: "Tiendas f\u00edsicas + online" },
  { value: "Marketplace", label: "Marketplace", desc: "MercadoLibre, Amazon, etc." },
  { value: "Mayorista", label: "Mayorista", desc: "Venta B2B" },
];

const COUNTRIES = [
  { value: "argentina", label: "Argentina", flag: "\u{1F1E6}\u{1F1F7}" },
  { value: "mexico", label: "M\u00e9xico", flag: "\u{1F1F2}\u{1F1FD}" },
  { value: "colombia", label: "Colombia", flag: "\u{1F1E8}\u{1F1F4}" },
  { value: "chile", label: "Chile", flag: "\u{1F1E8}\u{1F1F1}" },
  { value: "otro", label: "Otro", flag: "\u{1F30E}" },
];

const SALES_CHANNELS = ["Tienda propia", "MercadoLibre", "Tienda Nube", "VTEX", "Shopify", "Otros marketplaces"];
const AD_CHANNELS = ["Google Ads", "Meta Ads", "TikTok Ads", "MercadoLibre Ads", "Ninguno"];
const STAGES = [
  { value: "starting", label: "Reci\u00e9n arrancando", desc: "< 6 meses" },
  { value: "growth", label: "En crecimiento", desc: "6 meses - 2 a\u00f1os" },
  { value: "established", label: "Establecido", desc: "> 2 a\u00f1os" },
];

// ══════ Aurum Orb: breathing golden sphere ══════
function AurumOrb({ size = 40, thinking = false }: { size?: number; thinking?: boolean }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {thinking && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(251,191,36,0.35) 0%, transparent 70%)",
            animation: "aurumPulseRing 2.2s ease-in-out infinite",
          }}
        />
      )}
      <div
        className="absolute inset-[15%] rounded-full"
        style={{
          background: "radial-gradient(circle at 35% 30%, #fef3c7 0%, #fde68a 20%, #fbbf24 45%, #d97706 100%)",
          boxShadow:
            "0 0 20px rgba(251,191,36,0.5), 0 0 40px rgba(251,191,36,0.25), inset -2px -4px 8px rgba(120,53,15,0.35), inset 2px 3px 6px rgba(254,243,199,0.6)",
          animation: "aurumBreath 3.5s ease-in-out infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: "22%",
          left: "25%",
          width: "22%",
          height: "18%",
          background: "radial-gradient(circle, rgba(255,255,255,0.85) 0%, transparent 70%)",
          filter: "blur(1px)",
        }}
      />
      {thinking && (
        <>
          <div className="absolute inset-0" style={{ animation: "aurumOrbit 3.8s linear infinite" }}>
            <div
              className="absolute rounded-full"
              style={{
                top: "-2px",
                left: "50%",
                width: "3px",
                height: "3px",
                background: "#fde68a",
                boxShadow: "0 0 8px rgba(251,191,36,0.9)",
                transform: "translateX(-50%)",
              }}
            />
          </div>
          <div className="absolute inset-0" style={{ animation: "aurumOrbit 2.6s linear infinite reverse" }}>
            <div
              className="absolute rounded-full"
              style={{
                bottom: "0px",
                right: "10%",
                width: "2px",
                height: "2px",
                background: "#fef3c7",
                boxShadow: "0 0 6px rgba(253,224,71,0.9)",
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

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
          className="absolute inset-0 text-[11px] font-mono uppercase tracking-[0.2em] text-center transition-all duration-700"
          style={{
            color: "#fbbf24",
            opacity: i === idx ? 0.85 : 0,
            transform: i === idx ? "translateY(0)" : "translateY(6px)",
            textShadow: "0 0 14px rgba(251,191,36,0.35)",
          }}
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
        <div
          key={idx}
          className="text-sm font-medium"
          style={{
            color: "#fde68a",
            animation: "aurumFadeUp 500ms cubic-bezier(0.16,1,0.3,1)",
            textShadow: "0 0 20px rgba(251,191,36,0.3)",
          }}
        >
          {THINKING_STATES[idx]}
          <span className="ml-1 opacity-70">...</span>
        </div>
        <div className="mt-1 flex gap-1">
          {THINKING_STATES.map((_, i) => (
            <div
              key={i}
              className="h-[2px] rounded-full transition-all duration-500"
              style={{
                width: i === idx ? 18 : 6,
                background: i <= idx ? "#fbbf24" : "rgba(251,191,36,0.15)",
                boxShadow: i === idx ? "0 0 8px rgba(251,191,36,0.6)" : "none",
              }}
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
            <strong key={j} className="font-semibold" style={{ color: "#fde68a" }}>
              {p.slice(2, -2)}
            </strong>
          );
        return <span key={j}>{p}</span>;
      });
      if (line.startsWith("### "))
        return (
          <h4 key={i} className="font-bold text-sm mt-4 mb-1.5" style={{ color: "#fcd34d" }}>
            {line.replace("### ", "")}
          </h4>
        );
      if (line.startsWith("## "))
        return (
          <h3 key={i} className="font-bold text-base mt-5 mb-2" style={{ color: "#fbbf24" }}>
            {line.replace("## ", "")}
          </h3>
        );
      if (line.startsWith("---"))
        return <hr key={i} className="my-3" style={{ borderColor: "rgba(251,191,36,0.15)" }} />;
      if (line.trim().startsWith("- ") || line.trim().startsWith("• "))
        return (
          <div key={i} className="flex gap-2 my-0.5">
            <span style={{ color: "#fbbf24" }}>•</span>
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

  const aurumCanvas: React.CSSProperties = {
    background:
      "radial-gradient(ellipse at top, rgba(251,191,36,0.06) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(217,119,6,0.04) 0%, transparent 60%), linear-gradient(180deg, #0a0a0f 0%, #0f0d14 50%, #0a0a0f 100%)",
    height: "100%",
    width: "100%",
    padding: "1.5rem 2rem",
    overflow: "hidden",
  };

  if (checkingOnboarding) {
    return (
      <div style={aurumCanvas} className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <AurumOrb size={56} thinking />
          <div className="text-sm font-medium" style={{ color: "#fde68a" }}>
            Despertando a Aurum
          </div>
        </div>
      </div>
    );
  }

  // ══════ ONBOARDING WIZARD ══════
  if (needsOnboarding) {
    const optionButton = (sel: boolean): React.CSSProperties => ({
      background: sel
        ? "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.05))"
        : "rgba(255,255,255,0.02)",
      border: sel ? "1px solid rgba(251,191,36,0.5)" : "1px solid rgba(255,255,255,0.08)",
      boxShadow: sel ? "0 0 20px rgba(251,191,36,0.15)" : "none",
    });

    const AutoBadge = ({ field }: { field: string }) => {
      const conf = autoDetected[field];
      if (!conf || conf === "none") return null;
      return (
        <span
          className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider align-middle"
          style={{
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "#86efac",
          }}
          title={`Auto-detectado con confianza ${conf}`}
        >
          ✓ Auto
        </span>
      );
    };

    const steps = [
      <div key="industry">
        <h3 className="text-xl font-bold text-white mb-2">
          En qué rubro está tu negocio?<AutoBadge field="industry" />
        </h3>
        <p className="text-sm mb-5" style={{ color: "#9ca3af" }}>
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
                className="p-3 rounded-xl text-left transition-all duration-300"
                style={optionButton(sel)}
              >
                <span className="text-2xl">{ind.icon}</span>
                <div className="text-sm font-medium mt-1" style={{ color: sel ? "#fde68a" : "#d1d5db" }}>
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
            className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm outline-none transition"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(251,191,36,0.3)",
              color: "white",
            }}
          />
        )}
      </div>,
      <div key="type">
        <h3 className="text-xl font-bold text-white mb-5">Qué tipo de negocio es?</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {BUSINESS_TYPES.map((bt) => {
            const sel = onboardingData.businessType === bt.value;
            return (
              <button
                key={bt.value}
                onClick={() => setOnboardingData({ ...onboardingData, businessType: bt.value })}
                className="p-4 rounded-xl text-left transition-all duration-300"
                style={optionButton(sel)}
              >
                <div className="font-medium" style={{ color: sel ? "#fde68a" : "#e5e7eb" }}>{bt.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{bt.desc}</div>
              </button>
            );
          })}
        </div>
      </div>,
      <div key="country">
        <h3 className="text-xl font-bold text-white mb-2">En qué país operás principalmente?</h3>
        <p className="text-sm mb-5" style={{ color: "#9ca3af" }}>Para el calendario comercial y la moneda</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {COUNTRIES.map((c) => {
            const sel = onboardingData.country === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setOnboardingData({ ...onboardingData, country: c.value })}
                className="p-3 rounded-xl text-center transition-all duration-300"
                style={optionButton(sel)}
              >
                <span className="text-2xl">{c.flag}</span>
                <div className="text-sm font-medium mt-1" style={{ color: sel ? "#fde68a" : "#d1d5db" }}>
                  {c.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>,
      <div key="sales">
        <h3 className="text-xl font-bold text-white mb-2">
          Dónde vendés?<AutoBadge field="salesChannels" />
        </h3>
        <p className="text-sm mb-5" style={{ color: "#9ca3af" }}>
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
                className="px-4 py-2 rounded-full text-sm transition-all duration-300"
                style={{
                  ...optionButton(sel),
                  color: sel ? "#fde68a" : "#d1d5db",
                  fontWeight: sel ? 500 : 400,
                }}
              >
                {ch}
              </button>
            );
          })}
        </div>
      </div>,
      <div key="ads">
        <h3 className="text-xl font-bold text-white mb-2">
          Dónde hacés publicidad?<AutoBadge field="adChannels" />
        </h3>
        <p className="text-sm mb-5" style={{ color: "#9ca3af" }}>
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
                className="px-4 py-2 rounded-full text-sm transition-all duration-300"
                style={{
                  ...optionButton(sel),
                  color: sel ? "#fde68a" : "#d1d5db",
                  fontWeight: sel ? 500 : 400,
                }}
              >
                {ch}
              </button>
            );
          })}
        </div>
      </div>,
      <div key="stage">
        <h3 className="text-xl font-bold text-white mb-5">En qué etapa está tu negocio?</h3>
        <div className="grid grid-cols-3 gap-3">
          {STAGES.map((s) => {
            const sel = onboardingData.businessStage === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setOnboardingData({ ...onboardingData, businessStage: s.value })}
                className="p-4 rounded-xl text-center transition-all duration-300"
                style={optionButton(sel)}
              >
                <div className="font-medium" style={{ color: sel ? "#fde68a" : "#e5e7eb" }}>{s.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{s.desc}</div>
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
      <div style={aurumCanvas} className="flex flex-col items-center justify-center">
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <AurumOrb size={64} />
            <h2
              className="text-3xl font-bold mt-4 tracking-tight"
              style={{
                background: "linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #d97706 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Configurar Aurum
            </h2>
            <p className="text-sm mt-1" style={{ color: "#9ca3af" }}>
              Contanos sobre tu negocio para que Aurum te dé análisis personalizados
            </p>
          </div>

          <div className="flex gap-1.5 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className="h-[3px] flex-1 rounded-full transition-all duration-500"
                style={{
                  background:
                    i <= onboardingStep
                      ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
                      : "rgba(255,255,255,0.08)",
                  boxShadow: i === onboardingStep ? "0 0 10px rgba(251,191,36,0.5)" : "none",
                }}
              />
            ))}
          </div>

          <div
            className="rounded-2xl p-7 mb-6 relative overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
              border: "1px solid rgba(251,191,36,0.15)",
              boxShadow: "0 0 40px rgba(251,191,36,0.06), inset 0 1px 0 rgba(253,224,71,0.08)",
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.4), transparent)" }}
            />
            {steps[onboardingStep]}
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setOnboardingStep(Math.max(0, onboardingStep - 1))}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300"
              style={{
                color: onboardingStep === 0 ? "rgba(255,255,255,0.2)" : "#9ca3af",
                cursor: onboardingStep === 0 ? "not-allowed" : "pointer",
              }}
              disabled={onboardingStep === 0}
            >
              ← Anterior
            </button>

            {onboardingStep < steps.length - 1 ? (
              <button
                onClick={() => setOnboardingStep(onboardingStep + 1)}
                disabled={!canAdvance}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300"
                style={{
                  background: canAdvance ? "linear-gradient(135deg, #fbbf24, #d97706)" : "rgba(255,255,255,0.04)",
                  color: canAdvance ? "#1a0f00" : "rgba(255,255,255,0.25)",
                  boxShadow: canAdvance ? "0 0 25px rgba(251,191,36,0.35)" : "none",
                  cursor: canAdvance ? "pointer" : "not-allowed",
                }}
              >
                Siguiente →
              </button>
            ) : (
              <button
                onClick={submitOnboarding}
                disabled={!canAdvance || savingOnboarding}
                className="px-7 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300"
                style={{
                  background:
                    canAdvance && !savingOnboarding
                      ? "linear-gradient(135deg, #fbbf24, #d97706)"
                      : "rgba(255,255,255,0.04)",
                  color: canAdvance && !savingOnboarding ? "#1a0f00" : "rgba(255,255,255,0.25)",
                  boxShadow: canAdvance && !savingOnboarding ? "0 0 30px rgba(251,191,36,0.45)" : "none",
                  cursor: canAdvance && !savingOnboarding ? "pointer" : "not-allowed",
                }}
              >
                {savingOnboarding ? "Despertando Aurum..." : "✨ Activar Aurum"}
              </button>
            )}
          </div>

          {onboardingError && (
            <div
              className="mt-4 p-3 rounded-lg text-sm"
              style={{
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.25)",
                color: "#fca5a5",
              }}
            >
              {onboardingError}
            </div>
          )}

          <p className="text-center text-xs mt-4" style={{ color: "#6b7280" }}>
            Paso {onboardingStep + 1} de {steps.length} · Podés editarlo desde Sinapsis
          </p>
        </div>
      </div>
    );
  }

  // ══════ AURUM CHAT ══════
  const isEmpty = messages.length === 0;

  return (
    <div style={aurumCanvas} className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <AurumOrb size={40} thinking={loading} />
          <div>
            <h2
              className="text-2xl font-bold tracking-tight leading-none"
              style={{
                background: "linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #d97706 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Aurum
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#fbbf24", boxShadow: "0 0 8px rgba(251,191,36,0.8)" }}
              />
              <span className="text-[11px] font-mono uppercase tracking-[0.15em]" style={{ color: "#fbbf24" }}>
                Inteligencia activa
              </span>
            </div>
          </div>
        </div>
        <div
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.18)",
          }}
        >
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#fde68a" }}>
            Growth · Insights · Acciones
          </span>
        </div>
      </div>

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-2">
        {isEmpty && !loading && (
          <div
            className="flex flex-col items-center text-center mt-6 mb-8 relative"
            style={{ animation: "aurumFadeUp 600ms cubic-bezier(0.16,1,0.3,1)" }}
          >
            {/* Outer halo */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[280px] h-[280px] pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(251,191,36,0.10) 0%, rgba(251,191,36,0.04) 30%, transparent 65%)",
                animation: "aurumPulseRing 5s ease-in-out infinite",
              }}
            />
            {/* Pre-headline badge */}
            <div
              className="relative inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5"
              style={{
                background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.02))",
                border: "1px solid rgba(251,191,36,0.28)",
                boxShadow: "0 0 18px rgba(251,191,36,0.10)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#fbbf24", boxShadow: "0 0 8px rgba(251,191,36,0.9)", animation: "aurumBreath 2.4s ease-in-out infinite" }}
              />
              <span className="text-[9px] font-mono uppercase tracking-[0.22em]" style={{ color: "#fde68a" }}>
                Intelligence Engine · v1
              </span>
            </div>

            <div className="relative" style={{ animation: "aurumFloat 4s ease-in-out infinite" }}>
              <AurumOrb size={92} />
            </div>

            <h3
              className="text-3xl font-bold mt-5 tracking-tight"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #fef3c7 50%, #fbbf24 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.01em",
              }}
            >
              Qué querés entender hoy?
            </h3>

            <CyclingHeadline />

            <p className="text-[13px] mt-4 max-w-md leading-relaxed" style={{ color: "#9ca3af" }}>
              Accedo en tiempo real a ventas, ads, tráfico, clientes y productos. Cada respuesta
              trae diagnóstico, insights, oportunidades y plan de acción.
            </p>
          </div>
        )}

        <div className="space-y-5 pb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              style={{ animation: "aurumFadeUp 500ms cubic-bezier(0.16,1,0.3,1)" }}
            >
              {msg.role === "assistant" && (
                <div className="flex gap-3 max-w-[88%]">
                  <div className="mt-1">
                    <AurumOrb size={32} />
                  </div>
                  <div
                    className="relative rounded-2xl px-5 py-4"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))",
                      border: "1px solid rgba(251,191,36,0.18)",
                      boxShadow:
                        "0 4px 30px rgba(0,0,0,0.4), 0 0 25px rgba(251,191,36,0.06), inset 0 1px 0 rgba(253,224,71,0.08)",
                    }}
                  >
                    <div
                      className="absolute top-0 left-4 right-4 h-[1px]"
                      style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.5), transparent)" }}
                    />
                    <div className="text-[13.5px] leading-relaxed" style={{ color: "#e5e7eb" }}>
                      {renderContent(msg.content)}
                    </div>
                  </div>
                </div>
              )}
              {msg.role === "user" && (
                <div
                  className="rounded-2xl px-4 py-3 max-w-[75%] text-[13.5px] leading-relaxed"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#f3f4f6",
                  }}
                >
                  {msg.content}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div
              className="flex justify-start"
              style={{ animation: "aurumFadeUp 400ms cubic-bezier(0.16,1,0.3,1)" }}
            >
              <div
                className="rounded-2xl px-5 py-3"
                style={{
                  background: "linear-gradient(180deg, rgba(251,191,36,0.04), rgba(251,191,36,0.01))",
                  border: "1px solid rgba(251,191,36,0.22)",
                  boxShadow: "0 0 25px rgba(251,191,36,0.08)",
                }}
              >
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
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] mb-3" style={{ color: "#fbbf24" }}>
            Análisis estratégicos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s.prompt)}
                className="group relative text-left rounded-xl px-4 py-3 transition-all duration-500 overflow-hidden"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008))",
                  border: "1px solid rgba(255,255,255,0.06)",
                  animation: `aurumFadeUp 500ms cubic-bezier(0.16,1,0.3,1) ${i * 60}ms both`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(251,191,36,0.10), rgba(245,158,11,0.02))";
                  e.currentTarget.style.borderColor = "rgba(251,191,36,0.45)";
                  e.currentTarget.style.boxShadow = "0 0 28px rgba(251,191,36,0.14), inset 0 1px 0 rgba(253,224,71,0.10)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008))";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Top gold accent line — appears on hover */}
                <div
                  className="absolute top-0 left-3 right-3 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.7), transparent)" }}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{s.title}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "#9ca3af" }}>{s.subtitle}</div>
                  </div>
                  {/* Arrow appears on hover */}
                  <svg
                    className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-1 group-hover:translate-x-0"
                    style={{ color: "#fbbf24" }}
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
              className="px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all duration-300"
              style={{
                background: sel
                  ? `linear-gradient(135deg, ${m.color}22, ${m.color}08)`
                  : "rgba(255,255,255,0.02)",
                border: sel
                  ? `1px solid ${m.color}99`
                  : "1px solid rgba(255,255,255,0.08)",
                color: sel ? m.color : "#9ca3af",
                boxShadow: sel ? `0 0 18px ${m.color}33` : "none",
              }}
              title={m.desc}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex-shrink-0">
        <div
          className="flex items-center gap-2 rounded-2xl pl-5 pr-2 py-2 transition-all duration-500"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
            border: "1px solid rgba(251,191,36,0.25)",
            boxShadow: "0 0 30px rgba(251,191,36,0.08), inset 0 1px 0 rgba(253,224,71,0.06)",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Preguntá lo que quieras entender de tu negocio..."
            className="flex-1 bg-transparent text-[14px] outline-none py-2"
            style={{ color: "#f3f4f6" }}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-300 flex items-center gap-2"
            style={{
              background:
                loading || !input.trim()
                  ? "rgba(255,255,255,0.04)"
                  : "linear-gradient(135deg, #fbbf24, #d97706)",
              color: loading || !input.trim() ? "rgba(255,255,255,0.3)" : "#1a0f00",
              boxShadow: loading || !input.trim() ? "none" : "0 0 25px rgba(251,191,36,0.4)",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            }}
          >
            <span>Enviar</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-center mt-2" style={{ color: "#6b7280" }}>
          Aurum puede equivocarse. Verificá decisiones críticas con tus datos.
        </p>
      </div>
    </div>
  );
}
