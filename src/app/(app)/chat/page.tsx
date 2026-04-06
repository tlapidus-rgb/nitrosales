"use client";

import { useSession } from "next-auth/react";
import { useState, useRef, useEffect, useCallback } from "react";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Haceme una auditoria completa del negocio",
  "Donde esta el mayor cuello de botella de conversion?",
  "Que campanas deberia pausar y cuales escalar?",
  "Analiza los unit economics: CAC, LTV, ticket promedio",
  "Dame 5 oportunidades de crecimiento que no estoy viendo",
  "Como redistribuyo el budget entre Google y Meta?",
  "Que productos son heroes y cuales deberia discontinuar?",
  "Auditoria de trafico: calidad de fuentes y conversion por device",
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

const SALES_CHANNELS = [
  "Tienda propia", "MercadoLibre", "Tienda Nube", "VTEX", "Shopify", "Otros marketplaces",
];

const AD_CHANNELS = [
  "Google Ads", "Meta Ads", "TikTok Ads", "MercadoLibre Ads", "Ninguno",
];

const STAGES = [
  { value: "starting", label: "Reci\u00e9n arrancando", desc: "< 6 meses" },
  { value: "growth", label: "En crecimiento", desc: "6 meses - 2 a\u00f1os" },
  { value: "established", label: "Establecido", desc: "> 2 a\u00f1os" },
];

