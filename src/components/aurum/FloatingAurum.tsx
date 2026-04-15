"use client";
// @ts-nocheck

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, ChevronRight, RefreshCw } from "lucide-react";
import { useAurumContext } from "./AurumContext";
import { AurumOrb } from "./AurumOrb";

const ES_TRANSITION = "cubic-bezier(0.16, 1, 0.3, 1)";

type AurumMsg = { role: "user" | "assistant"; content: string };

// AurumOrb ahora se importa desde "./AurumOrb" (anillo Saturno + orb dorado).

/* ──────────────────────────────────────────────────
   AurumText — render markdown simple (negritas + bullets).
   ────────────────────────────────────────────────── */
function AurumText({ text }: { text: string }) {
  const lines = (text || "").split(/\n+/).filter((l) => l.trim().length > 0);

  const renderInline = (s: string) => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    const re = /\*\*(.+?)\*\*/g;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) parts.push(<React.Fragment key={key++}>{s.slice(last, m.index)}</React.Fragment>);
      parts.push(
        <strong key={key++} style={{ color: "#422006" }}>
          {m[1]}
        </strong>
      );
      last = m.index + m[0].length;
    }
    if (last < s.length) parts.push(<React.Fragment key={key++}>{s.slice(last)}</React.Fragment>);
    return parts;
  };

  const isBullet = (l: string) => /^\s*[-•]\s+/.test(l);
  const stripBullet = (l: string) => l.replace(/^\s*[-•]\s+/, "");

  const blocks: React.ReactNode[] = [];
  let i = 0;
  let keyIdx = 0;
  while (i < lines.length) {
    if (isBullet(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(stripBullet(lines[i]));
        i++;
      }
      blocks.push(
        <ul key={keyIdx++} className="list-none space-y-1 my-1">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2 text-[12.5px] leading-relaxed" style={{ color: "#422006" }}>
              <span style={{ color: "#d97706" }} className="font-bold mt-0.5">·</span>
              <span>{renderInline(it)}</span>
            </li>
          ))}
        </ul>
      );
    } else {
      blocks.push(
        <p key={keyIdx++} className="text-[12.5px] leading-relaxed my-1" style={{ color: "#422006" }}>
          {renderInline(lines[i])}
        </p>
      );
      i++;
    }
  }
  return <>{blocks}</>;
}

/* ──────────────────────────────────────────────────
   FloatingAurum — bubble + panel contextual
   ────────────────────────────────────────────────── */
