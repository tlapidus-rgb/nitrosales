"use client";

import { useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";

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

export default function ChatPage() {
  const { data: session } = useSession();
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
                  ? "bg-indigo-600 text-gray-900"
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
            className="px-6 py-3 bg-indigo-600 text-gray-900 font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
