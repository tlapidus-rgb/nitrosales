// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /pixel/canales — Mapeo de canales (self-service, pivot v2)
// ══════════════════════════════════════════════════════════════
// "Conectar palabras": IZQUIERDA los orígenes que van entrando (con nombre
// legible), DERECHA los canales YA resueltos por una regla. El usuario conecta
// cada origen a un canal; graba una regla de la org y el rollup resuelve con ella.
// Estilo alineado a ConversionRateTables (dashboard claro, Tailwind): mismo
// patrón de fetch (chequeo res.ok, tarjeta de error + Reintentar, flag de
// cancelación, skeleton) para que un 403/500 NO se vea como "todo mapeado".
//
// Nota: la ORG es SIEMPRE la de la sesión / vista actual ("view-as") — el panel
// NO elige org (si no, un cliente vería canales de otra org). El endpoint la saca
// de getOrganizationId(); acá no se manda ningún orgId.
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";

const cardStyle = "bg-white rounded-2xl border border-gray-100 transition-all duration-[280ms]";
const cardShadow = { boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12), 0 22px 40px -28px rgba(15,23,42,0.10)" };
const fmt = (n: number) => (n ?? 0).toLocaleString("es-AR");
const plural = (n: number, sing: string, plu: string) => `${n} ${n === 1 ? sing : plu}`;

