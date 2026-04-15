// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════════════
// /seo — Rebuild sesión 21
// ──────────────────────────────────────────────────────────────────────
// Posicionamiento Orgánico — premium + educativo
//
// Bloques:
//   1. Command Bar: título + fechas + hero KPIs con tooltips
//   2. ¿Cómo estamos en Google? — Distribución de posiciones + health score
//   3. Evolución temporal — clicks/impresiones + posición promedio
//   4. Oportunidades de Oro — keywords con gran impresión y baja posición
//   5. Movimientos — subiendo / bajando / nuevas / perdidas
//   6. Top Keywords — tabla con tooltips educativos
//   7. Top Páginas — tabla
//   8. Canibalización — alertas
//   9. Device + Países — splits finales
//
// Premium: light mode, aurora, multi-shadow, count-up animations,
// cubic-bezier (0.16, 1, 0.3, 1), tabular-nums, rounded-2xl, tracking-tight.
// Educativo: cada concepto difícil con tooltip explicativo.
// ══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from "recharts";
import { useSyncStatus } from "@/lib/hooks/useSyncStatus";
import {
  Search, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Eye, MousePointer, Target, Trophy, Flame, AlertTriangle, Sparkles,
  HelpCircle, RefreshCw, Smartphone, Monitor, Globe, Filter,
  ChevronRight, ExternalLink, Info, Zap, BarChart3, Award, X,
  Layers, Plus, Minus, Clock, Lightbulb, ChevronDown, CheckCircle2,
} from "lucide-react";

/* ════════════════════════════════════════════════════
   Constants + helpers
   ════════════════════════════════════════════════════ */

const QUICK_RANGES = [
  { label: "7 días", days: 7 },
  { label: "28 días", days: 28 },
  { label: "90 días", days: 90 },
  { label: "180 días", days: 180 },
];

const ES_TRANSITION = "cubic-bezier(0.16, 1, 0.3, 1)";

function toDateInputValue(d: Date) {
  return d.toISOString().split("T")[0];
}

function fmtNum(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  return Math.round(n).toLocaleString("es-AR");
}

function fmtCompact(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return Math.round(n).toLocaleString("es-AR");
}

function fmtPct(n: number | null | undefined, digits = 2) {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(digits) + "%";
}

function fmtPos(n: number | null | undefined) {
  if (n == null || !isFinite(n) || n === 0) return "—";
  return n.toFixed(1);
}

function fmtDateShort(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

const COUNTRY_NAMES: Record<string, string> = {
  arg: "Argentina", ARG: "Argentina",
  bra: "Brasil", BRA: "Brasil",
  chl: "Chile", CHL: "Chile",
  ury: "Uruguay", URY: "Uruguay",
  mex: "México", MEX: "México",
  usa: "Estados Unidos", USA: "Estados Unidos",
  col: "Colombia", COL: "Colombia",
  per: "Perú", PER: "Perú",
  esp: "España", ESP: "España",
  bol: "Bolivia", BOL: "Bolivia",
  pry: "Paraguay", PRY: "Paraguay",
  ecu: "Ecuador", ECU: "Ecuador",
};

/* ════════════════════════════════════════════════════
   Hooks
   ════════════════════════════════════════════════════ */

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const step = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

/* ════════════════════════════════════════════════════
   Tooltip educativo
   ════════════════════════════════════════════════════ */

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <HelpCircle
        size={13}
        strokeWidth={2}
        className="text-slate-400 hover:text-slate-600 cursor-help transition-colors"
      />
      {open && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none"
          style={{ minWidth: 240 }}
        >
          <span
            className="block text-[11px] leading-relaxed text-white bg-slate-900 rounded-lg px-3 py-2 shadow-xl text-left font-normal normal-case tracking-normal"
            style={{
              animation: "fadeInUp 180ms " + ES_TRANSITION,
            }}
          >
            {text}
          </span>
          <span
            className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
            style={{
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: "4px solid rgb(15,23,42)",
            }}
          />
        </span>
      )}
    </span>
  );
}

/* ════════════════════════════════════════════════════
   Count components
   ════════════════════════════════════════════════════ */

function CountNum({ value }: { value: number }) {
  const v = useCountUp(value, 700);
  return <span className="tabular-nums">{Math.round(v).toLocaleString("es-AR")}</span>;
}

function CountCompact({ value }: { value: number }) {
  const v = useCountUp(value, 700);
  return <span className="tabular-nums">{fmtCompact(v)}</span>;
}

function CountPct({ value, digits = 2 }: { value: number; digits?: number }) {
  const v = useCountUp(value, 700);
  return <span className="tabular-nums">{v.toFixed(digits)}%</span>;
}

function CountPos({ value }: { value: number }) {
  const v = useCountUp(value, 700);
  return <span className="tabular-nums">{v > 0 ? v.toFixed(1) : "—"}</span>;
}

/* ════════════════════════════════════════════════════
   DeltaPill — change vs prev period
   ════════════════════════════════════════════════════ */

