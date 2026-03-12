"use client";

import { useEffect, useState, useRef } from "react";

interface Insight {
  type: "ALERT" | "OPPORTUNITY" | "TREND";
  title: string;
  description: string;
  action: string;
}

type Message = { role: "user" | "assistant"; content: string };

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string; label: string }> = {
  ALERT: { icon: "\u26A0\uFE0F", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", label: "Alerta" },
  OPPORTUNITY: { icon: "\uD83D\uDCA1", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "Oportunidad" },
  TREND: { icon: "\uD83D\uDCC8", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: "Tendencia" },
};

const SECTION_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  products: "Productos",
  campaigns: "Campanas",
};

export default function NitroInsightsPanel({ section }: { section: "dashboard" | "products" | "campaigns" }) {
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
    const updated: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(updated);
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "[Contexto: el usuario esta en la seccion de " + SECTION_LABELS[section] + " y pregunta sobre esos datos] " + userMsg,
          history: updated.slice(-10),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "Error al responder." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error de conexion." }]);
    }
    setChatLoading(false);
  };

  function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>;
        return p;
      });
      if (line.startsWith("### ")) return <h4 key={i} className="font-bold text-sm mt-3 mb-1">{line.replace("### ", "")}</h4>;
      if (line.startsWith("## ")) return <h3 key={i} className="font-bold mt-4 mb-1">{line.replace("## ", "")}</h3>;
      if (line.startsWith("---")) return <hr key={i} className="my-2 border-gray-200" />;
      return <span key={i}>{i > 0 && <br />}{parts}</span>;
    });
  }

  return (
    <div className="mt-8">
      {/* Insights Panel */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-indigo-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">\uD83E\uDD16</span>
            <h3 className="font-semibold text-indigo-800">NitroBot</h3>
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
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
              className="text-xs text-indigo-500 hover:text-indigo-700 transition"
            >
              \u21BB Regenerar
            </button>
          )}
        </div>

        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-lg border border-gray-100 p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                  <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-4/5 mb-4" />
                  <div className="h-3 bg-indigo-100 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-gray-500 text-center py-4">No se pudieron cargar los insights. Intenta recargar.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insights.map((insight, idx) => {
                const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.TREND;
                return (
                  <div key={idx} className={"bg-white rounded-lg border p-4 " + config.border + " hover:shadow-md transition"}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{config.icon}</span>
                      <span className={"text-xs font-semibold uppercase " + config.color}>{config.label}</span>
                    </div>
                    <h4 className="font-semibold text-gray-800 text-sm mb-2">{insight.title}</h4>
                    <p className="text-xs text-gray-600 mb-3 leading-relaxed">{insight.description}</p>
                    <div className={"text-xs font-medium " + config.color + " " + config.bg + " px-3 py-1.5 rounded-lg"}>
                      \u2192 {insight.action}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mini-chat section */}
          <div className="mt-4">
            {!chatOpen ? (
              <button
                onClick={() => setChatOpen(true)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-white border border-indigo-200 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 transition"
              >
                <span>\uD83D\uDCAC</span>
                <span>Preguntale mas a NitroBot sobre {SECTION_LABELS[section].toLowerCase()}...</span>
              </button>
            ) : (
              <div className="bg-white rounded-lg border border-indigo-200 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                  <span className="text-xs font-medium text-gray-500">Chat con NitroBot</span>
                  <button onClick={() => setChatOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">\u2715 Cerrar</button>
                </div>
                <div className="max-h-64 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 && !chatLoading && (
                    <p className="text-xs text-gray-400 text-center py-2">Hace una pregunta sobre los datos de {SECTION_LABELS[section].toLowerCase()}</p>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={"flex " + (msg.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={"max-w-[85%] rounded-lg px-3 py-2 text-sm " + (msg.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800")}>
                        <div className="leading-relaxed">{msg.role === "assistant" ? renderContent(msg.content) : msg.content}</div>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-lg px-3 py-2">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t p-3 flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder={"Pregunta sobre " + SECTION_LABELS[section].toLowerCase() + "..."}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={chatLoading || !input.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
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
