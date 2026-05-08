// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/cuentas — Vista unificada de TODAS las cuentas
// ══════════════════════════════════════════════════════════════
// Une en una sola tabla: leads (pipeline) + onboarding_requests +
// organizations (incluyendo fundadoras como EMDJ sin onboarding).
//
// Reemplaza el flow viejo de tener que ir a 3 secciones distintas
// (Clientes / Onboardings / Pipeline) para gestionar cuentas.
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AccountRow = {
  kind: "lead" | "onboarding" | "org";
  id: string;
  orgId: string | null;
  onboardingId: string | null;
  leadId: string | null;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  storeUrl: string | null;
  status: string;
  platforms: { vtex: boolean; ml: boolean; meta: boolean; google: boolean };
  submittedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; group: string }> = {
  LEAD: { label: "Lead", bg: "rgba(113,113,122,0.15)", color: "#A1A1AA", group: "Pipeline" },
  CONTACTADO: { label: "Contactado", bg: "rgba(99,102,241,0.15)", color: "#818CF8", group: "Pipeline" },
  POSTULADO: { label: "Postulado", bg: "rgba(251,191,36,0.15)", color: "#FCD34D", group: "Solicitud" },
  CUENTA_OK: { label: "Cuenta aprobada", bg: "rgba(251,191,36,0.15)", color: "#FCD34D", group: "Solicitud" },
  WIZARD_OK: { label: "Wizard completo", bg: "rgba(251,191,36,0.15)", color: "#FCD34D", group: "Solicitud" },
  BACKFILLING: { label: "Backfilling", bg: "rgba(56,189,248,0.15)", color: "#38BDF8", group: "Activa" },
  READY_FOR_REVIEW: { label: "Lista para activar", bg: "rgba(56,189,248,0.15)", color: "#38BDF8", group: "Activa" },
  ACTIVA: { label: "Activa", bg: "rgba(34,197,94,0.15)", color: "#22C55E", group: "Activa" },
  FUNDADORA: { label: "Fundadora", bg: "rgba(168,85,247,0.15)", color: "#A78BFA", group: "Activa" },
  RECHAZADA: { label: "Rechazada", bg: "rgba(248,113,113,0.15)", color: "#F87171", group: "Rechazada" },
};

const TABS = [
  { key: "all", label: "Todas" },
  { key: "Pipeline", label: "Pipeline" },
  { key: "Solicitud", label: "Solicitudes" },
  { key: "Activa", label: "Activas" },
  { key: "Rechazada", label: "Rechazadas" },
] as const;

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const months = Math.floor(d / 30);
  return `${months}mes${months > 1 ? "es" : ""}`;
}

