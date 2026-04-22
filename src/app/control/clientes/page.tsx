// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/clientes — Lista + drill-down por cliente
// ══════════════════════════════════════════════════════════════

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ChevronRight,
  Activity,
  Zap,
  ShoppingCart,
  MessageSquare,
  LogIn,
  KeyRound,
  Copy,
  X,
} from "lucide-react";

const COL = {
  ok: "#22C55E",
  warn: "#F59E0B",
  error: "#EF4444",
  pending: "#71717A",
};

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#71717A" }}>Cargando…</div>}>
      <ClientsInner />
    </Suspense>
  );
}

function ClientsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedId = searchParams.get("id");

  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/control/clients-health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setClients(j.clients);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 72px)" }}>
      {/* Lista lateral */}
      <div
        style={{
          width: 320,
          borderRight: "1px solid #1F1F23",
          padding: "24px 16px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#71717A",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 16,
            padding: "0 8px",
          }}
        >
          {clients.length} clientes
        </div>
        {loading ? (
          <div style={{ padding: 20, color: "#71717A", fontSize: 12 }}>Cargando…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {clients.map((c) => {
              const tone =
                c.overall === "error"
                  ? COL.error
                  : c.overall === "warn"
                  ? COL.warn
                  : c.overall === "pending"
                  ? COL.pending
                  : COL.ok;
              const active = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/control/clientes?id=${c.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: active ? "#1F1F23" : "transparent",
                    border: "none",
                    borderRadius: 8,
                    color: active ? "#fff" : "#A1A1AA",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    transition: "all 120ms",
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: tone,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.name}
                  </div>
                  {active && <ChevronRight size={14} color="#71717A" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detalle */}
      <div style={{ flex: 1, padding: "32px 32px", overflowY: "auto" }}>
        {selectedId ? (
          <ClientDetail id={selectedId} />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#52525B",
              fontSize: 14,
            }}
          >
            Seleccioná un cliente
          </div>
        )}
      </div>
    </div>
  );
}

function ClientDetail({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/control/client/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        return;
      }
      setData(json.client);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading && !data) {
    return <div style={{ color: "#71717A", fontSize: 13 }}>Cargando…</div>;
  }
  if (error) {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8,
          color: "#F87171",
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {data.name}
          </h1>
          <div style={{ color: "#71717A", fontSize: 12, marginTop: 6 }}>
            <code style={{ color: "#A1A1AA" }}>{data.slug}</code> · plan{" "}
            <span style={{ color: "#A1A1AA" }}>{data.plan}</span> · creado{" "}
            {new Date(data.createdAt).toLocaleDateString("es-AR")}
          </div>
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
          <RefreshCw size={12} />
          Refrescar
        </button>
      </div>

      {/* Actividad */}
      <Section title="Actividad">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          <ActivityCell
            icon={<ShoppingCart size={14} />}
            label="Órdenes"
            last24h={data.activity.last24h.orders}
            last7d={data.activity.last7d.orders}
            total={data.activity.total.orders}
          />
          <ActivityCell
            icon={<Zap size={14} />}
            label="Eventos pixel"
            last24h={data.activity.last24h.pixel}
            last7d={data.activity.last7d.pixel}
            total={data.activity.total.pixel}
          />
          <ActivityCell
            icon={<MessageSquare size={14} />}
            label="Chats Aurum"
            last24h={data.activity.last24h.botchats}
            last7d={data.activity.last7d.botchats}
            total={data.activity.total.botchats}
          />
        </div>
      </Section>

      {/* Conexiones */}
      <Section title={`Conexiones · ${data.connections.length}`}>
        {data.connections.length === 0 ? (
          <EmptyBox label="Sin conexiones configuradas" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.connections.map((c: any) => (
              <ConnectionCard key={c.id} conn={c} />
            ))}
          </div>
        )}
      </Section>

      {/* Usuarios */}
      <Section title={`Usuarios · ${data.users.length}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.users.map((u: any) => (
            <UserRow key={u.id} user={u} />
          ))}
        </div>
      </Section>

      {/* Login events */}
      <Section title={`Últimos logins · ${data.recentLogins.length}`}>
        {data.recentLogins.length === 0 ? (
          <EmptyBox label="Sin logins registrados" />
        ) : (
          <div
            style={{
              background: "#0F0F11",
              border: "1px solid #1F1F23",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {data.recentLogins.slice(0, 10).map((l: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  fontSize: 12,
                  borderBottom: i < 9 ? "1px solid #1F1F23" : "none",
                }}
              >
                <LogIn
                  size={12}
                  color={l.success ? COL.ok : COL.error}
                />
                <div style={{ flex: 1, color: "#E4E4E7" }}>
                  {l.userName || l.email || "—"}
                </div>
                <div style={{ color: "#71717A" }}>
                  {new Date(l.createdAt).toLocaleString("es-AR")}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
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

function ActivityCell({
  icon,
  label,
  last24h,
  last7d,
  total,
}: {
  icon: React.ReactNode;
  label: string;
  last24h: number;
  last7d: number;
  total: number;
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        background: "#0F0F11",
        border: "1px solid #1F1F23",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "#71717A",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 10,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#fff",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          marginBottom: 8,
        }}
      >
        {last24h}
      </div>
      <div style={{ fontSize: 10, color: "#52525B", marginBottom: 2 }}>
        últimas 24h
      </div>
      <div style={{ fontSize: 11, color: "#71717A", marginTop: 8 }}>
        {last7d} semana · {total} total
      </div>
    </div>
  );
}

function ConnectionCard({ conn }: { conn: any }) {
  const mins = conn.lastSyncAt
    ? Math.floor((Date.now() - new Date(conn.lastSyncAt).getTime()) / 60000)
    : null;

  const health = classifyHealth(conn, mins);
  const tone =
    health === "error"
      ? COL.error
      : health === "warn"
      ? COL.warn
      : health === "pending"
      ? COL.pending
      : COL.ok;

  const Icon = health === "error" ? XCircle : health === "warn" ? AlertTriangle : CheckCircle2;

  return (
    <div
      style={{
        padding: "14px 16px",
        background: "#0F0F11",
        border: `1px solid ${health === "ok" ? "#1F1F23" : `${tone}33`}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon size={16} color={tone} />
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, flex: 1 }}>
          {conn.platform}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            background: `${tone}1A`,
            color: tone,
            borderRadius: 99,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {conn.status}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#71717A", marginTop: 8, paddingLeft: 26 }}>
        {mins !== null ? (
          <>
            Último sync hace <span style={{ color: "#A1A1AA" }}>{formatMins(mins)}</span>
            {conn.lastSuccessfulSyncAt && (
              <>
                {" · "}
                último OK{" "}
                <span style={{ color: "#A1A1AA" }}>
                  {formatMins(
                    Math.floor(
                      (Date.now() - new Date(conn.lastSuccessfulSyncAt).getTime()) / 60000
                    )
                  )}
                </span>
              </>
            )}
          </>
        ) : (
          <span style={{ color: "#52525B" }}>Nunca syncó</span>
        )}
      </div>
      {conn.lastSyncError && (
        <div
          style={{
            marginTop: 10,
            marginLeft: 26,
            padding: "8px 10px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
            fontSize: 11,
            color: "#FCA5A5",
            fontFamily: "'SF Mono', Menlo, monospace",
            wordBreak: "break-word",
          }}
        >
          {conn.lastSyncError.slice(0, 300)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UserRow — fila de usuario con boton "Regenerar password"
// ═══════════════════════════════════════════════════════════════
function UserRow({ user }: { user: any }) {
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleReset() {
    if (!confirm(`¿Regenerar password de ${user.email}? La password actual va a dejar de funcionar.`)) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Error al regenerar");
      } else {
        setNewPassword(json.newPassword);
      }
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setResetting(false);
    }
  }

  async function handleCopy() {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          background: "#0F0F11",
          border: "1px solid #1F1F23",
          borderRadius: 8,
        }}
      >
        <div style={{ flex: 1, fontSize: 13 }}>
          <div style={{ color: "#fff", fontWeight: 500 }}>{user.name || user.email}</div>
          <div style={{ color: "#71717A", fontSize: 11, marginTop: 2 }}>{user.email}</div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            background: "#27272A",
            color: "#A1A1AA",
            borderRadius: 99,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {user.role}
        </span>
        <button
          onClick={handleReset}
          disabled={resetting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            background: "transparent",
            border: "1px solid #3F3F46",
            borderRadius: 6,
            color: resetting ? "#52525B" : "#A1A1AA",
            cursor: resetting ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 500,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (resetting) return;
            e.currentTarget.style.borderColor = "#FF5E1A";
            e.currentTarget.style.color = "#FF5E1A";
          }}
          onMouseLeave={(e) => {
            if (resetting) return;
            e.currentTarget.style.borderColor = "#3F3F46";
            e.currentTarget.style.color = "#A1A1AA";
          }}
          title="Genera una password nueva. La anterior dejará de funcionar."
        >
          <KeyRound size={12} />
          {resetting ? "Generando…" : "Regenerar password"}
        </button>
      </div>

      {/* Modal con la nueva password (solo se ve UNA vez) */}
      {newPassword && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setNewPassword(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#18181B",
              border: "1px solid #27272A",
              borderRadius: 14,
              padding: 28,
              maxWidth: 460,
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <KeyRound size={18} color="#FF5E1A" />
                <h3 style={{ margin: 0, fontSize: 16, color: "#fff", fontWeight: 600 }}>Password regenerada</h3>
              </div>
              <button
                onClick={() => setNewPassword(null)}
                style={{ background: "transparent", border: "none", color: "#71717A", cursor: "pointer", padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#A1A1AA", marginBottom: 16 }}>
              Para <strong style={{ color: "#fff" }}>{user.email}</strong>. Copiala ahora — no la vas a poder ver de nuevo.
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 14px",
                background: "#0A0A0F",
                border: "1px solid #FF5E1A",
                borderRadius: 8,
                marginBottom: 14,
              }}
            >
              <code style={{ flex: 1, color: "#fff", fontSize: 16, fontFamily: "ui-monospace, SF Mono, Menlo, monospace", letterSpacing: "0.04em" }}>
                {newPassword}
              </code>
              <button
                onClick={handleCopy}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: copied ? "rgba(34,197,94,0.15)" : "#FF5E1A",
                  border: copied ? "1px solid rgba(34,197,94,0.4)" : "none",
                  borderRadius: 6,
                  color: copied ? "#22C55E" : "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                {copied ? "Copiada" : "Copiar"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#71717A", lineHeight: 1.5 }}>
              💡 Pasasela al cliente por un canal seguro (no por email). Si la perdés, vas a tener que regenerar otra.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 6,
            color: "#FCA5A5",
            fontSize: 11,
            marginTop: 4,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

function EmptyBox({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "24px 20px",
        textAlign: "center",
        background: "#0F0F11",
        border: "1px dashed #27272A",
        borderRadius: 8,
        color: "#52525B",
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}

function classifyHealth(conn: any, minsSinceSync: number | null): "ok" | "warn" | "error" | "pending" {
  if (conn.status === "PENDING") return "pending";
  if (conn.status === "ERROR") return "error";
  if (conn.lastSyncError) return "warn";
  if (minsSinceSync === null) return "warn";
  const threshold = 60 * 24; // 1d default
  if (minsSinceSync > threshold * 2) return "error";
  if (minsSinceSync > threshold) return "warn";
  return "ok";
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