// Un código es "ilegible" si trae bytes de control o el carácter de reemplazo
// (utm corrupto / binario). No se puede nombrar como canal → se oculta con conteo.
function esIlegible(codigo: string): boolean {
  const s = codigo || "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 0xfffd) return true; // control o U+FFFD (replacement)
  }
  return false;
}

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  // Piso de visitantes: baja el ruido de orígenes de 1-2 visitas (tests, typos).
  const [minVis, setMinVis] = useState(2);
  // Mapeos propios de la org (source → canal) para poder desconectarlos.
  const [misMapeos, setMisMapeos] = useState<any[]>([]);
  // Set de códigos con POST/DELETE en vuelo (acciones simultáneas no se pisan).
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [bRes, rRes] = await Promise.all([
          fetch(`/api/admin/channels-breakdown?min=${minVis}`, { cache: "no-store" }),
          fetch(`/api/admin/channel-rules`, { cache: "no-store" }),
        ]);
        if (!bRes.ok) {
          const body = await bRes.json().catch(() => ({}));
          throw new Error(body?.detail || body?.error || `HTTP ${bRes.status}`);
        }
        const json = await bRes.json();
        // Las reglas propias son "opcionales": si fallan, el panel igual sirve.
        const reglas = rRes.ok ? (await rRes.json())?.rules || [] : [];
        if (cancelled) return;
        setData(json);
        setMisMapeos(reglas.filter((r: any) => r.scope === "org"));
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error cargando canales:", err);
        setError(`No se pudieron cargar los canales: ${err?.message || "error"}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [retryTick, minVis]);

  const refetch = () => setRetryTick((t) => t + 1);

  // Canales REALES = los que el server ya devuelve resueltos POR REGLA (el
  // passthrough no viene). Es lo que va a la derecha.
  const canalesReales = useMemo(
    () => (data?.channels || []).filter((c: any) => c.channel && c.channel !== "sin_clasificar"),
    [data]
  );
  const canales = useMemo(() => canalesReales.map((c: any) => c.channel), [canalesReales]);

  // Bandeja: escondemos los ilegibles (binario) y los contamos aparte.
  const sinMapearTodos = (data?.sinMapear || []) as any[];
  const sinMapearVisible = useMemo(
    () => sinMapearTodos.filter((s) => !esIlegible(s.codigo)),
    [sinMapearTodos]
  );
  const ilegibles = sinMapearTodos.length - sinMapearVisible.length;

  // % ACCIONABLE: resuelto por regla / (resuelto + lo que queda en la bandeja
  // legible). Excluye la basura ilegible y el tail sub-umbral (no accionables),
  // así vaciar la bandeja llega a 100% exacto — la meta del panel.
  const trayVisitors = sinMapearVisible.reduce((a: number, s: any) => a + (s.visitantes || 0), 0);
  const baseCobertura = (data?.mapeadosRegla ?? 0) + trayVisitors;
  const mapPct = baseCobertura > 0
    ? Math.round(((data?.mapeadosRegla ?? 0) / baseCobertura) * 1000) / 10
    : 100;

  // Devuelve true si grabó; deja el error visible (y el input intacto) si falló.
  async function asignar(codigo: string, channel: string): Promise<boolean> {
    if (!channel?.trim()) return false;
    setRowError(null);
    setSaving((prev) => new Set(prev).add(codigo));
    try {
      const res = await fetch(`/api/admin/channel-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: codigo, channel: channel.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      refetch();
      return true;
    } catch (err: any) {
      console.error("Error asignando canal:", err);
      setRowError(`No se pudo conectar "${codigo}": ${err?.message || "error"}`);
      return false;
    } finally {
      setSaving((prev) => {
        const n = new Set(prev);
        n.delete(codigo);
        return n;
      });
    }
  }

  // Deshace un mapeo propio (borra la regla de la org). El origen vuelve a la
  // bandeja "sin mapear" en el próximo refresh.
  async function desconectar(id: string) {
    setRowError(null);
    setSaving((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/channel-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      refetch();
    } catch (err: any) {
      console.error("Error desconectando:", err);
      setRowError(`No se pudo desconectar: ${err?.message || "error"}`);
    } finally {
      setSaving((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-lg font-semibold text-gray-900">Canales</h1>
        <button onClick={refetch} className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors">
          Actualizar
        </button>
      </div>
      <p className="text-[13px] text-gray-400 mb-5">
        Conectá cada origen que entra con uno de tus canales. Lo que definís se aplica solo.
      </p>

      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200/60 rounded-xl px-4 py-3 mb-4">
          <p className="text-[12px] text-red-700">{error}</p>
          <button
            onClick={refetch}
            className="text-[11px] text-red-700 hover:text-red-900 font-semibold px-3 py-1 rounded-lg hover:bg-red-100 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {data?.channels && (
        <div className="flex items-center gap-4 text-[11px] text-gray-400 mb-4">
          <span><span className="font-semibold text-gray-700">{mapPct}%</span> mapeado</span>
          <span>{plural(canalesReales.length, "canal", "canales")}</span>
          <span>{plural(sinMapearVisible.length, "origen sin mapear", "orígenes sin mapear")}</span>
          {ilegibles > 0 && <span title="utm corrupto / binario — no se puede nombrar">{plural(ilegibles, "ilegible oculto", "ilegibles ocultos")}</span>}
          {data.sinBackfill > 0 && <span className="text-cyan-600">{fmt(data.sinBackfill)} sin procesar</span>}
        </div>
      )}

      {rowError && (
        <div className="bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-2.5 mb-4">
          <p className="text-[12px] text-amber-800">{rowError}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
          <div className={`${cardStyle} p-5 h-[460px] animate-pulse`} style={cardShadow} />
          <div className={`${cardStyle} p-5 h-[460px] animate-pulse`} style={cardShadow} />
        </div>
      ) : data?.channels ? (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
          {/* IZQUIERDA — orígenes sin mapear */}
          <div className={`${cardStyle} p-5 flex flex-col`} style={cardShadow}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Orígenes sin mapear</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Asigná cada uno a un canal para agruparlos</p>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 shrink-0">
                mín.
                <select
                  value={minVis}
                  onChange={(e) => setMinVis(Number(e.target.value))}
                  className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 text-gray-600"
                >
                  <option value={1}>todos</option>
                  <option value={2}>≥ 2 visitas</option>
                  <option value={5}>≥ 5 visitas</option>
                  <option value={10}>≥ 10 visitas</option>
                </select>
              </label>
            </div>
            <div className="overflow-y-auto flex-1 pr-1 flex flex-col gap-2" style={{ maxHeight: 460, scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
              {sinMapearVisible.length === 0 && (
                <div className="text-center text-gray-400 py-8 text-sm">Todo mapeado 🎉</div>
              )}
              {sinMapearVisible.map((s: any) => (
                <FilaSinMapear key={s.codigo} s={s} canales={canales} saving={saving.has(s.codigo)} onAsignar={asignar} />
              ))}
            </div>
          </div>

          {/* DERECHA — tus canales (solo los resueltos por una regla) */}
          <div className={`${cardStyle} p-5 flex flex-col`} style={cardShadow}>
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="text-sm font-semibold text-gray-900">Tus canales</h2>
              <span className="text-[10px] text-gray-300">{canalesReales.length}</span>
            </div>
            <div className="overflow-y-auto flex-1 pr-1" style={{ maxHeight: 460, scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
              {canalesReales.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">Todavía no hay canales resueltos</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 pr-2">Canal</th>
                      <th className="text-right text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 pl-2">Visitantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {canalesReales.map((c: any) => (
                      <tr key={c.channel} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <td className="py-1.5 pr-2 font-medium text-gray-700 truncate max-w-[220px]" title={c.channel}>
                          {c.channel}
                        </td>
                        <td className="text-right text-gray-600 tabular-nums pl-2 py-1.5">{fmt(c.visitantes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* TUS MAPEOS — reglas propias de la org, con opción de desconectar */}
        {misMapeos.length > 0 && (
          <div className={`${cardStyle} p-5 mt-5`} style={cardShadow}>
            <div className="flex items-center justify-between mb-3 gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Tus mapeos</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Los orígenes que conectaste vos. Desconectá para que vuelvan a la bandeja.</p>
              </div>
              <span className="text-[10px] text-gray-300">{misMapeos.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {misMapeos.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 text-[11px] border border-gray-100 rounded-lg pl-2.5 pr-1.5 py-1 bg-gray-50/40">
                  <span className="text-gray-500 truncate max-w-[140px]" title={m.source}>{m.source}</span>
                  <span className="text-gray-300">→</span>
                  <span className="font-medium text-gray-700 truncate max-w-[140px]" title={m.channel}>{m.channel}</span>
                  <button
                    onClick={() => desconectar(m.id)}
                    disabled={saving.has(m.id)}
                    title="Desconectar"
                    className="ml-0.5 w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    {saving.has(m.id) ? "·" : "×"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
      ) : !error ? (
        <div className="text-gray-400 text-sm py-16 text-center">Sin datos.</div>
      ) : null}
    </div>
  );
}

function FilaSinMapear({ s, canales, saving, onAsignar }: any) {
  const [val, setVal] = useState("");
  const conectar = async () => {
    const ok = await onAsignar(s.codigo, val);
    if (ok) setVal(""); // sólo limpia si grabó; si falló, deja lo escrito
  };
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gray-800 truncate" title={s.nombre}>{s.nombre}</div>
        <div className="text-[10px] text-gray-400 truncate">{s.codigo} · {fmt(s.visitantes)} visitantes</div>
      </div>
      <input
        list="canales-existentes"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Asignar a canal…"
        onKeyDown={(e) => e.key === "Enter" && conectar()}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-44 bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 placeholder-gray-400"
      />
      <button
        disabled={saving || !val.trim()}
        onClick={conectar}
        className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${val.trim() && !saving ? "bg-cyan-500 hover:bg-cyan-600 text-white" : "bg-gray-100 text-gray-300 cursor-default"}`}
      >
        {saving ? "…" : "Conectar"}
      </button>
      <datalist id="canales-existentes">
        {canales.map((c: string) => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}
