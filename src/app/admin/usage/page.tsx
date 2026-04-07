"use client";

// ══════════════════════════════════════════════════════════════
// Admin: Aurum Usage Dashboard
// ══════════════════════════════════════════════════════════════
// Internal-only telemetry dashboard for NitroSales owner.
// Access: /admin/usage?key=ADMIN_SECRET
// No auth beyond query-param key. Not in (app) group → no sidebar.
// ══════════════════════════════════════════════════════════════

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type ModeStats = {
  queries: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  avgToolRounds: number;
};

type UsageResponse = {
  windowDays: number;
  generatedAt: string;
  totals: {
    queries: number;
    successQueries: number;
    errorRate: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  byMode: Record<"FLASH" | "CORE" | "DEEP", ModeStats>;
  dailyTrend: Array<{ date: string; flash: number; core: number; deep: number; total: number }>;
  topTools: Array<{ name: string; count: number }>;
  topOrgs: Array<{ organizationId: string; name: string; queries: number }>;
  recentErrors: Array<{ createdAt: string; mode: string; model: string; latencyMs: number; errorMessage: string | null }>;
};

const MODE_COLORS: Record<string, string> = {
  FLASH: "#60a5fa",
  CORE: "#fbbf24",
  DEEP: "#a78bfa",
};

function fmt(n: number): string {
  return n.toLocaleString("es-AR");
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export default function AdminUsagePage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, color: "#71717a", textAlign: "center" }}>Cargando…</div>}>
      <AdminUsageInner />
    </Suspense>
  );
}

