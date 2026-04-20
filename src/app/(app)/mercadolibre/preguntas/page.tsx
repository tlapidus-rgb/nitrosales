// @ts-nocheck
"use client";

/**
 * /mercadolibre/preguntas — Premium upgrade (Fase 9)
 * ─────────────────────────────────────────────────────────────
 * Read-only sobre data importada desde MELI (NUNCA toca producción).
 * Premium look + indicador de tiempo restante (24hs MELI) + toggle
 * vista lista/agrupado por producto + link directo a MELI para responder.
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  MessageSquare, Clock, CheckCircle2, AlertCircle, Search,
  ChevronLeft, ChevronRight, ExternalLink, User, ArrowLeft,
  Loader2, AlertTriangle, Layers, List, Filter,
} from "lucide-react";

const ML_GRADIENT = "linear-gradient(135deg, #fbbf24, #f97316)";
const ML_PRIMARY = "#f59e0b";

interface PreguntasData {
  kpis: {
    total: number; unanswered: number; answered: number;
    responseRate: string; avgResponseMinutes: number; avgResponseHours: string;
  };
  questionsByItem: Array<{
    mlItemId: string; count: number; title: string; thumbnail: string | null;
  }>;
  questions: Array<{
    id: string; mlQuestionId: string; text: string; status: string;
    dateCreated: string; answerText: string | null; answerDate: string | null;
    mlItemId: string; itemTitle: string; itemThumbnail: string | null;
    itemPermalink: string | null; fromBuyerId: string | null;
  }>;
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  UNANSWERED: "#f59e0b", ANSWERED: "#10b981", CLOSED_UNANSWERED: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
  UNANSWERED: "Sin responder", ANSWERED: "Respondida", CLOSED_UNANSWERED: "Cerrada",
};

// Calcula tiempo restante (24hs MELI) y devuelve badge config
function urgencyBadge(dateCreated: string, status: string) {
  if (status !== "UNANSWERED") return null;
  const elapsedHours = (Date.now() - new Date(dateCreated).getTime()) / 3600000;
  const remainingHours = 24 - elapsedHours;
  if (remainingHours <= 0) return { tone: "#94a3b8", label: "Ventana cerrada", urgent: false };
  if (remainingHours < 2) return { tone: "#ef4444", label: `${Math.floor(remainingHours * 60)}min restantes`, urgent: true };
  if (remainingHours < 12) return { tone: "#f59e0b", label: `${Math.floor(remainingHours)}h restantes`, urgent: true };
  return { tone: "#0ea5e9", label: `${Math.floor(remainingHours)}h restantes`, urgent: false };
}

export default function PreguntasPage() {
  const [data, setData] = useState<PreguntasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "grouped">("list");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    if (search) params.set("search", search);
    fetch(`/api/mercadolibre/preguntas?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [status, search, page]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const groupedByItem = useMemo(() => {
    if (!data) return [];
    const groups: Record<string, { item: any; questions: typeof data.questions }> = {};
    for (const q of data.questions) {
      if (!groups[q.mlItemId]) {
        groups[q.mlItemId] = {
          item: { id: q.mlItemId, title: q.itemTitle, thumbnail: q.itemThumbnail, permalink: q.itemPermalink },
          questions: [],
        };
      }
      groups[q.mlItemId].questions.push(q);
    }
    return Object.values(groups).sort((a, b) => b.questions.length - a.questions.length);
  }, [data]);

  if (loading && !data) return <PageShell><LoadingState text="Cargando preguntas…" /></PageShell>;
  if (!data) return null;
  const { kpis, questions, pagination } = data;

  return (
    <PageShell>
      <Breadcrumb />

      {/* HERO HEADER */}
      <HeroHeader
        title="Preguntas"
        subtitle="Preguntas de compradores en MercadoLibre — respondé desde MELI dentro de 24hs"
        Icon={MessageSquare}
      />

      {/* KPIs PREMIUM */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiPremium
          label="Sin responder"
          value={kpis.unanswered.toLocaleString("es-AR")}
          sub={kpis.unanswered > 0 ? "requieren atención" : "todo al día"}
          tone={kpis.unanswered > 10 ? "#ef4444" : kpis.unanswered > 0 ? "#f59e0b" : "#10b981"}
          Icon={AlertCircle}
        />
        <KpiPremium
          label="Respondidas"
          value={kpis.answered.toLocaleString("es-AR")}
          sub={`${kpis.responseRate}% tasa de respuesta`}
          tone="#10b981"
          Icon={CheckCircle2}
        />
        <KpiPremium
          label="Tiempo promedio"
          value={formatResponseTime(kpis.avgResponseMinutes)}
          sub="hasta responder"
          tone="#3b82f6"
          Icon={Clock}
        />
        <KpiPremium
          label="Total preguntas"
          value={kpis.total.toLocaleString("es-AR")}
          sub="histórico"
          tone="#8b5cf6"
          Icon={MessageSquare}
        />
      </div>

      {/* TOP ITEMS WITH QUESTIONS */}
      {data.questionsByItem.length > 0 && (
        <div
          style={{
            background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)",
            padding: 22, marginBottom: 16,
            boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `${ML_PRIMARY}12`, color: ML_PRIMARY, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Layers size={14} />
            </div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em", margin: 0 }}>
              Productos con más preguntas
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.questionsByItem.map((item, i) => (
              <div key={item.mlItemId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, transition: "background 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", width: 18, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ width: 32, height: 32, borderRadius: 7, overflow: "hidden", background: "#f1f5f9", flexShrink: 0 }}>
                  {item.thumbnail ? <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <MessageSquare size={14} style={{ color: "#cbd5e1", margin: "8px auto" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{item.mlItemId}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: ML_PRIMARY, background: `${ML_PRIMARY}12`, padding: "3px 9px", borderRadius: 999, fontVariantNumeric: "tabular-nums" }}>
                  {item.count} {item.count === 1 ? "pregunta" : "preguntas"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FILTERS bar */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 16, flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FilterPill active={status === "all"} onClick={() => { setStatus("all"); setPage(1); }} tone={ML_PRIMARY}>
            Todas
          </FilterPill>
          <FilterPill active={status === "UNANSWERED"} onClick={() => { setStatus("UNANSWERED"); setPage(1); }} tone="#f59e0b">
            Sin responder
          </FilterPill>
          <FilterPill active={status === "ANSWERED"} onClick={() => { setStatus("ANSWERED"); setPage(1); }} tone="#10b981">
            Respondidas
          </FilterPill>

          <div style={{ width: 1, height: 22, background: "rgba(15,23,42,.08)", margin: "0 4px" }} />

          {/* View toggle */}
          <button
            onClick={() => setView("list")}
            title="Vista lista"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "7px 11px",
              background: view === "list" ? `${ML_PRIMARY}12` : "transparent",
              color: view === "list" ? ML_PRIMARY : "#64748b",
              border: `1px solid ${view === "list" ? `${ML_PRIMARY}30` : "rgba(15,23,42,.08)"}`,
              borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >
            <List size={12} /> Lista
          </button>
          <button
            onClick={() => setView("grouped")}
            title="Vista agrupada por producto"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "7px 11px",
              background: view === "grouped" ? `${ML_PRIMARY}12` : "transparent",
              color: view === "grouped" ? ML_PRIMARY : "#64748b",
              border: `1px solid ${view === "grouped" ? `${ML_PRIMARY}30` : "rgba(15,23,42,.08)"}`,
              borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >
            <Layers size={12} /> Agrupado
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text" placeholder="Buscar en preguntas…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{
                paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                border: "1px solid rgba(15,23,42,.1)", borderRadius: 8,
                fontSize: 12, color: "#0f172a", background: "white", width: 240, outline: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* QUESTIONS — Lista o Agrupado */}
      {view === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.map((q) => <QuestionCard key={q.id} q={q} />)}
          {questions.length === 0 && <EmptyState total={kpis.total} />}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groupedByItem.map(({ item, questions: qs }) => (
            <div key={item.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, overflow: "hidden", background: "#f1f5f9", flexShrink: 0 }}>
                  {item.thumbnail ? <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <MessageSquare size={14} style={{ color: "#cbd5e1", margin: "8px auto" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {qs.length} {qs.length === 1 ? "pregunta" : "preguntas"}
                  </div>
                </div>
                {item.permalink && (
                  <a href={item.permalink} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: ML_PRIMARY, textDecoration: "none", fontWeight: 600 }}>
                    Ver en MELI <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18, borderLeft: `2px solid ${ML_PRIMARY}25` }}>
                {qs.map((q) => <QuestionCard key={q.id} q={q} compact />)}
              </div>
            </div>
          ))}
          {groupedByItem.length === 0 && <EmptyState total={kpis.total} />}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, padding: "16px 0" }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
            Página <b style={{ color: "#475569" }}>{pagination.page}</b> de {pagination.totalPages}
            <span style={{ marginLeft: 8 }}>· {pagination.totalCount.toLocaleString("es-AR")} preguntas</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <PagBtn onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
              <ChevronLeft size={12} /> Anterior
            </PagBtn>
            <PagBtn onClick={() => setPage(page + 1)} disabled={page >= pagination.totalPages}>
              Siguiente <ChevronRight size={12} />
            </PagBtn>
          </div>
        </div>
      )}

      <SharedStyles />
    </PageShell>
  );
}

// ════════════════════════════════════════════════════════════════
// Subcomponents
// ════════════════════════════════════════════════════════════════

function QuestionCard({ q, compact }: { q: any; compact?: boolean }) {
  const urgency = urgencyBadge(q.dateCreated, q.status);
  const sevColor = STATUS_COLORS[q.status] || "#94a3b8";

  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,.05)",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
        transition: "all 0.15s cubic-bezier(0.16,1,0.3,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)";
        e.currentTarget.style.borderColor = "rgba(15,23,42,.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)";
        e.currentTarget.style.borderColor = "rgba(15,23,42,.05)";
      }}
    >
      {/* Accent bar lateral */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sevColor }} />

      <div style={{ padding: "14px 18px 14px 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {!compact && (
            <div style={{ width: 44, height: 44, borderRadius: 9, overflow: "hidden", background: "#f1f5f9", flexShrink: 0 }}>
              {q.itemThumbnail ? <img src={q.itemThumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <MessageSquare size={18} style={{ color: "#cbd5e1", margin: "13px auto" }} />}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Item title + status + urgency */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {!compact && (
                <span style={{ fontSize: 11, color: "#64748b", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                  {q.itemTitle}
                </span>
              )}
              <Badge label={STATUS_LABELS[q.status] || q.status} tone={sevColor} />
              {urgency && <Badge label={urgency.label} tone={urgency.tone} pulse={urgency.urgent} />}
              {q.itemPermalink && (
                <a href={q.itemPermalink} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#94a3b8", fontSize: 11, fontWeight: 600, textDecoration: "none", padding: "3px 7px", borderRadius: 6, transition: "all 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${ML_PRIMARY}12`; e.currentTarget.style.color = ML_PRIMARY; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
                >
                  Responder en MELI <ExternalLink size={11} />
                </a>
              )}
            </div>

            {/* Question */}
            <div
              style={{
                background: "rgba(245,158,11,.06)",
                border: "1px solid rgba(245,158,11,.18)",
                borderRadius: 10, padding: 12, marginBottom: q.answerText ? 8 : 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <User size={11} style={{ color: ML_PRIMARY }} />
                <span style={{ fontSize: 10, color: ML_PRIMARY, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Comprador</span>
                <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{formatDate(q.dateCreated)}</span>
              </div>
              <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{q.text}</div>
            </div>

            {/* Answer */}
            {q.answerText && (
              <div
                style={{
                  background: "rgba(16,185,129,.06)",
                  border: "1px solid rgba(16,185,129,.18)",
                  borderRadius: 10, padding: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <CheckCircle2 size={11} style={{ color: "#10b981" }} />
                  <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Tu respuesta</span>
                  {q.answerDate && (
                    <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{formatDate(q.answerDate)}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{q.answerText}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ label, tone, pulse }: { label: string; tone: string; pulse?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
        background: `${tone}15`, color: tone,
        padding: "3px 8px", borderRadius: 5,
      }}
    >
      {pulse && <span style={{ width: 5, height: 5, borderRadius: 999, background: tone, animation: "pulseDot 1.5s infinite" }} />}
      {label}
    </span>
  );
}

function FilterPill({ children, active, onClick, tone }: { children: React.ReactNode; active: boolean; onClick: () => void; tone: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 13px",
        background: active ? `${tone}12` : "white",
        color: active ? tone : "#64748b",
        border: `1px solid ${active ? `${tone}30` : "rgba(15,23,42,.08)"}`,
        borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
        transition: "all 0.15s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {children}
    </button>
  );
}

function KpiPremium({ label, value, sub, tone, Icon }: { label: string; value: string; sub?: string; tone: string; Icon: any }) {
  return (
    <div
      style={{
        padding: "20px 22px",
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,.05)",
        boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${tone}, ${tone}40)` }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {value}
          </div>
          {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${tone}12`, color: tone, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} />
        </div>
      </div>
    </div>
  );
}

function HeroHeader({ title, subtitle, Icon }: { title: string; subtitle: string; Icon: any }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 18,
        border: "1px solid rgba(15,23,42,.05)",
        padding: "26px 30px",
        marginBottom: 24,
        boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 8px 24px rgba(15,23,42,.04)",
        display: "flex", alignItems: "center", gap: 18,
      }}
    >
      <div
        style={{
          width: 56, height: 56, borderRadius: 14,
          background: ML_GRADIENT, color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 6px 20px rgba(245,158,11,.35)",
        }}
      >
        <Icon size={26} />
      </div>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "#0f172a", margin: 0, marginBottom: 4 }}>
          {title}
        </h1>
        <div style={{ fontSize: 13, color: "#64748b", maxWidth: 560, lineHeight: 1.5 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function Breadcrumb() {
  return (
    <Link
      href="/mercadolibre"
      style={{ fontSize: 12, color: "#94a3b8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 18, transition: "color 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
    >
      <ArrowLeft size={13} /> MercadoLibre
    </Link>
  );
}

function PagBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "7px 12px",
        background: "white",
        color: disabled ? "#cbd5e1" : "#475569",
        border: "1px solid rgba(15,23,42,.1)",
        borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12, fontWeight: 600,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ total }: { total: number }) {
  return (
    <div
      style={{
        background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)",
        padding: 48, textAlign: "center",
      }}
    >
      <MessageSquare size={32} style={{ color: "#cbd5e1", margin: "0 auto 8px" }} />
      <div style={{ fontSize: 13, color: "#94a3b8" }}>
        {total === 0 ? "Sin preguntas sincronizadas. Sincronizá MELI desde el dashboard." : "No se encontraron preguntas con esos filtros."}
      </div>
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 60, justifyContent: "center", color: "#94a3b8" }}>
      <Loader2 size={18} className="spin" style={{ color: ML_PRIMARY }} />
      <span style={{ fontSize: 14 }}>{text}</span>
      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100%",
        padding: "32px 40px 64px",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          background:
            "radial-gradient(900px 500px at 85% -10%, rgba(245,158,11,.08), transparent 60%)," +
            "radial-gradient(700px 400px at 5% 30%, rgba(251,191,36,.05), transparent 60%)," +
            "radial-gradient(600px 400px at 50% 110%, rgba(249,115,22,.04), transparent 60%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1240, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function SharedStyles() {
  return (
    <style jsx global>{`
      @keyframes pulseDot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `}</style>
  );
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
}

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}
