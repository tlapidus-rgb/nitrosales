"use client";

// ══════════════════════════════════════════════════════════════
// Admin · Clientes
// ══════════════════════════════════════════════════════════════
// Tabla de todas las orgs con stats lightweight + badge de salud.
// Click en una fila → detalle por cliente.
// Datos reales de /api/admin/clientes
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Health = "green" | "yellow" | "red" | "gray";

interface Cliente {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  users: number;
  lastEventAt: string | null;
  events7d: number;
  identifiedVisitors: number;
  totalVisitors: number;
  health: Health;
  healthLabel: string;
}

interface ClientesResponse {
  ok: boolean;
  summary: {
    totalOrgs: number;
    green: number;
    yellow: number;
    red: number;
    gray: number;
  };
  clientes: Cliente[];
}

const HEALTH_COLOR: Record<Health, string> = {
  green: "bg-emerald-400",
  yellow: "bg-yellow-400",
  red: "bg-red-400",
  gray: "bg-white/30",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "hace instantes";
  if (ms < 3_600_000) return `hace ${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `hace ${Math.floor(ms / 3_600_000)}h`;
  const days = Math.floor(ms / 86_400_000);
  return `hace ${days}d`;
}

export default function ClientesPage() {
  const [data, setData] = useState<ClientesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Health>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/clientes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "Error");
        setData(j);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.clientes;
    if (filter !== "all") list = list.filter((c) => c.health === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
    }
    return list;
  }, [data, filter, search]);

  return (
    <div style={{ animation: "adminFadeIn 0.5s ease-out" }}>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mb-1">Clientes</h1>
          <p className="text-white/50 text-sm">
            {data?.summary.totalOrgs ?? "—"} organizaciones · click en una para ver el detalle
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre o slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-4 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-cyan-500/50 transition"
        />
        <div className="flex items-center gap-1">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")} label="Todos" count={data?.summary.totalOrgs} />
          <FilterPill active={filter === "green"} onClick={() => setFilter("green")} label="Activos" count={data?.summary.green} color="emerald" />
          <FilterPill active={filter === "yellow"} onClick={() => setFilter("yellow")} label="Silenciosos" count={data?.summary.yellow} color="yellow" />
          <FilterPill active={filter === "red"} onClick={() => setFilter("red")} label="Caídos" count={data?.summary.red} color="red" />
          <FilterPill active={filter === "gray"} onClick={() => setFilter("gray")} label="Sin instalar" count={data?.summary.gray} color="gray" />
        </div>
      </div>

      {err && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4 text-red-300 text-sm">
          {err}
        </div>
      )}

      {loading && !data && (
        <div className="text-white/40 text-sm py-12 text-center" style={{ animation: "adminPulse 1.6s infinite" }}>
          Cargando clientes...
        </div>
      )}

      {/* Table */}
      {data && (
        <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] border-b border-white/5">
              <tr className="text-left text-[10px] font-mono tracking-[0.15em] uppercase text-white/40">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Users</th>
                <th className="px-5 py-3">Eventos 7d</th>
                <th className="px-5 py-3">Visitors id.</th>
                <th className="px-5 py-3">Último evento</th>
                <th className="px-5 py-3">Salud</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-white/40 text-sm">
                    No hay clientes que coincidan con el filtro.
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const idRatio = c.totalVisitors > 0 ? Math.round((c.identifiedVisitors / c.totalVisitors) * 100) : 0;
                return (
                  <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition">
                    <td className="px-5 py-4">
                      <Link href={`/admin/clientes/${c.id}`} className="block">
                        <div className="font-medium text-white hover:text-cyan-300 transition">{c.name}</div>
                        <div className="text-[10px] font-mono text-white/40">{c.slug}</div>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/70">
                        {c.plan}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-white/70 tabular-nums">{c.users}</td>
                    <td className="px-5 py-4 text-white/70 tabular-nums">{c.events7d.toLocaleString("es-AR")}</td>
                    <td className="px-5 py-4 text-white/70 tabular-nums">
                      {c.identifiedVisitors} <span className="text-white/30 text-xs">/ {c.totalVisitors} ({idRatio}%)</span>
                    </td>
                    <td className="px-5 py-4 text-white/60 text-xs">{timeAgo(c.lastEventAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${HEALTH_COLOR[c.health]}`} />
                        <span className="text-xs text-white/70">{c.healthLabel}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  color?: "emerald" | "yellow" | "red" | "gray";
}) {
  const dotColor =
    color === "emerald" ? "bg-emerald-400"
    : color === "yellow" ? "bg-yellow-400"
    : color === "red" ? "bg-red-400"
    : color === "gray" ? "bg-white/30"
    : null;

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border ${
        active
          ? "bg-cyan-500/10 text-cyan-100 border-cyan-500/30"
          : "text-white/60 hover:text-white border-transparent hover:bg-white/5"
      }`}
    >
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      <span>{label}</span>
      {count !== undefined && <span className="text-white/40 tabular-nums">{count}</span>}
    </button>
  );
}
