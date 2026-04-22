// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/emails — Historial de envíos de email
// ══════════════════════════════════════════════════════════════
// Muestra los últimos 100 intentos de envío desde la tabla email_log.
// Permite filtrar por "solo fallos" y ver detalle de cada error.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import {
  Mail, CheckCircle2, XCircle, RefreshCcw, AlertCircle, Plus, Loader2,
} from "lucide-react";

export default function EmailLogPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [filterTo, setFilterTo] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (onlyFailed) qs.set("only", "failed");
      if (filterTo.trim()) qs.set("to", filterTo.trim());
      const r = await fetch(`/api/admin/email-log?${qs.toString()}`);
      const j = await r.json();
      setRows(j.rows || []);
      setStats(j.stats7d || null);
      setHint(j.hint || null);
    } finally {
      setLoading(false);
    }
  }

  async function runMigration() {
    setMigrating(true);
    try {
      const r = await fetch("/api/admin/migrate-email-log", { method: "POST" });
      const j = await r.json();
      if (j.ok) await load();
      else alert("Error: " + (j.error || "?"));
    } finally {
      setMigrating(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyFailed]);

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", padding: "88px 24px 48px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5E1A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
            📬 Historial de emails
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            Cada email que salió (o intentó salir)
          </h1>
          <p style={{ margin: "10px 0 0", color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, maxWidth: 680 }}>
            Registro completo de envíos a Resend: destinatario, asunto, si salió OK, error exacto si falló, y Resend ID para trackear en su dashboard.
          </p>
        </div>

        {hint && (
          <div style={{ padding: "16px 20px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={18} color="#F59E0B" />
              <div style={{ fontSize: 13, color: "#FDE68A" }}>{hint}</div>
            </div>
            <button
              onClick={runMigration}
              disabled={migrating}
              style={{ padding: "8px 16px", background: "#F59E0B", color: "#000", border: 0, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: migrating ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {migrating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              {migrating ? "Migrando..." : "Ejecutar migración"}
            </button>
          </div>
        )}

        {/* Stats 7d */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            <StatCard label="Total 7 días" value={stats.total} color="#A1A1AA" />
            <StatCard label="OK" value={stats.ok} color="#22C55E" />
            <StatCard label="Fallos" value={stats.failed} color="#EF4444" />
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", background: "#141419", border: "1px solid #1F1F2E", borderRadius: 8, fontSize: 13, color: "#D4D4D8", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} style={{ accentColor: "#EF4444" }} />
            Solo fallos
          </label>
          <input
            type="text"
            placeholder="Filtrar por email…"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            style={{ padding: "7px 13px", background: "#141419", border: "1px solid #1F1F2E", borderRadius: 8, color: "#fff", fontSize: 13, minWidth: 240 }}
          />
          <button
            onClick={load}
            style={{ padding: "7px 14px", background: "#1F1F2E", color: "#fff", border: 0, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCcw size={13} /> Refrescar
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Loader2 size={24} className="spin" color="#9CA3AF" />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, background: "#141419", border: "1px solid #1F1F2E", borderRadius: 12, textAlign: "center", color: "#71717A", fontSize: 13 }}>
            <Mail size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>Sin registros{onlyFailed ? " de fallos" : ""}{filterTo ? ` para "${filterTo}"` : ""}.</div>
          </div>
        ) : (
          <div style={{ background: "#141419", border: "1px solid #1F1F2E", borderRadius: 12, overflow: "hidden" }}>
            {rows.map((row: any, i: number) => (
              <EmailRow
                key={row.id}
                row={row}
                last={i === rows.length - 1}
                expanded={expandedId === row.id}
                onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              />
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: "16px 18px", background: "#141419", border: "1px solid #1F1F2E", borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function EmailRow({ row, last, expanded, onToggle }: any) {
  const dt = new Date(row.createdAt);
  const timeStr = `${dt.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })} ${dt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <div style={{ borderBottom: last ? 0 : "1px solid #1F1F2E" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", padding: "14px 18px",
          background: "transparent", border: 0, cursor: "pointer",
          color: "inherit", display: "flex", alignItems: "center", gap: 14,
        }}
      >
        {row.ok ? <CheckCircle2 size={17} color="#22C55E" /> : <XCircle size={17} color="#EF4444" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: "#fff", fontWeight: 600, marginBottom: 3, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {row.subject}
          </div>
          <div style={{ fontSize: 12, color: "#9CA3AF", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>→ {row.toEmail}</span>
            {row.context && <span style={{ color: "#71717A" }}>· {row.context}</span>}
            {row.durationMs != null && <span style={{ color: "#71717A" }}>· {row.durationMs}ms</span>}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#71717A", whiteSpace: "nowrap" }}>{timeStr}</div>
      </button>
      {expanded && (
        <div style={{ padding: "0 18px 16px 49px" }}>
          {row.errorMessage && (
            <div style={{ padding: "10px 13px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, fontSize: 12, color: "#FCA5A5", fontFamily: "'SF Mono', Menlo, monospace", marginBottom: 10, wordBreak: "break-word" }}>
              {row.errorMessage}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#A1A1AA", fontFamily: "'SF Mono', Menlo, monospace", display: "grid", gridTemplateColumns: "130px 1fr", gap: "4px 12px" }}>
            <span style={{ color: "#71717A" }}>From:</span><span>{row.fromEmail}</span>
            <span style={{ color: "#71717A" }}>Resend ID:</span><span>{row.resendId || "—"}</span>
            <span style={{ color: "#71717A" }}>HTTP status:</span><span>{row.httpStatus || "—"}</span>
            <span style={{ color: "#71717A" }}>HTML size:</span><span>{row.htmlLength} chars</span>
            <span style={{ color: "#71717A" }}>Context:</span><span>{row.context || "—"}</span>
            <span style={{ color: "#71717A" }}>Created at:</span><span>{dt.toISOString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