function DeltaPill({ value, inverse = false }: { value: number; inverse?: boolean }) {
  if (!isFinite(value) || value === 0) {
    return <span className="text-[11px] text-slate-400 tabular-nums">—</span>;
  }
  const good = inverse ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
        good ? "text-emerald-600" : "text-rose-500"
      }`}
    >
      <Icon size={11} strokeWidth={2.5} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/* ════════════════════════════════════════════════════
   CoachCard — "¿Cómo lo mejoro?" con pasos esenciales
   + guía completa expandible. Reusable en cada bloque.
   ════════════════════════════════════════════════════ */

type CoachStep = { title: string; detail?: string };
type CoachTone = "amber" | "emerald" | "blue" | "rose" | "violet" | "slate";

const COACH_TONE: Record<CoachTone, { bg: string; border: string; icon: string; chip: string; ring: string }> = {
  amber:   { bg: "from-amber-50 to-amber-50/0",   border: "border-amber-100",   icon: "text-amber-600",   chip: "bg-amber-100 text-amber-700",     ring: "ring-amber-200" },
  emerald: { bg: "from-emerald-50 to-emerald-50/0", border: "border-emerald-100", icon: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-200" },
  blue:    { bg: "from-blue-50 to-blue-50/0",     border: "border-blue-100",    icon: "text-blue-600",    chip: "bg-blue-100 text-blue-700",       ring: "ring-blue-200" },
  rose:    { bg: "from-rose-50 to-rose-50/0",     border: "border-rose-100",    icon: "text-rose-600",    chip: "bg-rose-100 text-rose-700",       ring: "ring-rose-200" },
  violet:  { bg: "from-violet-50 to-violet-50/0", border: "border-violet-100",  icon: "text-violet-600",  chip: "bg-violet-100 text-violet-700",   ring: "ring-violet-200" },
  slate:   { bg: "from-slate-50 to-slate-50/0",   border: "border-slate-200",   icon: "text-slate-600",   chip: "bg-slate-100 text-slate-700",     ring: "ring-slate-200" },
};

function CoachCard({
  tone = "amber",
  headline,
  essentials,
  extended,
  footer,
}: {
  tone?: CoachTone;
  headline: string;
  essentials: CoachStep[];
  extended?: CoachStep[];
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const cfg = COACH_TONE[tone];

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${cfg.bg} border ${cfg.border} p-4 mt-4`}
      style={{
        boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0 ring-1 ${cfg.ring}`}
          style={{ boxShadow: "0 2px 8px -2px rgba(15,23,42,0.1)" }}
        >
          <Lightbulb size={15} className={cfg.icon} strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-[13px] font-bold text-slate-900 tracking-tight">
              {headline}
            </h4>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.chip}`}>
              Coach
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {essentials.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[12px]">
                <div className={`w-4 h-4 rounded-full bg-white ring-1 ${cfg.ring} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <span className={`text-[10px] font-bold tabular-nums ${cfg.icon}`}>{i + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-800 leading-snug">{s.title}</div>
                  {s.detail && (
                    <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">{s.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {extended && extended.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setOpen(!open)}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${cfg.icon} hover:opacity-80 transition-opacity`}
              >
                <ChevronDown
                  size={13}
                  strokeWidth={2.5}
                  className="transition-transform"
                  style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                />
                {open ? "Ocultar guía completa" : "Ver guía completa paso a paso"}
              </button>

              {open && (
                <div
                  className="mt-3 pt-3 border-t border-white/80 space-y-2"
                  style={{ animation: `fadeInUp 220ms ${ES_TRANSITION}` }}
                >
                  {extended.map((s, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-[12px]">
                      <CheckCircle2 size={13} className={`${cfg.icon} flex-shrink-0 mt-0.5`} strokeWidth={2.2} />
                      <div className="flex-1">
                        <div className="font-semibold text-slate-800 leading-snug">{s.title}</div>
                        {s.detail && (
                          <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">{s.detail}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {footer && <div className="mt-3 pt-3 border-t border-white/80">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   AurumOrb — mini esfera dorada reutilizable
   ════════════════════════════════════════════════════ */
function AurumOrbMini({ size = 28, thinking = false }: { size?: number; thinking?: boolean }) {
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
            "0 0 12px rgba(251,191,36,0.45), 0 0 22px rgba(251,191,36,0.2), inset -2px -3px 6px rgba(120,53,15,0.35), inset 1.5px 2px 5px rgba(254,243,199,0.6)",
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
        <div className="absolute inset-0" style={{ animation: "aurumOrbit 3.8s linear infinite" }}>
          <div
            className="absolute rounded-full"
            style={{
              top: "-2px",
              left: "50%",
              width: "2.5px",
              height: "2.5px",
              background: "#fde68a",
              boxShadow: "0 0 6px rgba(251,191,36,0.9)",
              transform: "translateX(-50%)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   AurumSectionCard — Aurum contextual por tab
   ════════════════════════════════════════════════════ */
type AurumMsg = { role: "user" | "assistant"; content: string };

function AurumText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let buffer: string[] = [];
  let inList = false;

  const renderInline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>;
      }
      return <span key={i}>{p}</span>;
    });
  };

  const flushPara = () => {
    if (buffer.length > 0) {
      const joined = buffer.join(" ");
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-[13px] text-slate-700 leading-relaxed">
          {renderInline(joined)}
        </p>
      );
      buffer = [];
    }
  };

  const listItems: React.ReactNode[] = [];
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="space-y-1.5">
          {listItems.map((li, i) => (
            <React.Fragment key={i}>{li}</React.Fragment>
          ))}
        </ul>
      );
      listItems.length = 0;
    }
    inList = false;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("• ")) {
      flushPara();
      inList = true;
      const content = line.slice(2);
      listItems.push(
        <li className="flex items-start gap-2 text-[13px] text-slate-700 leading-relaxed">
          <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#d97706" }} />
          <span>{renderInline(content)}</span>
        </li>
      );
    } else {
      if (inList) flushList();
      buffer.push(line);
    }
  }
  flushPara();
  flushList();

  return <div className="space-y-2">{blocks}</div>;
}

function AurumSectionCard({
  section,
  contextLabel,
  contextData,
  suggestions,
}: {
  section: string;
  contextLabel: string;
  contextData: any;
  suggestions: string[];
}) {
  const [initialInsight, setInitialInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AurumMsg[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, asking]);

  const contextKey = useMemo(() => {
    try {
      return JSON.stringify(contextData);
    } catch {
      return String(Date.now());
    }
  }, [contextData]);

  useEffect(() => {
    let cancelled = false;
    setInsightLoading(true);
    setInsightError(null);
    setInitialInsight(null);
    setMessages([]);
    setExpanded(false);

    (async () => {
      try {
        const res = await fetch("/api/aurum/section-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, contextLabel, contextData }),
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
  }, [section, contextKey]);

  const sendQuestion = async (q: string) => {
    const question = q.trim();
    if (!question || asking) return;
    setAsking(true);
    setExpanded(true);
    const currentHistory = messages;
    const newHistory: AurumMsg[] = [...currentHistory, { role: "user", content: question }];
    setMessages(newHistory);
    setInput("");

    try {
      const res = await fetch("/api/aurum/section-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          contextLabel,
          contextData,
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

  return (
    <div
      className="relative rounded-2xl overflow-hidden mt-4"
      style={{
        background: "linear-gradient(180deg, #0a0a0f 0%, #131016 100%)",
        boxShadow:
          "0 1px 0 rgba(251,191,36,0.08), 0 10px 30px -10px rgba(0,0,0,0.5), 0 30px 60px -30px rgba(217,119,6,0.2)",
      }}
    >
      <div
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          background:
            "radial-gradient(600px 240px at 12% 0%, rgba(251,191,36,0.12), transparent 65%), radial-gradient(400px 200px at 90% 100%, rgba(217,119,6,0.10), transparent 60%)",
        }}
      />

      <div className="relative p-5">
        <div className="flex items-center gap-3">
          <AurumOrbMini size={32} thinking={insightLoading || asking} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4
                className="text-[14px] font-bold tracking-tight"
                style={{
                  background: "linear-gradient(180deg, #fef3c7 0%, #fbbf24 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Aurum
              </h4>
              <span
                className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded"
                style={{
                  color: "#fbbf24",
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.2)",
                }}
              >
                Análisis en vivo
              </span>
            </div>
            <div className="text-[11px] text-amber-200/70 mt-0.5 truncate">
              Enfocado en: <span className="font-semibold text-amber-100">{contextLabel}</span>
            </div>
            <div className="text-[10.5px] text-amber-200/50 mt-0.5 leading-snug">
              Respuestas cortas y concretas sobre la data de esta sección. Para análisis más profundo, usá el chat completo de Aurum.
            </div>
          </div>
        </div>

        <div className="mt-4 min-h-[60px]">
          {insightLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-3/4 rounded bg-amber-100/10 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-amber-100/10 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-amber-100/10 animate-pulse" />
            </div>
          ) : insightError ? (
            <div className="text-[12px] text-rose-300/80">
              No pude leer esta tab ahora. Probá de nuevo en unos segundos.
            </div>
          ) : (
            <div
              className="rounded-xl p-3.5"
              style={{
                background: "rgba(254,243,199,0.95)",
                border: "1px solid rgba(251,191,36,0.3)",
              }}
            >
              <AurumText text={initialInsight || ""} />
            </div>
          )}
        </div>

        {expanded && messages.length > 0 && (
          <div
            ref={chatScrollRef}
            className="mt-3 space-y-2 pr-1 aurum-scroll"
            style={{
              maxHeight: "320px",
              overflowY: "auto",
              scrollBehavior: "smooth",
            }}
          >
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
                <AurumOrbMini size={16} thinking />
                <span className="tracking-wider uppercase">Pensando…</span>
              </div>
            )}
          </div>
        )}

        {!insightLoading && !insightError && messages.length === 0 && suggestions.length > 0 && (
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

        {!insightLoading && !insightError && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion(input);
            }}
            className="mt-3 flex items-center gap-2"
          >
            <div
              className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(251,191,36,0.18)",
              }}
            >
              <Sparkles size={13} style={{ color: "#fbbf24" }} />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Preguntale a Aurum sobre esta tab…"
                disabled={asking}
                className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-amber-200/40"
                style={{ color: "#fef3c7" }}
              />
            </div>
            <button
              type="submit"
              disabled={asking || !input.trim()}
              className="rounded-xl px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
              style={{
                background: "linear-gradient(180deg, #fbbf24 0%, #d97706 100%)",
                color: "#422006",
                boxShadow: "0 2px 12px -2px rgba(251,191,36,0.4)",
              }}
            >
              Preguntar
            </button>
          </form>
        )}

        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              setExpanded(false);
            }}
            className="mt-2 text-[10.5px] text-amber-200/50 hover:text-amber-200/80 transition-colors"
          >
            Limpiar conversación
          </button>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Main Page
   ════════════════════════════════════════════════════ */

export default function SEOPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SEOPageInner />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[1400px] mx-auto animate-pulse space-y-4">
        <div className="h-8 w-64 bg-slate-200 rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-2xl" />
      </div>
    </div>
  );
}

