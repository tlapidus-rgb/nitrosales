"use client";

// ══════════════════════════════════════════════════════════════
// Admin · Overview
// ══════════════════════════════════════════════════════════════
// Resumen de cabina: cantidad de clientes, salud agregada,
// alertas críticas y links rápidos a las pestañas.
// Datos reales de /api/admin/clientes + /api/admin/alertas
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";

interface ClientesResponse {
  ok: boolean;
  summary: {
    totalOrgs: number;
    green: number;
    yellow: number;
    red: number;
    gray: number;
    totalEvents7d: number;
    totalUsers: number;
  };
}

interface AlertasResponse {
  ok: boolean;
  summary: { total: number; critical: number; warning: number; info: number };
}

export default function AdminOverview() {
  const [clientes, setClientes] = useState<ClientesResponse | null>(null);
  const [alertas, setAlertas] = useState<AlertasResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/clientes", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/alertas", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([c, a]) => {
        setClientes(c);
        setAlertas(a);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <div style={{ animation: "adminFadeIn 0.5s ease-out" }}>
      <h1 className="text-3xl font-semibold tracking-tight mb-1">Overview</h1>
      <p className="text-white/50 text-sm mb-8">
        Estado actual de tu cabina. Datos en vivo, refrescados cada vez que abrís la página.
      </p>

      {err && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4 text-red-300 text-sm mb-6">
          Error cargando datos: {err}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Clientes totales"
          value={clientes?.summary.totalOrgs ?? "—"}
          accent="cyan"
        />
        <KpiCard
          label="Activos (24h)"
          value={clientes?.summary.green ?? "—"}
          sublabel={`de ${clientes?.summary.totalOrgs ?? 0}`}
          accent="emerald"
        />
        <KpiCard
          label="Alertas críticas"
          value={alertas?.summary.critical ?? "—"}
          sublabel={`${alertas?.summary.total ?? 0} totales`}
          accent={(alertas?.summary.critical ?? 0) > 0 ? "violet" : "cyan"}
        />
        <KpiCard
          label="Eventos 7d"
          value={clientes?.summary.totalEvents7d.toLocaleString("es-AR") ?? "—"}
          accent="cyan"
        />
      </div>

      {/* Health breakdown */}
      {clientes && (
        <div className="border border-white/5 rounded-2xl p-6 mb-6 bg-white/[0.01]">
          <div className="text-[10px] font-mono tracking-[0.2em] text-white/40 uppercase mb-3">
            Distribución de salud
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
            {clientes.summary.totalOrgs > 0 && (
              <>
                <div
                  className="bg-emerald-500"
                  style={{ width: `${(clientes.summary.green / clientes.summary.totalOrgs) * 100}%` }}
                  title={`${clientes.summary.green} activos`}
                />
                <div
                  className="bg-yellow-500"
                  style={{ width: `${(clientes.summary.yellow / clientes.summary.totalOrgs) * 100}%` }}
                  title={`${clientes.summary.yellow} sin actividad reciente`}
                />
                <div
                  className="bg-red-500"
                  style={{ width: `${(clientes.summary.red / clientes.summary.totalOrgs) * 100}%` }}
                  title={`${clientes.summary.red} caídos`}
                />
                <div
                  className="bg-white/20"
                  style={{ width: `${(clientes.summary.gray / clientes.summary.totalOrgs) * 100}%` }}
                  title={`${clientes.summary.gray} sin eventos nunca`}
                />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-white/60">
            <Legend color="bg-emerald-500" label={`${clientes.summary.green} activos`} />
            <Legend color="bg-yellow-500" label={`${clientes.summary.yellow} silenciosos`} />
            <Legend color="bg-red-500" label={`${clientes.summary.red} caídos`} />
            <Legend color="bg-white/20" label={`${clientes.summary.gray} sin instalar`} />
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickLink
          href="/admin/clientes"
          title="Ver todos los clientes"
          description="Listado con salud, último evento y stats"
        />
        <QuickLink
          href="/admin/alertas"
          title="Revisar alertas"
          description="Clientes que requieren intervención"
          badge={alertas?.summary.critical}
        />
        <QuickLink
          href="/admin/usage"
          title="Claude Usage"
          description="Consumo de tokens, modos y latencia"
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  accent: "cyan" | "emerald" | "violet";
}) {
  const colors = {
    cyan: "border-cyan-500/20 from-cyan-500/[0.04]",
    emerald: "border-emerald-500/20 from-emerald-500/[0.04]",
    violet: "border-violet-500/20 from-violet-500/[0.04]",
  }[accent];

  return (
    <div className={`border ${colors} bg-gradient-to-br to-transparent rounded-2xl p-5`}>
      <div className="text-[10px] font-mono tracking-[0.2em] text-white/50 uppercase mb-2">
        {label}
      </div>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      {sublabel && <div className="text-[11px] text-white/40 mt-1">{sublabel}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="block border border-white/5 rounded-xl p-5 hover:border-cyan-500/30 hover:bg-white/[0.02] transition group"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-medium group-hover:text-cyan-300 transition">{title}</div>
        {badge !== undefined && badge > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
            {badge}
          </span>
        )}
      </div>
      <div className="text-xs text-white/50">{description}</div>
    </Link>
  );
}
