"use client";

import { useEffect, useState, useRef } from "react";

interface Insight {
  type: "ALERT" | "OPPORTUNITY" | "TREND";
  title: string;
  description: string;
  action: string;
}

type Message = { role: "user" | "assistant"; content: string };

const TYPE_CONFIG: Record<
  string,
  { icon: string; color: string; bg: string; border: string; label: string }
> = {
  ALERT: {
    icon: "\u26A0\uFE0F",
    color: "#FF5E5E",
    bg: "rgba(255, 94, 94, 0.06)",
    border: "rgba(255, 94, 94, 0.2)",
    label: "Alerta",
  },
  OPPORTUNITY: {
    icon: "\uD83D\uDCA1",
    color: "#FFB800",
    bg: "rgba(255, 184, 0, 0.06)",
    border: "rgba(255, 184, 0, 0.2)",
    label: "Oportunidad",
  },
  TREND: {
    icon: "\uD83D\uDCC8",
    color: "#4ADE80",
    bg: "rgba(74, 222, 128, 0.06)",
    border: "rgba(74, 222, 128, 0.2)",
    label: "Tendencia",
  },
};

const SECTION_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  products: "Productos",
  campaigns: "Campanas",
  customers: "Clientes",
};

export default function NitroInsightsPanel({
  section,
}: {
  section: "dashboard" | "products" | "campaigns" | "customers";
}) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch("/api/insights?section=" + section)
      .then((r) => r.json())
      .then((data) => {
        if (data.insights && data.insights.length > 0) {
          setInsights(data.insights.slice(0, 3));
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [section]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || chatLoading) return;
    setInput("");
    const updated: Message[] = [
      ...messages,
      { role: "user", content: userMsg },
    ];
    setMessages(updated);
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            "[Contexto: el usuario esta en la seccion de " +
            SECTION_LABELS[section] +
            " y pregunta sobre esos datos] " +
            userMsg,
          history: updated.slice(-10),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "Error al responder." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexion." },
      ]);
    }
    setChatLoading(false);
  };

  function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return (
            <strong key={j} className="font-semibold text-white">
              {p.slice(2, -2)}
            </strong>
          );
        return p;
      });
      if (line.startsWith("### "))
        return (
          <h4 key={i} className="font-bold text-sm mt-3 mb-1 text-white">
            {line.replace("### ", "")}
          </h4>
        );
      if (line.startsWith("## "))
        return (
          <h3 key={i} className="font-bold mt-4 mb-1 text-white">
            {line.replace("## ", "")}
          </h3>
        );
      if (line.startsWith("---"))
        return <hr key={i} className="my-2 border-nitro-border" />;
      return (
        <span key={i}>
          {i > 0 && <br />}
          {parts}
        </span>
      );
    });
  }

  return (
    <div className="mt-8 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
      {/* ── AI Panel ─────────────────────────────────────── */}
      <div
        className="nitro-card rounded-[16px] border overflow-hidden"
        style={{
          background: "#161616",
          borderColor: "rgba(255, 94, 26, 0.3)",
          boxShadow: "0 0 80px rgba(255, 94, 26, 0.08)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: "rgba(255, 94, 26, 0.15)", background: "rgba(255, 94, 26, 0.03)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
              style={{ background: "var(--nitro-gradient)" }}
            >
              <span className="text-sm">{"\uD83E\uDD16"}</span>
            </div>
            <h3 className="font-semibold text-white">NitroAI</h3>
            <span
              className="badge-nitro text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5"
              style={{
                background: "rgba(255, 94, 26, 0.1)",
                border: "1px solid rgba(255, 94, 26, 0.2)",
                color: "#FF5E1A",
              }}
            >
              <span className="w-1 h-1 rounded-full bg-nitro-green animate-pulse-live" />
              Insights de {SECTION_LABELS[section]}
            </span>
          </div>
          {!loading && !error && (
            <button
              onClick={() => {
                setLoading(true);
                fetch("/api/insights?section=" + section)
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.insights) setInsights(data.insights.slice(0, 3));
                  })
                  .catch(() => {})
                  .finally(() => setLoading(false));
              }}
              className="text-xs text-nitro-muted hover:text-nitro-orange transition-colors duration-300 font-mono uppercase tracking-wider"
            >
              {"\u21BB"} Regenerar
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-nitro-border p-4"
                  style={{ background: "#111111" }}
                >
                  <div className="h-4 animate-shimmer rounded w-2/3 mb-3" />
                  <div className="h-3 animate-shimmer rounded w-full mb-2" />
                  <div className="h-3 animate-shimmer rounded w-4/5 mb-4" />
                  <div className="h-3 rounded w-3/4" style={{ background: "rgba(255, 94, 26, 0.1)" }} />
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-nitro-muted text-center py-4">
              No se pudieron cargar los insights. Intenta recargar.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
              {insights.map((insight, idx) => {
                const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.TREND;
                return (
                  <div
                    key={idx}
                    className="rounded-xl border p-4 transition-all duration-300 ease-nitro hover:translate-y-[-2px]"
                    style={{
                      background: config.bg,
                      borderColor: config.border,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{config.icon}</span>
                      <span
                        className="font-mono text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: config.color }}
                      >
                        {config.label}
                      </span>
                    </div>
                    <h4 className="font-semibold text-white text-sm mb-2">
                      {insight.title}
                    </h4>
                    <p className="text-xs text-nitro-text2 mb-3 leading-relaxed">
                      {insight.description}
                    </p>
                    <div
                      className="text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                      style={{
                        background: "rgba(74, 222, 128, 0.08)",
                        border: "1px solid rgba(74, 222, 128, 0.2)",
                        color: "#4ADE80",
                      }}
                    >
                      {"\u2192"} {insight.action}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Mini-chat section ──────────────────────────── */}
          <div className="mt-4">
            {!chatOpen ? (
              <button
                onClick={() => setChatOpen(true)}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm transition-all duration-300 ease-nitro"
                style={{
                  background: "rgba(255, 94, 26, 0.05)",
                  border: "1px solid rgba(255, 94, 26, 0.15)",
                  color: "#FF5E1A",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "rgba(255, 94, 26, 0.1)";
                  e.currentTarget.style.borderColor = "rgba(255, 94, 26, 0.3)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "rgba(255, 94, 26, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(255, 94, 26, 0.15)";
                }}
              >
                <span>{"\uD83D\uDCAC"}</span>
                <span>
                  Preguntale mas a NitroAI sobre{" "}
                  {SECTION_LABELS[section].toLowerCase()}...
                </span>
              </button>
            ) : (
              <div
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: "rgba(255, 94, 26, 0.2)", background: "#111111" }}
              >
                <div
                  className="px-4 py-2 border-b flex items-center justify-between"
                  style={{ borderColor: "rgba(255, 94, 26, 0.1)", background: "rgba(255, 94, 26, 0.03)" }}
                >
                  <span className="font-mono text-[10px] text-nitro-muted uppercase tracking-widest">
                    Chat con NitroAI
                  </span>
                  <button
                    onClick={() => setChatOpen(false)}
                    className="text-xs text-nitro-muted hover:text-nitro-orange transition-colors"
                  >
                    {"\u2715"} Cerrar
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 && !chatLoading && (
                    <p className="text-xs text-nitro-muted text-center py-2 font-mono">
                      Hace una pregunta sobre {SECTION_LABELS[section].toLowerCase()}
                    </p>
                  )}
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={
                        "flex " +
                        (msg.role === "user" ? "justify-end" : "justify-start")
                      }
                    >
                      <div
                        className="max-w-[85%] rounded-xl px-3 py-2 text-sm"
                        style={
                          msg.role === "user"
                            ? {
                                background: "var(--nitro-gradient)",
                                color: "#0A0A0A",
                                fontWeight: 500,
                              }
                            : {
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 94, 26, 0.15)",
                                color: "#e5e5e5",
                              }
                        }
                      >
                        <div className="leading-relaxed">
                          {msg.role === "assistant"
                            ? renderContent(msg.content)
                            : msg.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div
                        className="rounded-xl px-3 py-2"
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 94, 26, 0.15)",
                        }}
                      >
                        <div className="flex gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ backgroundColor: "#FF5E1A", animationDelay: "0ms" }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ backgroundColor: "#FF2E2E", animationDelay: "150ms" }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ backgroundColor: "#FFB800", animationDelay: "300ms" }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t p-3 flex gap-2" style={{ borderColor: "rgba(255, 94, 26, 0.1)" }}>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder={
                      "Pregunta sobre " +
                      SECTION_LABELS[section].toLowerCase() +
                      "..."
                    }
                    className="flex-1 px-3 py-2 text-sm rounded-xl outline-none transition-all duration-300"
                    style={{
                      background: "#0A0A0A",
                      border: "1px solid #222222",
                      color: "#FFFFFF",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 94, 26, 0.4)";
                      e.currentTarget.style.boxShadow = "0 0 0 2px rgba(255, 94, 26, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#222222";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={chatLoading || !input.trim()}
                    className="px-4 py-2 text-sm font-bold rounded-xl transition-all duration-300 ease-nitro disabled:opacity-30"
                    style={{
                      background: "var(--nitro-gradient)",
                      color: "#0A0A0A",
                    }}
                  >
                    Enviar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