function SEOPageInner() {
  /* ── Date range ───────────────────────────────── */
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    toDateInputValue(new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000))
  );
  const [dateTo, setDateTo] = useState(toDateInputValue(now));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(28);

  /* ── Data state ───────────────────────────────── */
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── UI state ─────────────────────────────────── */
  const [keywordQuery, setKeywordQuery] = useState("");
  const [pageQuery, setPageQuery] = useState("");
  const [moversTab, setMoversTab] = useState<"up" | "down" | "new" | "lost">("up");

  /* ── Sync ─────────────────────────────────────── */
  const { lastSyncAt, isSyncing, triggerSync, onSyncComplete } = useSyncStatus("GSC");

  /* ── Fetch ────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/metrics/seo?from=${dateFrom}&to=${dateTo}`,
        { cache: "no-store" }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d && typeof d === "object" ? d : null);
    } catch (e: any) {
      console.error("[/seo] fetchData error", e);
      setError(String(e?.message || e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    onSyncComplete(() => fetchData());
  }, [onSyncComplete, fetchData]);

  /* ── Date handlers ────────────────────────────── */
  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setDateFrom(toDateInputValue(start));
    setDateTo(toDateInputValue(end));
    setActiveQuickRange(days);
  };

  const handleDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    setActiveQuickRange(null);
  };

  /* ── Derived ──────────────────────────────────── */
  const kpis = data?.kpis || {};
  const changes = kpis.changes || {};
  const dailyTrend: any[] = Array.isArray(data?.dailyTrend) ? data.dailyTrend : [];
  const topKeywords: any[] = Array.isArray(data?.topKeywords) ? data.topKeywords : [];
  const topPages: any[] = Array.isArray(data?.topPages) ? data.topPages : [];
  const positionDist = data?.positionDistribution || { pos1_3: 0, pos4_10: 0, pos11_20: 0, pos20plus: 0 };
  const deviceSplit: any[] = Array.isArray(data?.deviceSplit) ? data.deviceSplit : [];
  const opportunities: any[] = Array.isArray(data?.opportunities) ? data.opportunities : [];
  const movers = data?.movers || { up: [], down: [], new: [], lost: [] };
  const cannibalization: any[] = Array.isArray(data?.cannibalization) ? data.cannibalization : [];
  const countrySplit: any[] = Array.isArray(data?.countrySplit) ? data.countrySplit : [];

  const totalClicks = kpis.totalClicks || 0;
  const totalImpressions = kpis.totalImpressions || 0;
  const avgCtr = kpis.avgCtr || 0;
  const avgPosition = kpis.avgPosition || 0;
  const kwTop3 = kpis.kwTop3 || 0;
  const kwTop10 = kpis.kwTop10 || 0;
  const totalKeywords = kpis.totalKeywords || 0;

  const totalKws = (positionDist.pos1_3 || 0) + (positionDist.pos4_10 || 0) +
                   (positionDist.pos11_20 || 0) + (positionDist.pos20plus || 0);
  const pctTop3 = totalKws > 0 ? (positionDist.pos1_3 / totalKws) * 100 : 0;
  const pctTop10 = totalKws > 0 ? ((positionDist.pos1_3 + positionDist.pos4_10) / totalKws) * 100 : 0;

  // Health score: combinación de top3 ratio + ctr + posición
  const healthData = useMemo(() => {
    if (totalKws === 0) return { score: 0, breakdown: { top3: 0, ctr: 0, pos: 0 } };
    const top3 = Math.min((pctTop3 / 30) * 40, 40); // 30% top3 = full score 40
    const ctr = Math.min((avgCtr / 5) * 30, 30); // 5% CTR = full score 30
    const pos = avgPosition > 0 ? Math.max(30 - avgPosition, 0) : 0; // pos 1 = 30, pos 30+ = 0
    return {
      score: Math.round(top3 + ctr + pos),
      breakdown: {
        top3: Math.round(top3),
        ctr: Math.round(ctr),
        pos: Math.round(pos),
      },
    };
  }, [totalKws, pctTop3, avgCtr, avgPosition]);

  const healthScore = healthData.score;
  const healthBreakdown = healthData.breakdown;
  const healthLabel = healthScore >= 70 ? "Muy bueno" : healthScore >= 50 ? "Bueno" : healthScore >= 30 ? "Regular" : "A mejorar";
  const healthColor = healthScore >= 70 ? "emerald" : healthScore >= 50 ? "blue" : healthScore >= 30 ? "amber" : "rose";

  // Identificar el componente más débil del health score para el coach
  const weakestComponent = useMemo(() => {
    const parts = [
      { key: "top3", pct: healthBreakdown.top3 / 40, label: "Top 3" },
      { key: "ctr", pct: healthBreakdown.ctr / 30, label: "CTR" },
      { key: "pos", pct: healthBreakdown.pos / 30, label: "Posición" },
    ];
    return parts.sort((a, b) => a.pct - b.pct)[0];
  }, [healthBreakdown]);

  // Filtered keywords + pages
  const filteredKeywords = useMemo(() => {
    const q = keywordQuery.trim().toLowerCase();
    return q
      ? topKeywords.filter((k: any) => (k.keyword || "").toLowerCase().includes(q))
      : topKeywords;
  }, [topKeywords, keywordQuery]);

  const filteredPages = useMemo(() => {
    const q = pageQuery.trim().toLowerCase();
    return q
      ? topPages.filter((p: any) => (p.url || "").toLowerCase().includes(q))
      : topPages;
  }, [topPages, pageQuery]);

  // Oportunidades: ordenar por potentialClicks desc
  const sortedOpps = useMemo(() => {
    return [...opportunities].sort(
      (a, b) => (b.potentialClicks || 0) - (a.potentialClicks || 0)
    );
  }, [opportunities]);

  // Mobile vs desktop share
  const totalDeviceClicks = deviceSplit.reduce((a, d) => a + (d.clicks || 0), 0);
  const mobileClicks = deviceSplit.find((d) => (d.device || "").toUpperCase() === "MOBILE")?.clicks || 0;
  const desktopClicks = deviceSplit.find((d) => (d.device || "").toUpperCase() === "DESKTOP")?.clicks || 0;
  const tabletClicks = deviceSplit.find((d) => (d.device || "").toUpperCase() === "TABLET")?.clicks || 0;
  const pctMobile = totalDeviceClicks > 0 ? (mobileClicks / totalDeviceClicks) * 100 : 0;

  /* ════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════ */
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% 0%, rgba(59,130,246,0.06), transparent 60%), radial-gradient(1000px 500px at 85% 10%, rgba(16,185,129,0.05), transparent 65%), linear-gradient(180deg, #FAFBFC 0%, #F5F7FA 100%)",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-6 py-6 lg:py-8">
        {/* ═══ 1. COMMAND BAR ═══ */}
        <CommandBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          activeQuickRange={activeQuickRange}
          onQuickRange={handleQuickRange}
          onDateChange={handleDateChange}
          lastSyncAt={lastSyncAt}
          isSyncing={isSyncing}
          onSync={triggerSync}
        />

        {/* ═══ 2. HERO KPIs ═══ */}
        <section className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <HeroKPI
            icon={MousePointer}
            iconColor="#3b82f6"
            iconBg="bg-blue-50"
            label="Clicks desde Google"
            tooltip="Cantidad de veces que alguien entró a tu sitio haciendo click en un resultado de Google. Es tráfico gratis, no pagaste por él."
            value={<CountNum value={totalClicks} />}
            delta={changes.clicks}
            loading={loading}
          />
          <HeroKPI
            icon={Eye}
            iconColor="#8b5cf6"
            iconBg="bg-violet-50"
            label="Impresiones"
            tooltip="Cuántas veces tu sitio apareció en los resultados de Google, aunque no te hayan hecho click. Mide tu visibilidad."
            value={<CountCompact value={totalImpressions} />}
            delta={changes.impressions}
            loading={loading}
          />
          <HeroKPI
            icon={Target}
            iconColor="#10b981"
            iconBg="bg-emerald-50"
            label="CTR promedio"
            tooltip="Click-Through Rate. De cada 100 personas que vieron tu link en Google, cuántas entraron a tu sitio. 3-5% es normal, 10%+ es excelente."
            value={<CountPct value={avgCtr} />}
            delta={changes.ctr}
            loading={loading}
          />
          <HeroKPI
            icon={Trophy}
            iconColor="#f59e0b"
            iconBg="bg-amber-50"
            label="Posición promedio"
            tooltip="En qué lugar aparecés en promedio en los resultados de Google. 1 es el primero de todos. Menos es mejor. El top 10 es la primera página."
            value={<CountPos value={avgPosition} />}
            delta={changes.position}
            inverse={true}
            loading={loading}
            subtitle={avgPosition > 0 ? (avgPosition <= 10 ? "Primera página" : avgPosition <= 20 ? "Segunda página" : "Pág. 3 o más") : undefined}
          />
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
            <AlertTriangle size={16} />
            Error cargando datos: {error}
          </div>
        )}

        {/* ═══ 3. SALUD EN GOOGLE ═══ */}
        <section className="mt-8">
          <SectionHeader
            title="¿Cómo estamos en Google?"
            subtitle="Un vistazo general de tu posicionamiento orgánico"
          />
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <HealthScoreCard
              score={healthScore}
              label={healthLabel}
              color={healthColor}
              totalKws={totalKws}
              pctTop3={pctTop3}
              pctTop10={pctTop10}
              breakdown={healthBreakdown}
              loading={loading}
            />
            <PositionDistCard
              dist={positionDist}
              total={totalKws}
              loading={loading}
            />
            <KeywordsBreakdownCard
              kwTop3={kwTop3}
              kwTop10={kwTop10}
              totalKeywords={totalKeywords}
              loading={loading}
            />
          </div>

          {totalKws > 0 && (
            <AurumSectionCard
              section="seo.health"
              contextLabel="Salud SEO"
              contextData={{
                score: healthScore,
                label: healthLabel,
                breakdown: healthBreakdown,
                weakestComponent: weakestComponent.label,
                totalKeywords: totalKws,
                pctTop3: Number(pctTop3.toFixed(1)),
                pctTop10: Number(pctTop10.toFixed(1)),
                avgCtr: Number(avgCtr.toFixed(2)),
                avgPosition: Number(avgPosition.toFixed(1)),
              }}
              suggestions={[
                "¿Cómo subo +10 puntos rápido?",
                "¿Por qué mi score es ese?",
                "¿Qué componente ataco primero?",
              ]}
            />
          )}
        </section>

        {/* ═══ 4. EVOLUCIÓN TEMPORAL ═══ */}
        <section className="mt-8">
          <SectionHeader
            title="Evolución en el tiempo"
            subtitle="Cómo vienen cambiando tus clicks, impresiones y posición día a día"
          />
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TrendCard
              title="Clicks e impresiones"
              tooltip="Cuánta gente viene a tu sitio desde Google y cuántas veces apareciste. Si suben, tu SEO está funcionando."
              dailyTrend={dailyTrend}
              metric="clicksImpressions"
              loading={loading}
            />
            <TrendCard
              title="Posición promedio"
              tooltip="Más abajo es mejor (el 1 es el primer lugar). Si la línea baja, estás subiendo en el ranking."
              dailyTrend={dailyTrend}
              metric="position"
              loading={loading}
            />
          </div>
        </section>

        {/* ═══ 5. OPORTUNIDADES ═══ */}
        <section className="mt-8">
          <SectionHeader
            title="Oportunidades de oro"
            subtitle="Búsquedas donde ya aparecés pero podés ganar muchísimos más clicks si subís unas posiciones"
            icon={Sparkles}
            accent="amber"
          />
          <OpportunitiesCard opportunities={sortedOpps} loading={loading} />

          {sortedOpps.length > 0 && (
            <AurumSectionCard
              section="seo.opportunities"
              contextLabel="Oportunidades de oro"
              contextData={{
                totalOpportunities: sortedOpps.length,
                totalPotentialClicks: sortedOpps.reduce((a: number, o: any) => a + (o.potentialClicks || 0), 0),
                top10: sortedOpps.slice(0, 10).map((o: any) => ({
                  keyword: o.keyword,
                  position: Number((o.position || 0).toFixed(1)),
                  impressions: o.impressions,
                  ctr: Number(((o.ctr || 0) * 100).toFixed(2)),
                  potentialClicks: o.potentialClicks,
                })),
              }}
              suggestions={[
                "¿Por cuál empiezo?",
                "¿Cuánto tarda en verse resultado?",
                "¿Qué página trabajo primero?",
              ]}
            />
          )}
        </section>

        {/* ═══ 6. MOVIMIENTOS ═══ */}
        <section className="mt-8">
          <SectionHeader
            title="Movimientos del período"
            subtitle="Qué keywords subieron, bajaron, aparecieron o se perdieron vs el período anterior"
          />
          <MoversCard movers={movers} activeTab={moversTab} onTabChange={setMoversTab} loading={loading} />
        </section>

        {/* ═══ 7. TOP KEYWORDS ═══ */}
        <section className="mt-8">
          <SectionHeader
            title="Todas tus keywords"
            subtitle="Cada fila es una búsqueda que alguien hizo en Google y te llevó (o casi) a tu sitio"
            action={
              <SearchInput
                value={keywordQuery}
                onChange={setKeywordQuery}
                placeholder="Buscar keyword…"
              />
            }
          />
          <KeywordsTable keywords={filteredKeywords} loading={loading} />
        </section>

        {/* ═══ 8. TOP PÁGINAS ═══ */}
        <section className="mt-8">
          <SectionHeader
            title="Páginas con más tráfico orgánico"
            subtitle="Las URLs de tu sitio que más gente encuentra a través de Google"
            action={
              <SearchInput
                value={pageQuery}
                onChange={setPageQuery}
                placeholder="Buscar URL…"
              />
            }
          />
          <PagesTable pages={filteredPages} loading={loading} />
        </section>

        {/* ═══ 9. CANIBALIZACIÓN ═══ */}
        {cannibalization.length > 0 && (
          <section className="mt-8">
            <SectionHeader
              title="Atención: canibalización detectada"
              subtitle="Múltiples páginas tuyas compiten por la misma búsqueda. Google se confunde y te ranquea peor en todas."
              icon={AlertTriangle}
              accent="amber"
            />
            <CannibalizationCard items={cannibalization} loading={loading} />
            <AurumSectionCard
              section="seo.cannibalization"
              contextLabel="Canibalización detectada"
              contextData={{
                totalCases: cannibalization.length,
                cases: cannibalization.slice(0, 8).map((c: any) => ({
                  keyword: c.keyword,
                  pages: (c.pages || []).slice(0, 3),
                })),
              }}
              suggestions={[
                "¿Cuál resuelvo primero?",
                "¿Cómo sé cuál es la página ganadora?",
                "¿Mejor redirect o diferenciar?",
              ]}
            />
          </section>
        )}

        {/* ═══ 10. DEVICE + COUNTRY ═══ */}
        <section className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DeviceSplitCard
            deviceSplit={deviceSplit}
            totalClicks={totalDeviceClicks}
            pctMobile={pctMobile}
            loading={loading}
          />
          <CountrySplitCard countries={countrySplit} loading={loading} />
        </section>

        {totalDeviceClicks > 0 && (
          <AurumSectionCard
            section="seo.device"
            contextLabel="Dispositivos y países"
            contextData={{
              totalClicks: totalDeviceClicks,
              pctMobile,
              deviceSplit: (deviceSplit || []).map((d: any) => ({
                device: d.device,
                clicks: d.clicks,
                impressions: d.impressions,
                ctr: d.ctr,
                position: d.position,
              })),
              topCountries: (countrySplit || []).slice(0, 5).map((c: any) => ({
                country: c.country,
                clicks: c.clicks,
                impressions: c.impressions,
                ctr: c.ctr,
              })),
            }}
            suggestions={[
              "¿Qué dispositivo priorizo?",
              "¿Cómo mejoro la experiencia mobile?",
              "¿Qué me dice el split por país?",
            ]}
          />
        )}

        {/* ═══ FOOTER ═══ */}
        <div className="mt-10 mb-4 text-center text-[11px] text-slate-400">
          Datos desde Google Search Console · Actualización diaria automática
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes aurumBreath {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.04); filter: brightness(1.12); }
        }
        @keyframes aurumPulseRing {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.25); opacity: 0.2; }
        }
        @keyframes aurumOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
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
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   CommandBar
   ════════════════════════════════════════════════════ */

