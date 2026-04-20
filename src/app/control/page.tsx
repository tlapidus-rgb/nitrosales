// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control — Inicio (overview de salud)
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
  Zap,
  Users as UsersIcon,
  RefreshCw,
} from "lucide-react";

const COL = {
  ok: "#22C55E",
  warn: "#F59E0B",
  error: "#EF4444",
  pending: "#71717A",
};

interface ClientHealth {
  id: string;
  name: string;
  slug: string;
  overall: "ok" | "warn" | "error" | "pending";
  connections: Array<{
    platform: string;
    health: "ok" | "warn" | "error" | "pending";
    minsSinceSync: number | null;
    lastSyncError: string | null;
  }>;
  activity: {
    lastLogin: string | null;
    minsSinceLogin: number | null;
    orders24h: number;
    pixel24h: number;
    usersCount: number;
  };
}

interface Summary {
  totalClients: number;
  clientsOk: number;
  clientsWarn: number;
  clientsError: number;
  clientsPending: number;
  totalConnections: number;
  connectionsOk: number;
  connectionsWarn: number;
  connectionsError: number;
}

export default function ControlHomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clients, setClients] = useState<ClientHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/control/clients-health", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Error ${res.status}`);
        return;
      }
      setSummary(json.summary);
      setClients(json.clients);
      setLastRefresh(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // refresh cada 60s
    return () => clearInterval(interval);
  }, []);

  const problemClients = clients.filter(
    (c) => c.overall === "error" || c.overall === "warn"
  );

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#fff",
              margin: 0,
            }}
          >
            Inicio
          </h1>
          <p style={{ color: "#71717A", fontSize: 13, margin: "6px 0 0" }}>
            Salud operativa de todos los clientes · actualiza cada 60s
          </p>
        </div>
        <button
          onClick={load}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            background: "#18181B",
            border: "1px solid #27272A",
            borderRadius: 8,
            color: "#A1A1AA",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} className={loading ? "spin" : ""} />
          {loading ? "Cargando…" : `Hace ${Math.floor((Date.now() - lastRefresh.getTime()) / 1000)}s`}
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* KPIs */}
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 28,
          }}
        >
          <KpiCard
            label="Clientes totales"
            value={summary.totalClients}
            icon={<UsersIcon size={14} />}
            tone="#71717A"
          />
          <KpiCard
            label="Todo OK"
            value={summary.clientsOk}
            icon={<CheckCircle2 size={14} />}
            tone={COL.ok}
            accent
          />
          <KpiCard
            label="Con alertas"
            value={summary.clientsWarn}
            icon={<AlertTriangle size={14} />}
            tone={COL.warn}
            accent
          />
          <KpiCard
            label="Con errores"
            value={summary.clientsError}
            icon={<XCircle size={14} />}
            tone={COL.error}
            accent
          />
        </div>
      )}

      {/* Alertas activas */}
      <Section title="Alertas activas">
        {problemClients.length === 0 ? (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              color: "#52525B",
              fontSize: 13,
              background: "#0F0F11",
              border: "1px dashed #27272A",
              borderRadius: 10,
            }}
          >
            <CheckCircle2 size={24} color={COL.ok} style={{ opacity: 0.6, marginBottom: 8 }} />
            <div style={{ color: "#A1A1AA", fontWeight: 500 }}>
              Ningún cliente con problemas ahora mismo
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {problemClients.map((c) => (
              <AlertRow key={c.id} client={c} />
            ))}
          </div>
        )}
      </Section>

      {/* Todos los clientes */}
      <Section title="Todos los clientes">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {clients.map((c) => (
            <ClientRow key={c.id} client={c} />
          ))}
          {clients.length === 0 && !loading && (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "#52525B",
                fontSize: 13,
              }}
            >
              Ningún cliente todavía
            </div>
          )}
        </div>
      </Section>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

// ─────── Components ───────
function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 8,
        color: "#F87171",
        fontSize: 13,
        marginBottom: 20,
      }}
    >
      {message}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        background: "#0F0F11",
        border: `1px solid ${accent ? `${tone}33` : "#1F1F23"}`,
        borderRadius: 10,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {accent && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 3,
            background: tone,
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: tone,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#71717A",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function AlertRow({ client }: { client: ClientHealth }) {
  const tone = client.overall === "error" ? COL.error : COL.warn;
  const Icon = client.overall === "error" ? XCircle : AlertTriangle;
  const brokenConns = client.connections.filter(
    (c) => c.health === "error" || c.health === "warn"
  );

  return (
    <Link
      href={`/control/clientes?id=${client.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        background: "#0F0F11",
        border: `1px solid ${tone}33`,
        borderRadius: 10,
        textDecoration: "none",
        transition: "all 120ms",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: `${tone}1A`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} color={tone} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          {client.name}
        </div>
        <div style={{ color: "#A1A1AA", fontSize: 12 }}>
          {brokenConns
            .map(
              (c) =>
                `${c.platform} ${c.health === "error" ? "caído" : "lento"}${
                  c.minsSinceSync ? ` (hace ${formatMins(c.minsSinceSync)})` : ""
                }`
            )
            .join(" · ")}
        </div>
      </div>
      <div style={{ color: "#71717A", fontSize: 12 }}>Ver →</div>
    </Link>
  );
}

function ClientRow({ client }: { client: ClientHealth }) {
  const tone =
    client.overall === "error"
      ? COL.error
      : client.overall === "warn"
      ? COL.warn
      : client.overall === "pending"
      ? COL.pending
      : COL.ok;

  return (
    <Link
      href={`/control/clientes?id=${client.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: "#0F0F11",
        border: "1px solid #1F1F23",
        borderRadius: 10,
        textDecoration: "none",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tone,
          boxShadow: `0 0 8px ${tone}80`,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, color: "#fff", fontWeight: 500, fontSize: 14 }}>
        {client.name}
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#71717A" }}>
        <div>
          <span style={{ color: "#A1A1AA" }}>{client.connections.length}</span> conex
        </div>
        <div>
          <span style={{ color: "#A1A1AA" }}>{client.activity.orders24h}</span> ords 24h
        </div>
        <div>
          <span style={{ color: "#A1A1AA" }}>{client.activity.pixel24h}</span> pixel 24h
        </div>
        <div>
          {client.activity.minsSinceLogin !== null
            ? `login hace ${formatMins(client.activity.minsSinceLogin)}`
            : "sin login"}
        </div>
      </div>
    </Link>
  );
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