export default function ChatPage() {
  const { data: session } = useSession();
  // Onboarding state
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState({
    industry: "",
    customIndustry: "",
    businessType: "",
    country: "",
    salesChannels: [] as string[],
    adChannels: [] as string[],
    businessStage: "",
  });

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Soy NitroBot, tu equipo de growth en una sola herramienta. Tengo acceso en tiempo real a tus datos de ventas, publicidad (Google + Meta), trafico web, funnel de conversion, clientes y productos.\n\nCada respuesta incluye: Diagnostico + Insights + Oportunidades + Plan de accion.\n\nElegi una pregunta o haceme la tuya.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Check if onboarding is needed
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/onboarding");
        const data = await res.json();
        setNeedsOnboarding(!data.businessContext);
      } catch {
        setNeedsOnboarding(false);
      }
      setCheckingOnboarding(false);
    }
    check();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleMultiSelect = (arr: string[], value: string) => {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  };

  const submitOnboarding = async () => {
    setSavingOnboarding(true);
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
      const data = await res.json();
      if (data.success) {
        setNeedsOnboarding(false);
      }
    } catch (err) {
      console.error("Onboarding error:", err);
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
        body: JSON.stringify({ message: userMsg, history: updated.slice(1, -1) }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || data.error || "Error" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexion." },
      ]);
    }
    setLoading(false);
  };

  function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return (
            <strong key={j} className="font-semibold">
              {p.slice(2, -2)}
            </strong>
          );
        return p;
      });
      if (line.startsWith("### "))
        return (
          <h4 key={i} className="font-bold text-sm mt-3 mb-1">
            {line.replace("### ", "")}
          </h4>
        );
      if (line.startsWith("## "))
        return (
          <h3 key={i} className="font-bold mt-4 mb-1">
            {line.replace("## ", "")}
          </h3>
        );
      if (line.startsWith("---")) return <hr key={i} className="my-2 border-gray-200" />;
      return (
        <span key={i}>
          {i > 0 && <br />}
          {parts}
        </span>
      );
    });
  }

  // ── Loading state ──
  if (checkingOnboarding) {
    return (
      <div className="light-canvas min-h-screen flex items-center justify-center" style={{ height: "calc(100vh - 64px)" }}>
        <div className="text-gray-400 text-sm">Cargando NitroBot...</div>
      </div>
    );
  }

  // ── Onboarding Wizard ──
  if (needsOnboarding) {
    const steps = [
      // Step 0: Industry
      <div key="industry">
        <h3 className="text-lg font-bold text-gray-800 mb-2">¿En qué rubro está tu negocio?</h3>
        <p className="text-sm text-gray-500 mb-4">Esto nos ayuda a entender tu estacionalidad y benchmarks</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind.value}
              onClick={() => setOnboardingData({ ...onboardingData, industry: ind.value })}
              className={`p-3 rounded-xl border text-left transition ${
                onboardingData.industry === ind.value
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className="text-2xl">{ind.icon}</span>
              <div className="text-sm font-medium text-gray-700 mt-1">{ind.label}</div>
            </button>
          ))}
        </div>
        {onboardingData.industry === "otro" && (
          <input
            type="text"
            placeholder="Describí tu rubro..."
            value={onboardingData.customIndustry}
            onChange={(e) => setOnboardingData({ ...onboardingData, customIndustry: e.target.value })}
            className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        )}
      </div>,
      // Step 1: Business type
      <div key="type">
        <h3 className="text-lg font-bold text-gray-800 mb-2">¿Qué tipo de negocio es?</h3>
        <div className="grid grid-cols-2 gap-2">
          {BUSINESS_TYPES.map((bt) => (
            <button
              key={bt.value}
              onClick={() => setOnboardingData({ ...onboardingData, businessType: bt.value })}
              className={`p-4 rounded-xl border text-left transition ${
                onboardingData.businessType === bt.value
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="font-medium text-gray-700">{bt.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{bt.desc}</div>
            </button>
          ))}
        </div>
      </div>,
      // Step 2: Country
      <div key="country">
        <h3 className="text-lg font-bold text-gray-800 mb-2">¿En qué país operás principalmente?</h3>
        <p className="text-sm text-gray-500 mb-4">Para adaptar el calendario comercial y la moneda</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {COUNTRIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setOnboardingData({ ...onboardingData, country: c.value })}
              className={`p-3 rounded-xl border text-center transition ${
                onboardingData.country === c.value
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className="text-2xl">{c.flag}</span>
              <div className="text-sm font-medium text-gray-700 mt-1">{c.label}</div>
            </button>
          ))}
        </div>
      </div>,
      // Step 3: Sales channels
      <div key="sales">
        <h3 className="text-lg font-bold text-gray-800 mb-2">¿Dónde vendés?</h3>
        <p className="text-sm text-gray-500 mb-4">Podés elegir varios</p>
        <div className="flex flex-wrap gap-2">
          {SALES_CHANNELS.map((ch) => (
            <button
              key={ch}
              onClick={() =>
                setOnboardingData({
                  ...onboardingData,
                  salesChannels: toggleMultiSelect(onboardingData.salesChannels, ch),
                })
              }
              className={`px-4 py-2 rounded-full border text-sm transition ${
                onboardingData.salesChannels.includes(ch)
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {onboardingData.salesChannels.includes(ch) ? "\u{2705} " : ""}{ch}
            </button>
          ))}
        </div>
      </div>,
      // Step 4: Ad channels
      <div key="ads">
        <h3 className="text-lg font-bold text-gray-800 mb-2">¿Dónde haces publicidad?</h3>
        <p className="text-sm text-gray-500 mb-4">Podés elegir varios</p>
        <div className="flex flex-wrap gap-2">
          {AD_CHANNELS.map((ch) => (
            <button
              key={ch}
              onClick={() =>
                setOnboardingData({
                  ...onboardingData,
                  adChannels: ch === "Ninguno"
                    ? ["Ninguno"]
                    : toggleMultiSelect(
                        onboardingData.adChannels.filter((c) => c !== "Ninguno"),
                        ch
                      ),
                })
              }
              className={`px-4 py-2 rounded-full border text-sm transition ${
                onboardingData.adChannels.includes(ch)
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {onboardingData.adChannels.includes(ch) ? "\u{2705} " : ""}{ch}
            </button>
          ))}
        </div>
      </div>,
      // Step 5: Business stage
      <div key="stage">
        <h3 className="text-lg font-bold text-gray-800 mb-2">¿En qué etapa está tu negocio?</h3>
        <div className="grid grid-cols-3 gap-3">
          {STAGES.map((s) => (
            <button
              key={s.value}
              onClick={() => setOnboardingData({ ...onboardingData, businessStage: s.value })}
              className={`p-4 rounded-xl border text-center transition ${
                onboardingData.businessStage === s.value
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="font-medium text-gray-700">{s.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
            </button>
          ))}
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
      <div className="light-canvas min-h-screen flex flex-col items-center justify-center" style={{ height: "calc(100vh - 64px)" }}>
        <div className="w-full max-w-2xl px-4">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-indigo-600 mb-1">Configurar NitroBot</h2>
            <p className="text-gray-500 text-sm">
              Contanos sobre tu negocio para que NitroBot te dé análisis personalizados
            </p>
          </div>

          {/* Progress */}
          <div className="flex gap-1 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition ${
                  i <= onboardingStep ? "bg-indigo-500" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            {steps[onboardingStep]}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={() => setOnboardingStep(Math.max(0, onboardingStep - 1))}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition ${
                onboardingStep === 0
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              disabled={onboardingStep === 0}
            >
              Anterior
            </button>

            {onboardingStep < steps.length - 1 ? (
              <button
                onClick={() => setOnboardingStep(onboardingStep + 1)}
                disabled={!canAdvance}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            ) : (
              <button
                onClick={submitOnboarding}
                disabled={!canAdvance || savingOnboarding}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40"
              >
                {savingOnboarding ? "Configurando NitroBot..." : "Empezar a usar NitroBot"}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            Paso {onboardingStep + 1} de {steps.length} · Podés cambiar esto después desde Memoria del Bot
          </p>
        </div>
      </div>
    );
  }

  // ── Normal Chat ──
  return (
    <div className="light-canvas min-h-screen flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-indigo-600">NitroBot</h2>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            Growth AI
          </span>
        </div>
        <p className="text-gray-500 text-sm">Tu equipo de growth con IA</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-xl px-5 py-4 ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200 text-gray-800 shadow-sm"
              }`}
            >
              <div className="text-sm leading-relaxed">{renderContent(msg.content)}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-sm text-gray-400">Analizando metricas en profundidad...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 2 && !loading && (
        <div className="mb-4">
          <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
            Analisis estrategicos
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s)}
                className="text-left text-xs bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Pregunta estrategica..."
            className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