function CommandBar({
  dateFrom, dateTo, activeQuickRange, onQuickRange, onDateChange,
  lastSyncAt, isSyncing, onSync,
}: any) {
  const lastSyncText = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
    : "Nunca";

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(16,185,129,0.08))",
              border: "1px solid rgba(59,130,246,0.15)",
              boxShadow: "0 8px 24px -10px rgba(59,130,246,0.25)",
            }}
          >
            <Search size={18} className="text-blue-600" strokeWidth={2.2} />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Posicionamiento Orgánico
          </div>
        </div>
        <h1 className="mt-2 text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">
          SEO · Google Search Console
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">
          Todo el tráfico gratis que te manda Google, explicado simple. Cómo te encuentran, qué buscan, y dónde podés crecer.
        </p>
      </div>

      <div className="flex flex-col items-end gap-3">
        {/* Sync chip */}
        <button
          onClick={() => onSync && onSync()}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 text-[11px] text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-60"
          style={{
            boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 4px 10px -4px rgba(15,23,42,0.06)",
          }}
        >
          <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "Actualizando…" : `Últ. sync: ${lastSyncText}`}
        </button>

        {/* Date range */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1"
               style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.04)" }}>
            {QUICK_RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => onQuickRange(r.days)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  activeQuickRange === r.days
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1"
               style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.04)" }}>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateChange("from", e.target.value)}
              className="text-[11px] text-slate-700 bg-transparent outline-none tabular-nums"
            />
            <span className="text-slate-300">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateChange("to", e.target.value)}
              className="text-[11px] text-slate-700 bg-transparent outline-none tabular-nums"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════════════════
   HeroKPI
   ════════════════════════════════════════════════════ */

