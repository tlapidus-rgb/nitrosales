// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/canales — Panel de mapeo de canales (self-service, pivot v2)
// ══════════════════════════════════════════════════════════════
// "Conectar palabras": IZQUIERDA los orígenes que van entrando (con nombre
// legible), DERECHA los canales que el usuario armó. El usuario conecta cada
// origen a un canal (o crea uno nuevo). Graba una regla de la org; el rollup
// resuelve con ella sin reprocesar pixel_events.
//
// Nota: versión interna (selector de org). El cliente lo usará sobre SU org
// vía sesión — ver el TODO de auth en /api/admin/channel-rules.
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Check, Link2 } from "lucide-react";

const COL = { bg: "#0B0B0D", card: "#141417", border: "#1F1F23", text: "#E4E4E7", dim: "#71717A", accent: "#8B5CF6", ok: "#22C55E" };

// Orgs conocidas (interno). El cliente usará su propia org por sesión.
const ORGS = [
  { id: "cmohl80fx009j1sdusurp7fbj", name: "Arredo" },
  { id: "cmmmga1uq0000sb43w0krvvys", name: "El Mundo del Juguete" },
  { id: "cmod6ns420047dlnth544px9c", name: "TeVe Compras" },
];

export default function Page() {
  const [orgId, setOrgId] = useState(ORGS[0].id);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/channels-breakdown?orgId=${orgId}&min=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };
  useEffect(load, [orgId]);

  // Los canales YA definidos = los channel de las filas resueltas que no son passthrough.
  const canales = useMemo(() => {
    if (!data?.channels) return [];
    const sinMapearCodes = new Set((data.sinMapear || []).map((s: any) => s.codigo));
    return data.channels
      .filter((c: any) => c.channel !== "sin_clasificar" && !sinMapearCodes.has(c.channel))
      .map((c: any) => c.channel);
  }, [data]);

  async function asignar(codigo: string, channel: string) {
    if (!channel?.trim()) return;
    setSaving(codigo);
    await fetch(`/api/admin/channel-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, source: codigo, channel: channel.trim() }),
    });
    setSaving(null);
    load();
  }

  return (
    <div style={{ padding: 24, color: COL.text, minHeight: "calc(100vh - 72px)", background: COL.bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Canales</h1>
          <p style={{ color: COL.dim, fontSize: 13, margin: "4px 0 0" }}>
            Conectá cada origen que entra con uno de tus canales. Lo que definís se aplica solo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
            style={{ background: COL.card, color: COL.text, border: `1px solid ${COL.border}`, borderRadius: 8, padding: "8px 10px" }}>
            {ORGS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button onClick={load} style={{ background: COL.card, color: COL.dim, border: `1px solid ${COL.border}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {data && (
        <div style={{ color: COL.dim, fontSize: 12, marginBottom: 16 }}>
          {data.mapeadoPct}% mapeado · {canales.length} canales · {(data.sinMapear || []).length} orígenes sin mapear
          {data.sinBackfill > 0 && <span style={{ color: COL.accent }}> · {data.sinBackfill} filas sin procesar (F3.1)</span>}
        </div>
      )}

      {loading ? (
        <div style={{ color: COL.dim, padding: 40 }}>Cargando…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24 }}>
          {/* IZQUIERDA — orígenes que entran, sin mapear */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: COL.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
              Orígenes sin mapear
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(data?.sinMapear || []).length === 0 && (
                <div style={{ color: COL.dim, fontSize: 13 }}>Todo mapeado 🎉</div>
              )}
              {(data?.sinMapear || []).map((s: any) => (
                <FilaSinMapear key={s.codigo} s={s} canales={canales} saving={saving === s.codigo} onAsignar={asignar} />
              ))}
            </div>
          </div>

          {/* DERECHA — canales resueltos con su volumen */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: COL.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
              Tus canales
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(data?.channels || []).map((c: any) => (
                <div key={c.channel} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: COL.card, border: `1px solid ${COL.border}`, borderRadius: 8 }}>
                  <span style={{ color: c.channel === "sin_clasificar" ? COL.dim : COL.text }}>{c.channel}</span>
                  <span style={{ color: COL.dim, fontVariantNumeric: "tabular-nums" }}>{c.visitantes.toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilaSinMapear({ s, canales, saving, onAsignar }: any) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: COL.card, border: `1px solid ${COL.border}`, borderRadius: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{s.nombre}</div>
        <div style={{ color: COL.dim, fontSize: 11 }}>{s.codigo} · {s.visitantes.toLocaleString("es-AR")} visitantes</div>
      </div>
      <Link2 size={14} color={COL.dim} />
      <input
        list="canales-existentes"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Asignar a canal…"
        onKeyDown={(e) => e.key === "Enter" && onAsignar(s.codigo, val)}
        style={{ background: COL.bg, color: COL.text, border: `1px solid ${COL.border}`, borderRadius: 6, padding: "6px 8px", width: 180 }}
      />
      <button
        disabled={saving || !val.trim()}
        onClick={() => onAsignar(s.codigo, val)}
        style={{ background: val.trim() ? COL.accent : COL.border, color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: val.trim() ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4 }}
      >
        {saving ? <RefreshCw size={13} className="spin" /> : <Check size={13} />}
      </button>
      <datalist id="canales-existentes">
        {canales.map((c: string) => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}
