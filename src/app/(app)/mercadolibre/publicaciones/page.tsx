// @ts-nocheck
"use client";

/**
 * /mercadolibre/publicaciones — Premium upgrade (Fase 9)
 * ─────────────────────────────────────────────────────────────
 * Read-only sobre data importada desde MELI (NUNCA toca producción).
 * Premium look + indicador stock crítico + chips por tipo + link
 * directo a MELI para editar allá.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  Package, Search, Tag, Truck, Star, ExternalLink,
  ChevronLeft, ChevronRight, Eye, EyeOff, ArrowLeft,
  Loader2, AlertTriangle, Layers, DollarSign, ShoppingCart, Award,
} from "lucide-react";

const ML_GRADIENT = "linear-gradient(135deg, #fbbf24, #f97316)";
const ML_PRIMARY = "#f59e0b";

interface PublicacionesData {
  kpis: {
    total: number; active: number; paused: number; closed: number;
    avgPrice: number; totalStock: number; totalSold: number;
    freeShipping: number; freeShippingPct: string;
    catalog: number; catalogPct: string;
    fulfillment: number; fulfillmentPct: string;
  };
  listingTypes: Array<{ type: string; count: number }>;
  listings: Array<{
    id: string; mlItemId: string; title: string; status: string;
    price: number; originalPrice: number | null; currencyId: string;
    availableQty: number; soldQty: number; listingType: string;
    condition: string; permalink: string; thumbnailUrl: string;
    freeShipping: boolean; fulfillment: string; catalogListing: boolean;
  }>;
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981", paused: "#f59e0b", closed: "#94a3b8", under_review: "#8b5cf6",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Activa", paused: "Pausada", closed: "Cerrada", under_review: "En revisión",
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  gold_special: "Premium", gold_pro: "Oro Pro", gold: "Oro", silver: "Plata", bronze: "Bronce", free: "Gratis",
};

const LISTING_TYPE_COLORS: Record<string, string> = {
  gold_special: "#fbbf24", gold_pro: "#f59e0b", gold: "#f97316",
  silver: "#94a3b8", bronze: "#a16207", free: "#cbd5e1",
};

export default function PublicacionesPage() {
  const [data, setData] = useState<PublicacionesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    if (search) params.set("search", search);
    fetch(`/api/mercadolibre/publicaciones?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [status, search, page]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  if (loading && !data) return <PageShell><LoadingState text="Cargando publicaciones…" /></PageShell>;
  if (!data) return null;
  const { kpis, listings, pagination } = data;

  return (
    <PageShell>
      <Breadcrumb />

      <HeroHeader
        title="Publicaciones"
        subtitle="Catálogo de tus publicaciones en MercadoLibre — para editar precio o stock, abrí el listing en MELI"
        Icon={Package}
      />

      {/* KPIs PREMIUM */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiPremium label="Activas" value={kpis.active.toLocaleString("es-AR")} sub={`${kpis.total} total`} tone="#10b981" Icon={Eye} />
        <KpiPremium label="Pausadas" value={kpis.paused.toLocaleString("es-AR")} sub={kpis.paused > 0 ? "revisar" : "todo activo"} tone={kpis.paused > 0 ? "#f59e0b" : "#94a3b8"} Icon={EyeOff} />
        <KpiPremium label="Precio promedio" value={formatARS(kpis.avgPrice)} sub="por publicación" tone="#8b5cf6" Icon={Tag} />
        <KpiPremium label="Stock total" value={formatCompact(kpis.totalStock)} sub="unidades" tone="#3b82f6" Icon={Package} />
        <KpiPremium label="Envío gratis" value={`${kpis.freeShippingPct}%`} sub={`${kpis.freeShipping.toLocaleString("es-AR")} pubs`} tone="#06b6d4" Icon={Truck} />
        <KpiPremium label="Full / Catálogo" value={`${kpis.fulfillmentPct}%`} sub={`${kpis.fulfillment} full · ${kpis.catalog} cat`} tone={ML_PRIMARY} Icon={Award} />
      </div>

      {/* LISTING TYPES — chips coloreadas */}
      {data.listingTypes.length > 0 && (
        <div
          style={{
            background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)",
            padding: 18, marginBottom: 16,
            boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `${ML_PRIMARY}12`, color: ML_PRIMARY, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Layers size={14} />
            </div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em", margin: 0 }}>
              Distribución por tipo de publicación
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.listingTypes.map((lt) => {
              const tone = LISTING_TYPE_COLORS[lt.type] || "#94a3b8";
              return (
                <div key={lt.type} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", background: `${tone}10`, border: `1px solid ${tone}25`, borderRadius: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: tone }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{LISTING_TYPE_LABELS[lt.type] || lt.type}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums" }}>{lt.count.toLocaleString("es-AR")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FILTERS bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { value: "all", label: "Todas", tone: ML_PRIMARY },
            { value: "active", label: "Activas", tone: "#10b981" },
            { value: "paused", label: "Pausadas", tone: "#f59e0b" },
            { value: "closed", label: "Cerradas", tone: "#94a3b8" },
          ].map((s) => (
            <FilterPill key={s.value} active={status === s.value} onClick={() => { setStatus(s.value); setPage(1); }} tone={s.tone}>
              {s.label}
            </FilterPill>
          ))}
        </div>

        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="text" placeholder="Buscar por título o MLA…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{
              paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              border: "1px solid rgba(15,23,42,.1)", borderRadius: 8,
              fontSize: 12, color: "#0f172a", background: "white", width: 260, outline: "none",
            }}
          />
        </div>
      </div>

      {/* LISTINGS TABLE PREMIUM */}
      <div
        style={{
          background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(15,23,42,.08)", background: "#fafafa" }}>
                <Th>Producto</Th>
                <Th align="right">Precio</Th>
                <Th align="center">Stock</Th>
                <Th align="center">Vendidos</Th>
                <Th align="center">Tipo</Th>
                <Th align="center">Estado</Th>
                <Th align="center">Atributos</Th>
                <Th align="center">Link</Th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l, idx) => (
                <ListingRow key={l.id} l={l} isLast={idx === listings.length - 1} />
              ))}
              {listings.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 60, fontSize: 13, color: "#94a3b8" }}>
                    {kpis.total === 0 ? "Sin publicaciones sincronizadas. Sincronizá MELI desde el dashboard." : "No se encontraron resultados con esos filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderTop: "1px solid rgba(15,23,42,.06)" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
              Página <b style={{ color: "#475569" }}>{pagination.page}</b> de {pagination.totalPages}
              <span style={{ marginLeft: 8 }}>· {pagination.totalCount.toLocaleString("es-AR")} publicaciones</span>
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
      </div>

      <SharedStyles />
    </PageShell>
  );
}