function HeroKPI({
  icon: Icon, iconColor, iconBg, label, tooltip, value, delta, inverse, loading, subtitle,
}: any) {
  return (
    <div
      className="rounded-2xl bg-white p-4 border border-slate-100 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
        transition: `all 300ms ${ES_TRANSITION}`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon size={18} strokeWidth={2.2} style={{ color: iconColor }} />
        </div>
        <InfoTip text={tooltip} />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <div className="text-2xl font-bold tracking-tight text-slate-900">
          {loading ? <span className="text-slate-300">—</span> : value}
        </div>
        {delta !== undefined && !loading && <DeltaPill value={delta} inverse={inverse} />}
      </div>
      {subtitle && (
        <div className="mt-1 text-[11px] text-slate-400">{subtitle}</div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   SectionHeader
   ════════════════════════════════════════════════════ */

function SectionHeader({
  title, subtitle, icon: Icon, accent, action,
}: any) {
  const accentMap: Record<string, { bg: string; icon: string }> = {
    amber: { bg: "bg-amber-50", icon: "text-amber-600" },
    emerald: { bg: "bg-emerald-50", icon: "text-emerald-600" },
    blue: { bg: "bg-blue-50", icon: "text-blue-600" },
    rose: { bg: "bg-rose-50", icon: "text-rose-600" },
  };
  const cfg = accent ? accentMap[accent] : null;
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        {Icon && cfg && (
          <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
            <Icon size={14} className={cfg.icon} strokeWidth={2.2} />
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
          {subtitle && (
            <p className="text-[13px] text-slate-500 mt-0.5 max-w-2xl">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   HealthScoreCard
   ════════════════════════════════════════════════════ */

function HealthScoreCard({ score, label, color, totalKws, pctTop3, pctTop10, breakdown, loading }: any) {
  const colorMap: Record<string, { ring: string; text: string; bg: string; soft: string }> = {
    emerald: { ring: "#10b981", text: "text-emerald-600", bg: "bg-emerald-50", soft: "from-emerald-50 to-emerald-50/0" },
    blue: { ring: "#3b82f6", text: "text-blue-600", bg: "bg-blue-50", soft: "from-blue-50 to-blue-50/0" },
    amber: { ring: "#f59e0b", text: "text-amber-600", bg: "bg-amber-50", soft: "from-amber-50 to-amber-50/0" },
    rose: { ring: "#ef4444", text: "text-rose-600", bg: "bg-rose-50", soft: "from-rose-50 to-rose-50/0" },
  };
  const cfg = colorMap[color] || colorMap.blue;
  const displayScore = useCountUp(score, 900);

  // Donut geometry
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;

  const bars = breakdown || { top3: 0, ctr: 0, pos: 0 };

  return (
    <div
      className="rounded-2xl bg-white p-5 border border-slate-100 relative overflow-hidden"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${cfg.soft} opacity-60 pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center`}>
            <Award size={14} className={cfg.text} strokeWidth={2.2} />
          </div>
          <h3 className="text-[13px] font-semibold text-slate-800">Salud SEO general</h3>
          <InfoTip text="Un puntaje único de 0 a 100 que combina cuántas keywords tenés en el top 3, tu CTR promedio y tu posición general. Más es mejor." />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <svg width={120} height={120} className="-rotate-90">
              <circle cx={60} cy={60} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={10} />
              <circle
                cx={60} cy={60} r={radius} fill="none"
                stroke={cfg.ring} strokeWidth={10} strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: `stroke-dashoffset 900ms ${ES_TRANSITION}` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {loading ? "—" : Math.round(displayScore)}
              </div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider ${cfg.text}`}>
                {label}
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 text-[11px]">
            <ScoreBar label="Top 3" detail="keywords en los 3 primeros" points={bars.top3} max={40} color="#10b981" />
            <ScoreBar label="CTR" detail="% que te hace click" points={bars.ctr} max={30} color="#3b82f6" />
            <ScoreBar label="Posición" detail="qué tan arriba aparecés" points={bars.pos} max={30} color="#f59e0b" />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Keywords totales</span>
          <span className="font-semibold text-slate-900 tabular-nums">{fmtNum(totalKws)}</span>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, detail, points, max, color }: any) {
  const pct = max > 0 ? Math.min((points / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold text-slate-700">{label}</span>
          <span className="text-[9px] text-slate-400">{detail}</span>
        </div>
        <span className="font-semibold tabular-nums text-slate-900">
          <span style={{ color }}>{Math.round(points)}</span>
          <span className="text-slate-300"> / {max}</span>
        </span>
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: color,
            transition: `width 900ms ${ES_TRANSITION}`,
          }}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   PositionDistCard
   ════════════════════════════════════════════════════ */

function PositionDistCard({ dist, total, loading }: any) {
  const buckets = [
    { key: "pos1_3", label: "Top 3", desc: "Primeros lugares", color: "#10b981", softBg: "bg-emerald-50" },
    { key: "pos4_10", label: "4–10", desc: "Primera página", color: "#3b82f6", softBg: "bg-blue-50" },
    { key: "pos11_20", label: "11–20", desc: "Segunda página", color: "#f59e0b", softBg: "bg-amber-50" },
    { key: "pos20plus", label: "20+", desc: "Fuera del top 20", color: "#94a3b8", softBg: "bg-slate-100" },
  ];

  return (
    <div
      className="rounded-2xl bg-white p-5 border border-slate-100"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
          <BarChart3 size={14} className="text-violet-600" strokeWidth={2.2} />
        </div>
        <h3 className="text-[13px] font-semibold text-slate-800">Dónde aparecés en Google</h3>
        <InfoTip text="Google te muestra 10 resultados por página. El Top 3 se lleva el 75% de los clicks. Pasar de página 2 (puesto 11+) a página 1 multiplica el tráfico." />
      </div>
      <div className="mt-4 space-y-2.5">
        {buckets.map((b) => {
          const count = dist[b.key] || 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={b.key}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.softBg}`} style={{ color: b.color }}>
                    {b.label}
                  </span>
                  <span className="text-slate-500">{b.desc}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-semibold text-slate-900 tabular-nums">{fmtNum(count)}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums">({pct.toFixed(1)}%)</span>
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: b.color,
                    transition: `width 900ms ${ES_TRANSITION}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   KeywordsBreakdownCard
   ════════════════════════════════════════════════════ */

function KeywordsBreakdownCard({ kwTop3, kwTop10, totalKeywords, loading }: any) {
  return (
    <div
      className="rounded-2xl bg-white p-5 border border-slate-100"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Trophy size={14} className="text-emerald-600" strokeWidth={2.2} />
        </div>
        <h3 className="text-[13px] font-semibold text-slate-800">Tus palabras ganadoras</h3>
        <InfoTip text="Las keywords son las búsquedas que la gente escribe en Google. Aparecer en el top 3 para muchas de ellas significa que Google te considera una fuente confiable." />
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-50/30 border border-emerald-100">
          <div>
            <div className="text-[11px] text-emerald-700 font-semibold">Top 3 — Primeros puestos</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Ganan el 75% de los clicks</div>
          </div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums">
            {loading ? "—" : <CountNum value={kwTop3} />}
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-50/30 border border-blue-100">
          <div>
            <div className="text-[11px] text-blue-700 font-semibold">Top 10 — Primera página</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Donde casi todos buscan</div>
          </div>
          <div className="text-2xl font-bold text-blue-700 tabular-nums">
            {loading ? "—" : <CountNum value={kwTop10} />}
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
          <div>
            <div className="text-[11px] text-slate-700 font-semibold">Total keywords únicas</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Búsquedas donde aparecés alguna vez</div>
          </div>
          <div className="text-2xl font-bold text-slate-700 tabular-nums">
            {loading ? "—" : <CountNum value={totalKeywords} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   TrendCard
   ════════════════════════════════════════════════════ */

function TrendCard({ title, tooltip, dailyTrend, metric, loading }: any) {
  const data = dailyTrend.map((d: any) => ({
    day: d.day,
    clicks: d.clicks || 0,
    impressions: d.impressions || 0,
    position: d.position || 0,
  }));

  return (
    <div
      className="rounded-2xl bg-white p-5 border border-slate-100"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        <InfoTip text={tooltip} />
      </div>
      <div style={{ height: 220 }}>
        {loading || data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-slate-400">
            {loading ? "Cargando…" : "Sin datos para este período"}
          </div>
        ) : metric === "clicksImpressions" ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gImp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtDateShort} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(v)} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(v)} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-2.5 text-[11px]">
                      <div className="font-semibold text-slate-800 mb-1">{fmtDateShort(label)}</div>
                      <div className="flex items-center gap-2 text-blue-600">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        Clicks: <span className="font-semibold tabular-nums">{fmtNum(payload[0]?.value)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-violet-600">
                        <div className="w-2 h-2 rounded-full bg-violet-400" />
                        Impresiones: <span className="font-semibold tabular-nums">{fmtNum(payload[1]?.value)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area yAxisId="r" type="monotone" dataKey="impressions" stroke="#a78bfa" strokeWidth={1.5} fill="url(#gImp)" />
              <Area yAxisId="l" type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} fill="url(#gClicks)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtDateShort} />
              <YAxis reversed tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => v.toFixed(0)} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-2.5 text-[11px]">
                      <div className="font-semibold text-slate-800 mb-1">{fmtDateShort(label)}</div>
                      <div className="flex items-center gap-2 text-amber-600">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        Posición: <span className="font-semibold tabular-nums">{payload[0]?.value?.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={10} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: "Top 10", fontSize: 9, fill: "#94a3b8", position: "right" }} />
              <Line type="monotone" dataKey="position" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   OpportunitiesCard
   ════════════════════════════════════════════════════ */

function OpportunitiesCard({ opportunities, loading }: any) {
  if (loading) {
    return <div className="mt-4 rounded-2xl bg-white p-6 border border-slate-100 text-center text-[12px] text-slate-400">Cargando oportunidades…</div>;
  }
  if (!opportunities || opportunities.length === 0) {
    return (
      <div
        className="mt-4 rounded-2xl bg-white p-6 border border-slate-100 text-center text-[13px] text-slate-500"
        style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10)" }}
      >
        <Sparkles size={28} className="mx-auto mb-2 text-amber-400" strokeWidth={1.5} />
        No detectamos oportunidades grandes en este período. Eso es buena señal: las keywords con muchas impresiones ya están bien posicionadas.
      </div>
    );
  }

  const top = opportunities.slice(0, 10);

  return (
    <div
      className="mt-4 rounded-2xl bg-white border border-slate-100 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="p-4 bg-gradient-to-br from-amber-50 to-transparent border-b border-amber-100 flex items-start gap-3">
        <Info size={14} className="text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
        <div className="text-[12px] text-slate-700 leading-relaxed">
          Estas keywords tienen <strong>muchas impresiones</strong> (mucha gente las busca y te ven) pero tu <strong>posición es baja</strong>.
          Si lográs mejorar el contenido de esas páginas y subís al top 3, podés ganar todos esos clicks extras sin pagar nada.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Keyword</th>
              <th className="px-3 py-2.5 font-semibold text-right">Impresiones</th>
              <th className="px-3 py-2.5 font-semibold text-right">Posición actual</th>
              <th className="px-3 py-2.5 font-semibold text-right">CTR actual</th>
              <th className="px-3 py-2.5 font-semibold text-right">
                <span className="inline-flex items-center gap-1">
                  Clicks potenciales
                  <InfoTip text="Estimación de cuántos clicks extras podrías ganar si subís esta keyword al top 3. Asumimos un CTR del 10% en top 3." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((o: any, i: number) => (
              <tr
                key={i}
                className="border-b border-slate-100 last:border-0 hover:bg-amber-50/30 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-900 truncate max-w-[280px]" title={o.keyword}>
                    {o.keyword}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {fmtCompact(o.impressions)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    {fmtPos(o.position)}
                    {o.position > 10 && <span className="text-[10px] text-amber-600 font-medium">pág. 2+</span>}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                  {fmtPct(o.ctr)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 tabular-nums">
                    <Plus size={11} strokeWidth={2.5} />
                    {fmtCompact(o.potentialClicks)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   MoversCard
   ════════════════════════════════════════════════════ */

function MoversCard({ movers, activeTab, onTabChange, loading }: any) {
  const tabs = [
    { id: "up", label: "Subiendo", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", count: movers.up?.length || 0 },
    { id: "down", label: "Bajando", icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50", count: movers.down?.length || 0 },
    { id: "new", label: "Nuevas", icon: Sparkles, color: "text-blue-600", bg: "bg-blue-50", count: movers.new?.length || 0 },
    { id: "lost", label: "Perdidas", icon: Minus, color: "text-slate-600", bg: "bg-slate-100", count: movers.lost?.length || 0 },
  ];

  const tabExplain: Record<string, string> = {
    up: "Keywords donde mejoraste tu posición en Google vs el período anterior.",
    down: "Keywords donde perdiste posición. Revisá si hay competidores nuevos o si el contenido de tu página cambió.",
    new: "Búsquedas donde antes no aparecías y ahora sí. Google empezó a mostrarte para estos términos.",
    lost: "Búsquedas donde aparecías antes y ya no. Puede ser que otros te superaron o Google cambió de opinión.",
  };

  const list = movers[activeTab] || [];

  const tabCoach: Record<string, any> = {
    up: {
      tone: "emerald",
      headline: "¡Vas bien! Así consolidás estos avances",
      essentials: [
        { title: "Identificá qué tienen en común las que subieron", detail: "¿Son de la misma categoría? ¿Cambiaste títulos en esas páginas? ¿Agregaste contenido nuevo? Replicá ese patrón en más páginas." },
        { title: "Reforzá las que están cerca del top 3", detail: "Si una keyword subió del puesto 12 al 7, un pequeño empujón extra puede moverla al top 3 y ahí el CTR triplica." },
        { title: "No toques lo que funciona", detail: "No edites por edit. Si una página está subiendo, dejala como está al menos 30 días más. Los cambios constantes confunden a Google." },
      ],
      extended: [
        { title: "Analizá el 'por qué' con Search Console", detail: "Entrá a Search Console > Rendimiento > filtrá por esas queries. Compará los últimos 28 días vs 28 anteriores. Buscá patrones en páginas y dispositivos." },
        { title: "Amplificá con enlaces internos", detail: "Agregá 2-3 enlaces internos hacia la página que está subiendo desde otras páginas relevantes del sitio. Usá texto ancla natural con variaciones de la keyword." },
        { title: "Aprovechá para capturar keywords long-tail", detail: "Si te rankeás bien para 'zapatillas running', probablemente puedas rankear 'zapatillas running mujer talle 38'. Creá contenido específico para variantes." },
        { title: "Compartí en redes y consegui señales", detail: "Contenido que sube orgánicamente merece amplificación. Compartilo en Instagram, en newsletter, en WhatsApp. Aunque redes sociales no dan SEO directo, sí generan tráfico y engagement que Google nota." },
      ],
    },
    down: {
      tone: "rose",
      headline: "Keywords en caída — hay que actuar ya",
      essentials: [
        { title: "Abrí la página que rankea para esa keyword", detail: "Chequeá si el contenido sigue siendo relevante, si la página carga rápido, si las imágenes están rotas, si hay errores 404 o redirects raros." },
        { title: "Buscá esa keyword en Google incógnito", detail: "Mirá quiénes son los que te están pasando. ¿Qué tienen de diferente? ¿Mejor contenido? ¿Más reseñas? ¿Precio más bajo? ¿Estructura distinta?" },
        { title: "Actualizá la página", detail: "Añadí información nueva (fecha actual, reviews, videos, preguntas frecuentes). Google premia el contenido fresco en ecommerce. Si el último edit fue hace 6+ meses, es momento de actualizar." },
      ],
      extended: [
        { title: "Checklist técnico urgente", detail: "Velocidad (PageSpeed <2.5s LCP) · Mobile-friendly · HTTPS · Sin errores 404 · Sin contenido duplicado · Schema markup correcto · Sitemap actualizado." },
        { title: "Revisá si perdiste enlaces externos", detail: "Con herramientas como Ahrefs Webmaster Tools (gratis) o Google Search Console > Enlaces, mirá si perdiste backlinks importantes. Si sí, contactá al dueño del sitio y pedí recuperarlo." },
        { title: "¿Cambió la intención de búsqueda?", detail: "Google a veces cambia qué cree que busca la gente. Si antes mostraba productos y ahora muestra blogs informativos para esa keyword, tu página de producto ya no encaja. Hay que crear contenido adaptado al nuevo tipo." },
        { title: "Competencia con precio agresivo", detail: "Si tu competencia bajó precios y muestra 'envío gratis' o 'cuotas sin interés' en los resultados, revisá tu propia estrategia de pricing y rich snippets. A veces no es SEO, es conversión." },
        { title: "Si la caída es brusca (>10 posiciones)", detail: "Puede ser una penalización manual o algorítmica. Revisá Search Console > Acciones manuales. Si no hay, probablemente fue un update de Google. Consultá searchliaison en Twitter/X y foros de SEO." },
      ],
    },
    new: {
      tone: "blue",
      headline: "Keywords nuevas — oportunidad de consolidar",
      essentials: [
        { title: "Priorizá las que tienen intención de compra", detail: "De las nuevas, identificá las que son transaccionales (con 'comprar', 'precio', nombres de producto). Esas son las que te van a traer ventas." },
        { title: "Chequeá que la página que rankea sea la correcta", detail: "A veces Google te rankea con una página que no era la mejor. Si estás rankeando la home para una keyword de producto, creá contenido específico en la ficha del producto para 'capturar' esa keyword en su lugar ideal." },
        { title: "Ayudale a Google a entender el tema", detail: "Agregá esa keyword (y variantes) naturalmente en H1, H2, párrafo inicial y meta description. No hagas keyword stuffing — usá sinónimos y contexto." },
      ],
      extended: [
        { title: "Explorá la 'familia' de esa keyword", detail: "Una keyword nueva trae otras relacionadas. Usá Google autocompletar, 'búsquedas relacionadas' al final del SERP y la pestaña 'People Also Ask' para descubrir variantes que también podrías capturar." },
        { title: "Creá contenido de soporte", detail: "Si estás rankeando 'pañales talla 3' de forma nueva, creá un artículo de blog tipo 'Cómo elegir la talla correcta de pañales' y enlazalo a la ficha de producto. Esto refuerza la relevancia temática." },
        { title: "Monitoreá el primer mes", detail: "Las keywords nuevas son inestables. Pueden subir mucho y después caer. Medí semanalmente durante 4 semanas para confirmar que se están asentando." },
        { title: "Ajustá el snippet (title + meta)", detail: "Si aparecés pero el CTR es bajo (<2%), tu snippet no está llamando la atención. Reescribí el title con un beneficio claro y la meta con un CTA. A veces agregar un emoji o precio destacado aumenta mucho el CTR." },
      ],
    },
    lost: {
      tone: "slate",
      headline: "Keywords perdidas — diagnosticá la causa",
      essentials: [
        { title: "¿Sigue existiendo la página?", detail: "Lo primero: confirmá que la URL que rankeaba no fue borrada o movida sin redirect 301. Es la causa #1 de perder keywords bruscamente." },
        { title: "Buscá la keyword en Google", detail: "Si tu sitio aparece pero en página 3+ (posición 21+), no la perdiste, solo la movieron. Tratala como una 'oportunidad' y trabajala. Si no aparece para nada, es otra historia." },
        { title: "Decidí si vale la pena recuperarla", detail: "No todas las keywords valen el esfuerzo. Si tenía <50 impresiones/mes o no tiene intención comercial, dejala ir. Enfocá energía en las que sí mueven la aguja." },
      ],
      extended: [
        { title: "Auditá technical SEO de la página", detail: "Usá Screaming Frog (gratis hasta 500 URLs) para ver errores técnicos: status codes, canonicals, noindex, robots.txt bloqueando, meta tags faltantes." },
        { title: "Revisá el índice de Google", detail: "En Search Console > Inspeccionar URL, chequeá si la página está indexada. Si dice 'No indexada', pedí indexación manual y esperá 3-7 días." },
        { title: "Contenido desactualizado u obsoleto", detail: "Si la keyword era de un producto discontinuado, modelo viejo o stock agotado hace tiempo, es normal que se pierda. Considerá redirect 301 a un producto equivalente." },
        { title: "Cambio de intención de búsqueda", detail: "Google puede haber decidido que para esa keyword ahora prefiere mostrar otros tipos de resultados (videos, shopping, local). En ese caso no es culpa tuya — adaptate creando ese tipo de contenido si tiene sentido." },
        { title: "Recuperación: contenido + enlaces", detail: "Si decidís recuperarla, actualizá la página con contenido más completo que los 10 que rankean, conseguí 1-2 enlaces externos hacia ella, y compartila en redes. Dale 30-60 días para re-rankear." },
      ],
    },
  };

  return (
    <div
      className="mt-4 rounded-2xl bg-white border border-slate-100 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      {/* Tabs */}
      <div className="flex items-center border-b border-slate-100 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold transition-colors whitespace-nowrap relative ${
                active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <div className={`w-5 h-5 rounded-md flex items-center justify-center ${t.bg}`}>
                <Icon size={12} className={t.color} strokeWidth={2.5} />
              </div>
              {t.label}
              <span className={`text-[10px] font-bold tabular-nums ${active ? "text-slate-900" : "text-slate-400"}`}>
                {t.count}
              </span>
              {active && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900"
                  style={{ animation: `fadeInUp 200ms ${ES_TRANSITION}` }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-3 bg-slate-50/40 border-b border-slate-100 text-[12px] text-slate-600">
        {tabExplain[activeTab]}
      </div>

      {/* List */}
      <div className="overflow-x-auto">
        {list.length === 0 ? (
          <div className="p-6 text-center text-[12px] text-slate-400">
            Sin movimientos en esta categoría para el período
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50/60 border-b border-slate-100">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Keyword</th>
                <th className="px-3 py-2.5 font-semibold text-right">Posición</th>
                <th className="px-3 py-2.5 font-semibold text-right">Cambio</th>
                <th className="px-3 py-2.5 font-semibold text-right">Clicks</th>
                <th className="px-3 py-2.5 font-semibold text-right">Impresiones</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 15).map((k: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900 truncate max-w-[320px]" title={k.keyword}>
                      {k.keyword}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {activeTab === "down" || activeTab === "up" ? (
                      <span className="inline-flex flex-col items-end">
                        <span>{fmtPos(k.position)}</span>
                        {k.prevPosition != null && (
                          <span className="text-[10px] text-slate-400">antes: {fmtPos(k.prevPosition)}</span>
                        )}
                      </span>
                    ) : (
                      fmtPos(k.position)
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {k.change != null ? (
                      <span className={`inline-flex items-center gap-0.5 font-semibold ${
                        k.change > 0 ? "text-emerald-600" : k.change < 0 ? "text-rose-600" : "text-slate-400"
                      }`}>
                        {k.change > 0 ? <ArrowUpRight size={11} strokeWidth={2.5} /> : <ArrowDownRight size={11} strokeWidth={2.5} />}
                        {Math.abs(k.change).toFixed(1)}
                      </span>
                    ) : activeTab === "new" ? (
                      <span className="text-[10px] text-blue-600 font-semibold">Nueva</span>
                    ) : activeTab === "lost" ? (
                      <span className="text-[10px] text-slate-500 font-semibold">Perdida</span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtNum(k.clicks)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmtCompact(k.impressions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {list.length > 0 && (
        <div className="px-4 pb-4 -mt-1">
          <AurumSectionCard
            key={`movers-${activeTab}`}
            section={`seo.movers.${activeTab}`}
            contextLabel={
              activeTab === "up"
                ? "Keywords subiendo"
                : activeTab === "down"
                ? "Keywords bajando"
                : activeTab === "new"
                ? "Keywords nuevas"
                : "Keywords perdidas"
            }
            contextData={{
              tab: activeTab,
              total: list.length,
              keywords: list.slice(0, 12).map((k: any) => ({
                keyword: k.keyword,
                position: k.position,
                prevPosition: k.prevPosition ?? null,
                change: k.change ?? null,
                clicks: k.clicks,
                impressions: k.impressions,
              })),
            }}
            suggestions={
              activeTab === "up"
                ? [
                    "¿Qué patrón tienen las que subieron?",
                    "¿Cuál conviene reforzar primero?",
                    "¿Cómo capitalizo este avance?",
                  ]
                : activeTab === "down"
                ? [
                    "¿Cuál recupero primero?",
                    "¿Qué puede estar pasando?",
                    "¿Cuáles dejo ir?",
                  ]
                : activeTab === "new"
                ? [
                    "¿Cuál vale la pena consolidar?",
                    "¿Cómo aseguro que se queden?",
                    "¿Qué tienen en común?",
                  ]
                : [
                    "¿Cuál recupero y cuál dejo ir?",
                    "¿Por qué las puedo haber perdido?",
                    "¿Qué chequeo primero?",
                  ]
            }
          />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   SearchInput
   ════════════════════════════════════════════════════ */

function SearchInput({ value, onChange, placeholder }: any) {
  return (
    <div
      className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 min-w-[220px]"
      style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.04)" }}
    >
      <Search size={13} className="text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-[12px] text-slate-700 bg-transparent outline-none placeholder:text-slate-400"
      />
      {value && (
        <button onClick={() => onChange("")} className="text-slate-400 hover:text-slate-600">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   KeywordsTable
   ════════════════════════════════════════════════════ */

function KeywordsTable({ keywords, loading }: any) {
  const rows = keywords.slice(0, 50);
  return (
    <div
      className="mt-4 rounded-2xl bg-white border border-slate-100 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Keyword</th>
              <th className="px-3 py-2.5 font-semibold text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Clicks <InfoTip text="Visitas que recibiste desde Google por esa búsqueda." />
                </span>
              </th>
              <th className="px-3 py-2.5 font-semibold text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Impresiones <InfoTip text="Cuántas veces apareciste en los resultados por esa búsqueda." />
                </span>
              </th>
              <th className="px-3 py-2.5 font-semibold text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  CTR <InfoTip text="% de gente que te hizo click después de verte." />
                </span>
              </th>
              <th className="px-3 py-2.5 font-semibold text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Posición <InfoTip text="Tu lugar promedio en los resultados. Menos es mejor (1 es el primero)." />
                </span>
              </th>
              <th className="px-3 py-2.5 font-semibold text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Cambio pos. <InfoTip text="Cuánto subiste o bajaste de posición vs el período anterior." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Cargando keywords…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sin keywords para mostrar</td>
              </tr>
            ) : (
              rows.map((k: any, i: number) => {
                const posBucket = k.position <= 3 ? "emerald" : k.position <= 10 ? "blue" : k.position <= 20 ? "amber" : "slate";
                const bucketColor: Record<string, string> = {
                  emerald: "bg-emerald-50 text-emerald-700",
                  blue: "bg-blue-50 text-blue-700",
                  amber: "bg-amber-50 text-amber-700",
                  slate: "bg-slate-100 text-slate-600",
                };
                return (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900 truncate max-w-[320px]" title={k.keyword}>
                        {k.keyword}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 font-semibold">{fmtNum(k.clicks)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtCompact(k.impressions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtPct(k.ctr)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${bucketColor[posBucket]}`}>
                        {fmtPos(k.position)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {k.positionChange != null && k.positionChange !== 0 ? (
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
                          k.positionChange > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}>
                          {k.positionChange > 0 ? <ArrowUpRight size={11} strokeWidth={2.5} /> : <ArrowDownRight size={11} strokeWidth={2.5} />}
                          {Math.abs(k.positionChange).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="px-4 py-2 bg-slate-50/40 border-t border-slate-100 text-[10px] text-slate-400 text-right">
          Mostrando las top {rows.length} keywords por clicks
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   PagesTable
   ════════════════════════════════════════════════════ */

function PagesTable({ pages, loading }: any) {
  const rows = pages.slice(0, 30);
  return (
    <div
      className="mt-4 rounded-2xl bg-white border border-slate-100 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Página</th>
              <th className="px-3 py-2.5 font-semibold text-right">Clicks</th>
              <th className="px-3 py-2.5 font-semibold text-right">Impresiones</th>
              <th className="px-3 py-2.5 font-semibold text-right">CTR</th>
              <th className="px-3 py-2.5 font-semibold text-right">Posición</th>
              <th className="px-3 py-2.5 font-semibold text-right">
                <span className="inline-flex items-center gap-1 justify-end">
                  Keywords <InfoTip text="Cuántas búsquedas distintas te traen tráfico a esta página." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Cargando páginas…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sin páginas para mostrar</td></tr>
            ) : rows.map((p: any, i: number) => {
              const path = (() => {
                try {
                  const u = new URL(p.url);
                  return u.pathname + (u.search || "");
                } catch {
                  return p.url;
                }
              })();
              return (
                <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener"
                        className="font-medium text-blue-700 hover:text-blue-900 truncate max-w-[360px] underline-offset-2 hover:underline"
                        title={p.url}
                      >
                        {path === "/" ? "Home" : path}
                      </a>
                      <ExternalLink size={11} className="text-slate-400 flex-shrink-0" />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 font-semibold">{fmtNum(p.clicks)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtCompact(p.impressions)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtPct(p.ctr)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtPos(p.avgPosition)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtNum(p.keywordCount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   CannibalizationCard
   ════════════════════════════════════════════════════ */

function CannibalizationCard({ items, loading }: any) {
  return (
    <div
      className="mt-4 rounded-2xl bg-white border border-amber-200 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 0 rgba(245,158,11,0.08), 0 8px 24px -12px rgba(245,158,11,0.18), 0 22px 40px -28px rgba(245,158,11,0.12)",
      }}
    >
      <div className="p-4 bg-gradient-to-br from-amber-50 to-transparent border-b border-amber-100 flex items-start gap-3">
        <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
        <div className="text-[12px] text-slate-700 leading-relaxed">
          <strong>Qué hacer:</strong> elegí una sola página principal para cada búsqueda,
          mejorá el contenido de esa, y del resto redirigí a la principal o diferenciá el
          contenido para que apunten a búsquedas distintas.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Keyword</th>
              <th className="px-3 py-2.5 font-semibold text-center">Páginas compitiendo</th>
              <th className="px-3 py-2.5 font-semibold text-right">Clicks totales</th>
              <th className="px-3 py-2.5 font-semibold text-right">Impresiones</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 10).map((c: any, i: number) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-amber-50/30 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-900 truncate max-w-[240px]" title={c.keyword}>
                    {c.keyword}
                  </div>
                  {c.pages && c.pages.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {c.pages.slice(0, 3).map((pg: string, j: number) => (
                        <div key={j} className="text-[10px] text-slate-500 truncate max-w-[360px]" title={pg}>
                          · {pg}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold">
                    <Layers size={11} strokeWidth={2.5} />
                    {c.pageCount}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmtNum(c.clicks)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmtCompact(c.impressions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   DeviceSplitCard
   ════════════════════════════════════════════════════ */

function DeviceSplitCard({ deviceSplit, totalClicks, pctMobile, loading }: any) {
  const devices = [
    { key: "MOBILE", label: "Móvil", Icon: Smartphone, color: "#3b82f6", bg: "bg-blue-50", text: "text-blue-700" },
    { key: "DESKTOP", label: "Escritorio", Icon: Monitor, color: "#8b5cf6", bg: "bg-violet-50", text: "text-violet-700" },
    { key: "TABLET", label: "Tablet", Icon: Monitor, color: "#10b981", bg: "bg-emerald-50", text: "text-emerald-700" },
  ];

  return (
    <div
      className="rounded-2xl bg-white p-5 border border-slate-100"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
          <Smartphone size={14} className="text-blue-600" strokeWidth={2.2} />
        </div>
        <h3 className="text-[13px] font-semibold text-slate-800">Desde qué dispositivo te encuentran</h3>
        <InfoTip text="Saber esto te ayuda a priorizar: si el 80% viene de móvil, asegurate que tu sitio cargue rápido y se vea bien en celular." />
      </div>
      {loading ? (
        <div className="mt-4 text-[12px] text-slate-400">Cargando…</div>
      ) : deviceSplit.length === 0 ? (
        <div className="mt-4 text-[12px] text-slate-400">Sin datos</div>
      ) : (
        <div className="mt-4 space-y-3">
          {devices.map((d) => {
            const row = deviceSplit.find((x: any) => (x.device || "").toUpperCase() === d.key);
            if (!row) return null;
            const pct = totalClicks > 0 ? (row.clicks / totalClicks) * 100 : 0;
            return (
              <div key={d.key}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-md ${d.bg} flex items-center justify-center`}>
                      <d.Icon size={11} style={{ color: d.color }} strokeWidth={2.5} />
                    </div>
                    <span className="font-medium text-slate-700">{d.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="font-semibold text-slate-900">{fmtNum(row.clicks)}</span>
                    <span className="text-[10px] text-slate-400">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: d.color,
                      transition: `width 900ms ${ES_TRANSITION}`,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>CTR: {fmtPct(row.ctr)}</span>
                  <span>Pos: {fmtPos(row.avgPosition)}</span>
                </div>
              </div>
            );
          })}
          {pctMobile > 70 && (
            <div className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-800 flex items-start gap-2">
              <Info size={12} className="flex-shrink-0 mt-0.5" />
              El <strong>{pctMobile.toFixed(0)}%</strong> de tu tráfico viene de celular. Prioridad total a la experiencia móvil (velocidad, botones grandes, checkout simple).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   CountrySplitCard
   ════════════════════════════════════════════════════ */

function CountrySplitCard({ countries, loading }: any) {
  const top = countries.slice(0, 6);
  const total = top.reduce((a: number, c: any) => a + (c.clicks || 0), 0);

  return (
    <div
      className="rounded-2xl bg-white p-5 border border-slate-100"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Globe size={14} className="text-emerald-600" strokeWidth={2.2} />
        </div>
        <h3 className="text-[13px] font-semibold text-slate-800">De dónde viene tu tráfico</h3>
        <InfoTip text="Los países desde donde Google está mostrando tu sitio. Útil para confirmar que estás capturando el mercado correcto." />
      </div>
      {loading ? (
        <div className="mt-4 text-[12px] text-slate-400">Cargando…</div>
      ) : top.length === 0 ? (
        <div className="mt-4 text-[12px] text-slate-400">Sin datos de países</div>
      ) : (
        <div className="mt-4 space-y-2">
          {top.map((c: any, i: number) => {
            const pct = total > 0 ? (c.clicks / total) * 100 : 0;
            const name = COUNTRY_NAMES[c.country] || COUNTRY_NAMES[(c.country || "").toLowerCase()] || c.country;
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="font-medium text-slate-700 capitalize">{name}</span>
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="font-semibold text-slate-900">{fmtNum(c.clicks)}</span>
                    <span className="text-[10px] text-slate-400">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                    style={{
                      width: `${pct}%`,
                      transition: `width 900ms ${ES_TRANSITION}`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