export default function Page() {
  const router = useRouter();
  const [items, setItems] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch("/api/control/accounts-unified", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setItems(d.items || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const filtered = useMemo(() => {
    let rows = items;
    if (tab !== "all") {
      rows = rows.filter((r) => STATUS_CONFIG[r.status]?.group === tab);
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.companyName || "").toLowerCase().includes(s) ||
          (r.contactName || "").toLowerCase().includes(s) ||
          (r.contactEmail || "").toLowerCase().includes(s) ||
          (r.orgId || "").toLowerCase().includes(s)
      );
    }
    return rows;
  }, [items, tab, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const r of items) {
      const grp = STATUS_CONFIG[r.status]?.group;
      if (grp) c[grp] = (c[grp] || 0) + 1;
    }
    return c;
  }, [items]);

  const handleViewAs = async (orgId: string) => {
    try {
      const res = await fetch("/api/admin/view-as-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Error: ${json.error || res.statusText}`);
        return;
      }
      window.location.href = `/?_orgswitch=${Date.now()}`;
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (row: AccountRow) => {
    const intro = `🗑️ ELIMINAR\n\nEmpresa: ${row.companyName}\nTipo: ${row.kind}\nEstado: ${STATUS_CONFIG[row.status]?.label || row.status}\n${row.orgId ? `OrgId: ${row.orgId}\n` : ""}${row.contactEmail ? `Email: ${row.contactEmail}\n` : ""}\n${
      row.kind === "lead"
        ? "Borra el lead del pipeline."
        : row.kind === "onboarding"
        ? row.orgId
          ? "Borra TODA la cuenta (organización + usuarios + data) + el onboarding_request."
          : "Borra solo la solicitud (onboarding_request)."
        : "Borra TODA la organización + usuarios + data."
    }\n\n¿Continuar?`;

    if (!confirm(intro)) return;
    if (!confirm(`Última confirmación. Eliminar "${row.companyName}"?`)) return;

    try {
      let res: Response;
      if (row.kind === "lead" && row.leadId) {
        res = await fetch(`/api/admin/leads/${row.leadId}`, { method: "DELETE" });
      } else if (row.kind === "onboarding" && row.onboardingId) {
        res = await fetch(`/api/admin/onboardings/${row.onboardingId}/delete`, {
          method: "DELETE",
        });
      } else if (row.kind === "org" && row.orgId) {
        res = await fetch(`/api/admin/orgs/${row.orgId}/wipe-account`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: `WIPE-${row.orgId}` }),
        });
      } else {
        alert("No se pudo identificar qué borrar");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        alert(`Error: ${json.error || res.statusText}`);
        return;
      }
      alert("Eliminado correctamente.");
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "24px 32px", color: "#E4E4E7" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
          Cuentas
        </h1>
        <p style={{ fontSize: 13, color: "#71717A" }}>
          Vista unificada de leads, solicitudes de onboarding y cuentas activas.
        </p>
      </div>

      {/* Tabs + búsqueda */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "6px 12px",
              background: tab === t.key ? "#27272A" : "transparent",
              border: "1px solid #27272A",
              borderRadius: 8,
              color: tab === t.key ? "#fff" : "#A1A1AA",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label}
            <span style={{ marginLeft: 6, color: "#71717A", fontWeight: 500 }}>
              {counts[t.key] || 0}
            </span>
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email u orgId…"
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            background: "#0A0A0B",
            border: "1px solid #27272A",
            borderRadius: 8,
            color: "#E4E4E7",
            fontSize: 12,
            width: 280,
          }}
        />
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          style={{
            padding: "6px 12px",
            background: "transparent",
            border: "1px solid #27272A",
            borderRadius: 8,
            color: "#A1A1AA",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Refrescar
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: "#71717A", fontSize: 13 }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, color: "#71717A", fontSize: 13, textAlign: "center" }}>
          Sin cuentas en este tab.
        </div>
      ) : (
        <div
          style={{
            background: "#0A0A0B",
            border: "1px solid #1F1F23",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#0F0F11", borderBottom: "1px solid #1F1F23" }}>
                <th style={th}>Empresa</th>
                <th style={th}>Contacto</th>
                <th style={th}>Plataformas</th>
                <th style={th}>Estado</th>
                <th style={th}>Conectada</th>
                <th style={th}>Solicitud</th>
                <th style={{ ...th, textAlign: "right", paddingRight: 16 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.LEAD;
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #1F1F23" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>
                        {row.companyName}
                      </div>
                      {row.orgId && (
                        <div style={{ fontSize: 10, color: "#52525B", marginTop: 2, fontFamily: "monospace" }}>
                          {row.orgId}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ fontSize: 12, color: "#E4E4E7" }}>{row.contactName || "—"}</div>
                      <div style={{ fontSize: 11, color: "#71717A" }}>{row.contactEmail || "—"}</div>
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {row.platforms.vtex && <Pill color="#FF0080">VTEX</Pill>}
                        {row.platforms.ml && <Pill color="#FFE600" textColor="#78350F">ML</Pill>}
                        {row.platforms.meta && <Pill color="#1877F2">Meta</Pill>}
                        {row.platforms.google && <Pill color="#4285F4">Google</Pill>}
                        {!row.platforms.vtex && !row.platforms.ml && !row.platforms.meta && !row.platforms.google && (
                          <span style={{ fontSize: 11, color: "#52525B" }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          background: cfg.bg,
                          color: cfg.color,
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: 0.3,
                        }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ color: "#71717A", fontSize: 11 }}>
                        {row.activatedAt ? `hace ${formatRelative(row.activatedAt)}` : "—"}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ color: "#71717A", fontSize: 11 }}>
                        {row.submittedAt ? `hace ${formatRelative(row.submittedAt)}` : "—"}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right", paddingRight: 16 }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        {row.kind === "onboarding" && row.onboardingId && (
                          <button
                            onClick={() => router.push(`/control/onboardings?id=${row.onboardingId}`)}
                            style={btnSecondary}
                          >
                            Detalle
                          </button>
                        )}
                        {row.orgId && (
                          <button
                            onClick={() => handleViewAs(row.orgId!)}
                            style={btnPrimary}
                            title="Ver dashboard como este cliente"
                          >
                            Ver como
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(row)}
                          style={btnDanger}
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "#52525B" }}>
        Mostrando {filtered.length} de {items.length} cuenta{items.length === 1 ? "" : "s"}.
      </div>
    </div>
  );
}

function Pill({ color, textColor, children }: { color: string; textColor?: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        background: color,
        color: textColor || "#fff",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.3,
      }}
    >
      {children}
    </span>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 10,
  fontWeight: 600,
  color: "#71717A",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
const td: React.CSSProperties = { padding: "10px 14px", verticalAlign: "top" };
const btnSecondary: React.CSSProperties = {
  padding: "5px 10px",
  background: "transparent",
  border: "1px solid #27272A",
  borderRadius: 7,
  color: "#A1A1AA",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  padding: "5px 10px",
  background: "rgba(56,189,248,0.1)",
  border: "1px solid rgba(56,189,248,0.4)",
  borderRadius: 7,
  color: "#38BDF8",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  padding: "5px 8px",
  background: "transparent",
  border: "1px solid rgba(220,38,38,0.4)",
  borderRadius: 7,
  color: "#DC2626",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};