export default function FloatingAurum() {
  const pathname = usePathname() || "/";
  const { ctx, isOpen, openPanel, closePanel, togglePanel } = useAurumContext();

  // Ocultar en el chat de Aurum (es el chat full, no tiene sentido duplicar).
  const hideOnRoutes = useMemo(() => ["/chat", "/login"], []);
  const shouldHide = hideOnRoutes.some((r) => pathname === r || pathname.startsWith(r + "/"));

  // Estado del chat contextual
  const [initialInsight, setInitialInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AurumMsg[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hasContext, setHasContext] = useState(false);

  // Key derivado del ctx para refrescar cuando cambia el data de la página.
  const ctxKey = useMemo(() => {
    try {
      return ctx ? `${ctx.section}::${JSON.stringify(ctx.contextData)}` : "empty";
    } catch {
      return `${ctx?.section || "empty"}::${Date.now()}`;
    }
  }, [ctx]);

  // Cada vez que cambia la página o el ctx, reseteamos mensajes y pedimos un nuevo insight.
  useEffect(() => {
    setMessages([]);
    setInitialInsight(null);
    setInsightError(null);
    setHasContext(!!ctx);
  }, [ctxKey]);

  // Cuando abrimos el panel por primera vez (y hay contexto) → generamos insight inicial.
  useEffect(() => {
    if (!isOpen) return;
    if (!ctx) return;
    if (initialInsight || insightLoading) return;

    let cancelled = false;
    setInsightLoading(true);
    setInsightError(null);
    (async () => {
      try {
        const res = await fetch("/api/aurum/section-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section: ctx.section,
            contextLabel: ctx.contextLabel,
            contextData: ctx.contextData,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setInitialInsight(data.reply || "");
          setInsightLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setInsightError(e?.message || "Error");
          setInsightLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ctxKey]);

  // Auto-scroll al final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, asking, initialInsight, isOpen]);

  // Focus input al abrir
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 260);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closePanel]);

  const sendQuestion = async (q: string) => {
    const question = q.trim();
    if (!question || asking) return;
    if (!ctx) return;
    setAsking(true);
    const currentHistory = messages;
    const newHistory: AurumMsg[] = [...currentHistory, { role: "user", content: question }];
    setMessages(newHistory);
    setInput("");
    try {
      const res = await fetch("/api/aurum/section-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: ctx.section,
          contextLabel: ctx.contextLabel,
          contextData: ctx.contextData,
          question,
          history: currentHistory,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages([...newHistory, { role: "assistant", content: data.reply || "No pude responder." }]);
    } catch (e: any) {
      setMessages([
        ...newHistory,
        { role: "assistant", content: `Ups, no pude responder ahora. ${e?.message || ""}` },
      ]);
    } finally {
      setAsking(false);
    }
  };

  if (shouldHide) return null;

  const suggestions = ctx?.suggestions || [];

  return (
    <>
      {/* ═══ BUBBLE ═══ */}
      <button
        type="button"
        onClick={togglePanel}
        aria-label={isOpen ? "Cerrar Aurum" : "Abrir Aurum"}
        className="fixed z-[60] group"
        style={{
          right: 22,
          bottom: 22,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {/* Halo exterior que respira */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            inset: -14,
            background:
              "radial-gradient(circle, rgba(251,191,36,0.22) 0%, rgba(217,119,6,0.12) 45%, transparent 70%)",
            filter: "blur(10px)",
            animation: "aurumBreath 3.2s ease-in-out infinite",
          }}
        />
        <div
          className="relative rounded-full flex items-center justify-center transition-transform duration-300"
          style={{
            width: 62,
            height: 62,
            background: "linear-gradient(145deg, #0a0a0f 0%, #1a1410 100%)",
            boxShadow:
              "0 6px 24px -6px rgba(0,0,0,0.55), 0 18px 40px -18px rgba(217,119,6,0.55), inset 0 1px 0 rgba(251,191,36,0.3)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "scale(1.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
          }}
        >
          {/* Borde dorado gradient */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              padding: 1.5,
              background:
                "linear-gradient(145deg, rgba(251,191,36,0.9), rgba(217,119,6,0.5) 50%, rgba(251,191,36,0.3))",
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
            }}
          />
          <AurumOrb size={40} thinking={asking || insightLoading} />

          {/* Dot de contexto listo */}
          {hasContext && !isOpen && (
            <span
              className="absolute"
              style={{
                top: 6,
                right: 6,
                width: 9,
                height: 9,
                borderRadius: 999,
                background: "#10b981",
                boxShadow: "0 0 0 2px #0a0a0f, 0 0 8px rgba(16,185,129,0.8)",
              }}
            />
          )}
        </div>

        {/* Tooltip al hover */}
        <span
          className="absolute opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap"
          style={{
            right: 76,
            bottom: 18,
            padding: "8px 12px",
            borderRadius: 10,
            background: "linear-gradient(180deg, #0a0a0f 0%, #131016 100%)",
            border: "1px solid rgba(251,191,36,0.25)",
            color: "#fde68a",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            boxShadow: "0 6px 20px -8px rgba(0,0,0,0.5)",
          }}
        >
          {isOpen ? "Cerrar Aurum" : "Preguntale a Aurum"}
        </span>
      </button>

      {/* ═══ PANEL ═══ */}
      {isOpen && (
        <div
          className="fixed z-[59] aurum-panel-enter"
          style={{
            right: 22,
            bottom: 100,
            width: "min(420px, calc(100vw - 44px))",
            height: "min(640px, calc(100vh - 140px))",
            background: "linear-gradient(180deg, #0a0a0f 0%, #131016 100%)",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow:
              "0 12px 40px -12px rgba(0,0,0,0.6), 0 40px 80px -40px rgba(217,119,6,0.4), 0 0 0 1px rgba(251,191,36,0.12)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Aurora de fondo */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(500px 200px at 10% 0%, rgba(251,191,36,0.14), transparent 60%), radial-gradient(360px 180px at 95% 100%, rgba(217,119,6,0.12), transparent 60%)",
              opacity: 0.9,
            }}
          />

          {/* Borde dorado gradient */}
          <div
            className="absolute inset-0 pointer-events-none rounded-[20px]"
            style={{
              padding: 1,
              background:
                "linear-gradient(180deg, rgba(251,191,36,0.35), rgba(251,191,36,0.08) 40%, rgba(217,119,6,0.2))",
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
            }}
          />

          {/* HEADER */}
          <div className="relative px-4 pt-4 pb-3 flex items-start gap-3">
            <AurumOrb size={34} thinking={insightLoading || asking} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-[15px] font-bold tracking-tight"
                  style={{
                    background: "linear-gradient(180deg, #fef3c7 0%, #fbbf24 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Aurum
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded"
                  style={{
                    color: "#fbbf24",
                    background: "rgba(251,191,36,0.1)",
                    border: "1px solid rgba(251,191,36,0.25)",
                  }}
                >
                  Versión rápida
                </span>
              </div>
              {ctx ? (
                <div className="text-[11px] text-amber-100/80 mt-1 truncate">
                  Enfocado en: <span className="font-semibold">{ctx.contextLabel}</span>
                </div>
              ) : (
                <div className="text-[11px] text-amber-200/60 mt-1">
                  Aún no hay contexto en esta página
                </div>
              )}
              <div className="text-[10.5px] text-amber-200/50 mt-0.5 leading-snug">
                Respuestas cortas sobre lo que estás viendo. Para análisis profundo, usá el chat completo de Aurum.
              </div>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Cerrar"
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{
                color: "#fde68a",
                background: "rgba(251,191,36,0.06)",
                border: "1px solid rgba(251,191,36,0.15)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,0.14)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,0.06)";
              }}
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* BODY SCROLL */}
          <div
            ref={scrollRef}
            className="relative flex-1 overflow-y-auto px-4 pb-3 aurum-scroll"
          >
            {!ctx && (
              <div
                className="rounded-xl p-4 text-[12.5px]"
                style={{
                  background: "rgba(254,243,199,0.08)",
                  border: "1px solid rgba(251,191,36,0.2)",
                  color: "#fde68a",
                }}
              >
                Navegá a una sección con datos (por ejemplo <strong className="text-amber-100">SEO</strong>) y volvé a abrirme. Ahí te voy a poder analizar lo que estás viendo.
              </div>
            )}

            {ctx && insightLoading && !initialInsight && (
              <div className="space-y-2 mt-1">
                <div className="h-3 w-3/4 rounded bg-amber-100/10 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-amber-100/10 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-amber-100/10 animate-pulse" />
              </div>
            )}

            {ctx && insightError && (
              <div className="text-[12px] text-rose-300/80 flex items-center gap-2">
                No pude leer esta sección.
                <button
                  onClick={() => {
                    setInitialInsight(null);
                    setInsightError(null);
                  }}
                  className="underline inline-flex items-center gap-1"
                >
                  <RefreshCw size={11} /> Reintentar
                </button>
              </div>
            )}

            {ctx && initialInsight && (
              <div
                className="rounded-xl p-3.5 mt-1"
                style={{
                  background: "rgba(254,243,199,0.95)",
                  border: "1px solid rgba(251,191,36,0.3)",
                  animation: `fadeInUp 320ms ${ES_TRANSITION}`,
                }}
              >
                <AurumText text={initialInsight} />
              </div>
            )}

            {messages.length > 0 && (
              <div className="mt-3 space-y-2">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3"
                    style={{
                      background:
                        m.role === "user"
                          ? "rgba(251,191,36,0.10)"
                          : "rgba(254,243,199,0.95)",
                      border:
                        m.role === "user"
                          ? "1px solid rgba(251,191,36,0.25)"
                          : "1px solid rgba(251,191,36,0.3)",
                      animation: `fadeInUp 260ms ${ES_TRANSITION}`,
                    }}
                  >
                    {m.role === "user" ? (
                      <div className="text-[12.5px] font-medium" style={{ color: "#fde68a" }}>
                        {m.content}
                      </div>
                    ) : (
                      <AurumText text={m.content} />
                    )}
                  </div>
                ))}
                {asking && (
                  <div className="flex items-center gap-2 text-[11px] text-amber-200/70 pl-1">
                    <AurumOrb size={16} thinking />
                    <span className="tracking-wider uppercase">Pensando…</span>
                  </div>
                )}
              </div>
            )}

            {ctx && !insightLoading && !insightError && messages.length === 0 && suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendQuestion(s)}
                    disabled={asking}
                    className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all"
                    style={{
                      background: "rgba(251,191,36,0.08)",
                      color: "#fde68a",
                      border: "1px solid rgba(251,191,36,0.25)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,0.16)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,0.08)";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* FOOTER INPUT */}
          {ctx && (
            <div className="relative px-3 pb-3 pt-2 border-t border-amber-500/10">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendQuestion(input);
                }}
                className="flex items-center gap-2"
              >
                <div
                  className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(251,191,36,0.2)",
                  }}
                >
                  <Sparkles size={13} style={{ color: "#fbbf24" }} />
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Preguntale a Aurum…"
                    disabled={asking}
                    className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-amber-200/40"
                    style={{ color: "#fef3c7" }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={asking || !input.trim()}
                  className="rounded-xl p-2 transition-all disabled:opacity-40 flex items-center justify-center"
                  style={{
                    background: "linear-gradient(180deg, #fbbf24 0%, #d97706 100%)",
                    color: "#422006",
                    boxShadow: "0 2px 12px -2px rgba(251,191,36,0.4)",
                    width: 36,
                    height: 36,
                  }}
                  aria-label="Enviar"
                >
                  <ChevronRight size={16} strokeWidth={3} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Estilos globales específicos */}
      <style jsx global>{`
        @keyframes aurumBreath {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.04); filter: brightness(1.12); }
        }
        @keyframes aurumPulseRing {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.3); opacity: 0.25; }
        }
        @keyframes aurumOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes aurumPanelEnter {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .aurum-panel-enter {
          animation: aurumPanelEnter 320ms ${ES_TRANSITION};
          transform-origin: bottom right;
        }
        .aurum-scroll::-webkit-scrollbar { width: 6px; }
        .aurum-scroll::-webkit-scrollbar-track { background: transparent; }
        .aurum-scroll::-webkit-scrollbar-thumb {
          background: rgba(251,191,36,0.25);
          border-radius: 3px;
        }
        .aurum-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(251,191,36,0.45);
        }
        .aurum-scroll { scrollbar-width: thin; scrollbar-color: rgba(251,191,36,0.25) transparent; }
        @media (prefers-reduced-motion: reduce) {
          .aurum-panel-enter { animation: none !important; }
        }
      `}</style>
    </>
  );
}