function ListingRow({ l, isLast }: { l: any; isLast: boolean }) {
  const stockTone = l.availableQty <= 3 ? "#ef4444" : l.availableQty <= 10 ? "#f59e0b" : "#475569";
  const stockBg = l.availableQty <= 3 ? "rgba(239,68,68,.08)" : l.availableQty <= 10 ? "rgba(245,158,11,.08)" : "transparent";
  const typeColor = LISTING_TYPE_COLORS[l.listingType] || "#94a3b8";

  return (
    <tr
      style={{
        borderBottom: isLast ? "none" : "1px solid rgba(15,23,42,.04)",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,158,11,.03)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Td>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, overflow: "hidden", background: "#f1f5f9", flexShrink: 0 }}>
            {l.thumbnailUrl ? <img src={l.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Package size={16} style={{ color: "#cbd5e1", margin: "11px auto" }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{l.title}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{l.mlItemId}</div>
          </div>
        </div>
      </Td>
      <Td align="right">
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{formatARS(l.price)}</div>
        {l.originalPrice && l.originalPrice > l.price && (
          <div style={{ fontSize: 10, color: "#94a3b8", textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>{formatARS(l.originalPrice)}</div>
        )}
      </Td>
      <Td align="center">
        <span style={{ fontSize: 12, fontWeight: 700, color: stockTone, fontVariantNumeric: "tabular-nums", padding: "3px 8px", borderRadius: 6, background: stockBg }}>
          {l.availableQty}
        </span>
      </Td>
      <Td align="center">
        <span style={{ fontSize: 12, color: "#475569", fontVariantNumeric: "tabular-nums" }}>{l.soldQty.toLocaleString("es-AR")}</span>
      </Td>
      <Td align="center">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: typeColor, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: `${typeColor}15` }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: typeColor }} />
          {LISTING_TYPE_LABELS[l.listingType] || l.listingType || "--"}
        </span>
      </Td>
      <Td align="center">
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "3px 8px", borderRadius: 5, background: `${STATUS_COLORS[l.status] || "#94a3b8"}15`, color: STATUS_COLORS[l.status] || "#94a3b8" }}>
          {STATUS_LABELS[l.status] || l.status}
        </span>
      </Td>
      <Td align="center">
        <div style={{ display: "inline-flex", gap: 4, alignItems: "center", justifyContent: "center" }}>
          {l.freeShipping && <AttrBadge label="Gratis" tone="#10b981" />}
          {l.fulfillment === "fulfillment" && <AttrBadge label="Full" tone="#3b82f6" />}
          {l.catalogListing && <AttrBadge label="Cat" tone="#8b5cf6" />}
          {!l.freeShipping && l.fulfillment !== "fulfillment" && !l.catalogListing && <span style={{ fontSize: 10, color: "#cbd5e1" }}>—</span>}
        </div>
      </Td>
      <Td align="center">
        {l.permalink && (
          <a
            href={l.permalink} target="_blank" rel="noopener noreferrer"
            title="Abrir en MercadoLibre"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 7,
              color: "#94a3b8", background: "transparent",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${ML_PRIMARY}12`; e.currentTarget.style.color = ML_PRIMARY; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
          >
            <ExternalLink size={13} />
          </a>
        )}
      </Td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════
// Subcomponents reusables
// ════════════════════════════════════════════════════════════════

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th style={{ textAlign: align as any, fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", padding: "12px 14px" }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return <td style={{ textAlign: align as any, padding: "11px 14px", verticalAlign: "middle" }}>{children}</td>;
}

function AttrBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: tone, padding: "2px 6px", borderRadius: 4, background: `${tone}15` }}>
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
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em", lineHeight: 1 }}>
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
        background: "white", borderRadius: 18, border: "1px solid rgba(15,23,42,.05)",
        padding: "26px 30px", marginBottom: 24,
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
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "#0f172a", margin: 0, marginBottom: 4 }}>{title}</h1>
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
        display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px",
        background: "white", color: disabled ? "#cbd5e1" : "#475569",
        border: "1px solid rgba(15,23,42,.1)", borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
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
    <div style={{ position: "relative", minHeight: "100%", padding: "32px 40px 64px", background: "#fafafa" }}>
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
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `}</style>
  );
}