function AdminUsageInner() {
  const params = useSearchParams();
  const [key, setKey] = useState<string>("");
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const k = params?.get("key") || "";
    if (k) setKey(k);
  }, [params]);

  async function load(k: string, d: number) {
    if (!k) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/usage?key=${encodeURIComponent(k)}&days=${d}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error cargando datos");
        setData(null);
      } else {
        setData(json);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (key) load(key, days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, days]);

  return (
    <div
      style={{
        color: "#e4e4e7",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fbbf24", margin: 0, letterSpacing: "-0.02em" }}>
            Aurum · Usage Telemetry
          </h1>
          <p style={{ color: "#71717a", marginTop: 8, fontSize: 14 }}>
            Panel interno · NitroSales Reasoning Engine
          </p>
        </header>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 24,
            padding: 16,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
          }}
        >
          <input
            type="password"
            placeholder="Admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#e4e4e7",
              fontSize: 14,
              outline: "none",
            }}
          />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{
              padding: "10px 14px",
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#e4e4e7",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <option value={1}>Último día</option>
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>
          <button
            onClick={() => load(key, days)}
            disabled={!key || loading}
            style={{
              padding: "10px 20px",
              background: "#fbbf24",
              color: "#0a0a0f",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: key && !loading ? "pointer" : "not-allowed",
              opacity: key && !loading ? 1 : 0.5,
            }}
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: 16,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              color: "#fca5a5",
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {!key && !data && (
          <div style={{ textAlign: "center", padding: 48, color: "#71717a" }}>
            Ingresá la admin key para ver la telemetría.
          </div>
        )}

        {data && (
          <>
            {/* Totals */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 24,
              }}
            >
              <StatCard label="Queries totales" value={fmt(data.totals.queries)} />
              <StatCard
                label="Tasa de error"
                value={`${data.totals.errorRate}%`}
                tone={data.totals.errorRate > 5 ? "danger" : "ok"}
              />
              <StatCard label="Input tokens" value={fmtTokens(data.totals.totalInputTokens)} />
              <StatCard label="Output tokens" value={fmtTokens(data.totals.totalOutputTokens)} />
            </div>

            {/* By Mode */}
            <h2 style={sectionTitle}>Por modo</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 12,
                marginBottom: 32,
              }}
            >
              {(["FLASH", "CORE", "DEEP"] as const).map((m) => {
                const s = data.byMode[m];
                return (
                  <div
                    key={m}
                    style={{
                      padding: 20,
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${MODE_COLORS[m]}40`,
                      borderRadius: 12,
                      borderTop: `3px solid ${MODE_COLORS[m]}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                      <strong style={{ color: MODE_COLORS[m], fontSize: 16 }}>{m}</strong>
                      <span style={{ color: "#a1a1aa", fontSize: 13 }}>{fmt(s.queries)} queries</span>
                    </div>
                    <Row label="Input tokens" value={fmtTokens(s.inputTokens)} />
                    <Row label="Output tokens" value={fmtTokens(s.outputTokens)} />
                    <Row label="Latencia prom." value={`${fmt(s.avgLatencyMs)}ms`} />
                    <Row label="p50 latencia" value={`${fmt(s.p50LatencyMs)}ms`} />
                    <Row label="p95 latencia" value={`${fmt(s.p95LatencyMs)}ms`} />
                    <Row label="Tool rounds prom." value={s.avgToolRounds.toFixed(2)} />
                  </div>
                );
              })}
            </div>

            {/* Daily Trend */}
            {data.dailyTrend.length > 0 && (
              <>
                <h2 style={sectionTitle}>Tendencia diaria</h2>
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 32,
                    overflowX: "auto",
                  }}
                >
                  <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "#71717a", textAlign: "left" }}>
                        <th style={{ padding: "8px 12px" }}>Fecha</th>
                        <th style={{ padding: "8px 12px", color: MODE_COLORS.FLASH }}>Flash</th>
                        <th style={{ padding: "8px 12px", color: MODE_COLORS.CORE }}>Core</th>
                        <th style={{ padding: "8px 12px", color: MODE_COLORS.DEEP }}>Deep</th>
                        <th style={{ padding: "8px 12px" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dailyTrend.map((d) => (
                        <tr key={d.date} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>{d.date}</td>
                          <td style={{ padding: "8px 12px" }}>{d.flash}</td>
                          <td style={{ padding: "8px 12px" }}>{d.core}</td>
                          <td style={{ padding: "8px 12px" }}>{d.deep}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{d.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Top Tools & Orgs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
              <div>
                <h2 style={sectionTitle}>Top tools</h2>
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  {data.topTools.length === 0 ? (
                    <div style={{ color: "#71717a", fontSize: 13 }}>Sin datos</div>
                  ) : (
                    data.topTools.map((t) => (
                      <div
                        key={t.name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "6px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: "#e4e4e7", fontFamily: "monospace" }}>{t.name}</span>
                        <span style={{ color: "#fbbf24", fontWeight: 600 }}>{t.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <h2 style={sectionTitle}>Top orgs</h2>
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  {data.topOrgs.length === 0 ? (
                    <div style={{ color: "#71717a", fontSize: 13 }}>Sin datos</div>
                  ) : (
                    data.topOrgs.map((o) => (
                      <div
                        key={o.organizationId}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "6px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: "#e4e4e7" }}>{o.name}</span>
                        <span style={{ color: "#a78bfa", fontWeight: 600 }}>{o.queries}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Recent Errors */}
            {data.recentErrors.length > 0 && (
              <>
                <h2 style={sectionTitle}>Errores recientes</h2>
                <div
                  style={{
                    background: "rgba(239,68,68,0.05)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 32,
                  }}
                >
                  {data.recentErrors.map((err, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 0",
                        borderBottom: i < data.recentErrors.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 12, color: "#71717a", marginBottom: 4 }}>
                        <span>{new Date(err.createdAt).toLocaleString("es-AR")}</span>
                        <span style={{ color: MODE_COLORS[err.mode] || "#a1a1aa" }}>{err.mode}</span>
                        <span>{err.model}</span>
                        <span>{err.latencyMs}ms</span>
                      </div>
                      <div style={{ color: "#fca5a5", fontFamily: "monospace", fontSize: 12 }}>
                        {err.errorMessage || "(sin mensaje)"}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ textAlign: "center", color: "#52525b", fontSize: 11, marginTop: 32 }}>
              Ventana: {data.windowDays} días · Generado: {new Date(data.generatedAt).toLocaleString("es-AR")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#a1a1aa",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 12,
  marginTop: 0,
};

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "ok" | "danger" }) {
  const color = tone === "danger" ? "#fca5a5" : "#fbbf24";
  return (
    <div
      style={{
        padding: 20,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
      }}
    >
      <div style={{ color: "#71717a", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ color, fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: 13,
        color: "#d4d4d8",
      }}
    >
      <span style={{ color: "#71717a" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
