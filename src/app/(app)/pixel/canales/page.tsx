// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /pixel/canales — Mapeo de canales (self-service, pivot v2)
// ══════════════════════════════════════════════════════════════
// Layout canal-céntrico (rediseño Tomy): IZQUIERDA la lista de TUS CANALES
// (clickeables) con "Sin clasificar" arriba; DERECHA, contextual: los orígenes
// del canal seleccionado (movibles a otro canal o de vuelta al bucket), o —por
// default— los orígenes sin clasificar para asignarlos. Estilo enterprise sobrio.
//
// Nota: la ORG es SIEMPRE la de la sesión / vista actual ("view-as") — el panel
// NO elige org. El endpoint la saca de getOrganizationId(); acá no se manda orgId.
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";

// Enterprise sobrio (Linear/Vercel): elevación por BORDE, sombra apenas perceptible,
// radios contenidos. Nada de halos de color ni esquinas muy redondeadas.
const cardStyle = "bg-white rounded-xl border border-slate-200 transition-colors duration-200";
const cardShadow = { boxShadow: "0 1px 2px 0 rgba(15,23,42,0.04)" };
// Foco de teclado visible (el reset global suprime el outline nativo).
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1";
const fmt = (n: number) => (n ?? 0).toLocaleString("es-AR");
const plural = (n: number, sing: string, plu: string) => `${n} ${n === 1 ? sing : plu}`;

// Distancia de edición (typos chicos). Corto por diferencia de largo > 2: solo
// nos importan errores de tipeo, no cadenas muy distintas.
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

// Sugiere un canal existente parecido al texto (no exacto) para evitar canales
// fantasma por typo/variante ("Meta Adss" → "Meta Ads"). null si no hay match ni
// nada suficientemente cercano.
function sugerirCanal(val: string, canales: string[]): string | null {
  const v = val.trim().toLowerCase();
  if (v.length < 3) return null;
  let best: string | null = null;
  let bestD = 3;
  for (const c of canales) {
    const cl = c.toLowerCase();
    if (cl === v) return null; // hay match exacto → no se sugiere nada
    const d = cl.includes(v) || v.includes(cl) ? 1 : editDistance(v, cl);
    if (d <= 2 && d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// Un origen "no tiene sentido" (→ va al bucket "Otros orígenes") si:
//  · trae bytes de control / carácter de reemplazo (utm binario corrupto), o
//  · es spam de referrer/utm: texto promocional inyectado (espacios + signos
//    tipo ¡ ! @ o una URL), o absurdamente largo (títulos de spam).
// Los dominios reales cortos (chatgpt.com, copilot.com) NO caen acá.
function esSinSentido(codigo: string): boolean {
  const s = codigo || "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 0xfffd) return true; // control o U+FFFD (replacement)
  }
  if (/\s/.test(s) && /[¡!@]|https?:|www\./i.test(s)) return true; // spam con texto promo
  if (s.length > 60) return true; // título de spam absurdamente largo
  return false;
}

// Key ÚNICA de un origen = (source, medium) (2026-08-18). El panel muestra los
// orígenes al grano source+medium (google/cpc vs google/organic), así que `codigo`
// solo ya no identifica una fila. Se usa para React keys, selección y `saving`.
const okey = (o: any) => `${o?.codigo ?? ""}${o?.medium ?? ""}`;
// Medium a mandar en la regla: SOLO si el origen viene DESAMBIGUADO por medium
// (mediumLabel != null) → regla `source AND medium` (agarra esa variante). Si no,
// undefined → regla source-only (más amplia, agarra todo el source). El '' es un
// medium legítimo (sin utm_medium), por eso se distingue de undefined.
const ruleMedium = (o: any): string | undefined => (o?.mediumLabel != null ? String(o.medium ?? "") : undefined);

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
  // Canal seleccionado en la izquierda. null = "Sin clasificar" (vista por default).
  const [selected, setSelected] = useState<string | null>(null);
  // Canales creados por el usuario que todavía no tienen ningún origen (borrador):
  // aparecen en la lista y en el autocomplete hasta que se les asigna un origen.
  const [borradores, setBorradores] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);
  const [nuevoCanal, setNuevoCanal] = useState("");
  // Confirmación de éxito (verde), con "Deshacer" opcional. Se autolimpia.
  const [rowOk, setRowOk] = useState<{ msg: string; undo?: () => void } | null>(null);
  // Selección múltiple en "Sin clasificar" (bulk assign): set de códigos tildados.
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [bulkCanal, setBulkCanal] = useState("");

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

  // El toast de éxito se autolimpia (no tapa la UI). Se resetea su timer en cada
  // nuevo `rowOk`.
  useEffect(() => {
    if (!rowOk) return;
    const t = setTimeout(() => setRowOk(null), 6000);
    return () => clearTimeout(t);
  }, [rowOk]);

  // La selección múltiple vive solo en "Sin clasificar" → al entrar a un canal se
  // limpia (evita acciones sobre códigos que ya no se ven).
  useEffect(() => {
    if (selected !== null) setSeleccion(new Set());
  }, [selected]);

  // Bandeja: separamos legibles (van a "sin clasificar") de los ilegibles/binarios,
  // que NO se ocultan: se acumulan en el canal catch-all "Otros orígenes".
  const sinMapearTodos = (data?.sinMapear || []) as any[];
  const sinMapearVisible = useMemo(
    () => sinMapearTodos.filter((s) => !esSinSentido(s.codigo)),
    [sinMapearTodos]
  );
  const sinClasificarVisitantes = useMemo(
    () => sinMapearTodos.filter((s) => esSinSentido(s.codigo)).reduce((a, s) => a + (s.visitantes || 0), 0),
    [sinMapearTodos]
  );

  // Canales de la izquierda = los resueltos POR REGLA + el bucket "Otros orígenes"
  // (lo ilegible/sin-sentido). El passthrough legible NO viene acá (vive en "Sin
  // clasificar"). Se mergea si ya existe una regla → "Otros orígenes".
  const CATCH = "Otros orígenes";
  const canalesReales = useMemo(() => {
    const base = (data?.channels || [])
      .filter((c: any) => c.channel)
      .map((c: any) => (c.channel === "sin_clasificar" ? { ...c, channel: CATCH } : c));
    let out = base;
    if (sinClasificarVisitantes > 0) {
      const i = base.findIndex((c: any) => c.channel === CATCH);
      if (i >= 0) {
        out = base.map((c: any, j: number) =>
          j === i ? { ...c, visitantes: (c.visitantes || 0) + sinClasificarVisitantes } : c
        );
      } else {
        out = [...base, { channel: CATCH, visitantes: sinClasificarVisitantes }];
      }
    }
    return [...out].sort((a: any, b: any) => (b.visitantes || 0) - (a.visitantes || 0));
  }, [data, sinClasificarVisitantes]);

  // Datalist: canales reales + "Otros orígenes" al final (para mandar ahí los
  // legibles que no tengan sentido).
  const canales = useMemo(() => {
    const names = canalesReales.map((c: any) => c.channel).filter((n: string) => n !== CATCH);
    const extra = borradores.filter((b) => !names.includes(b) && b !== CATCH);
    return [...names, ...extra, CATCH];
  }, [canalesReales, borradores]);

  // Lista de la izquierda: canales reales + los borradores que todavía no tienen
  // origen (visitantes 0), para que aparezcan apenas los creás.
  const canalesListado = useMemo(() => {
    const reales = new Set(canalesReales.map((c: any) => c.channel));
    const drafts = borradores
      .filter((b) => !reales.has(b))
      .map((b) => ({ channel: b, visitantes: 0, draft: true }));
    return [...canalesReales, ...drafts];
  }, [canalesReales, borradores]);

  function crearCanal() {
    const nombre = nuevoCanal.trim();
    setCreando(false);
    setNuevoCanal("");
    if (!nombre) return;
    if (!borradores.includes(nombre)) setBorradores((prev) => [...prev, nombre]);
    setSelected(nombre); // te lleva al canal nuevo (vacío) para empezar a llenarlo
  }

  // Orígenes del canal seleccionado (drill-down). Para el catch-all "Otros
  // orígenes" muestro los ilegibles/sin-sentido (el server los deja sin-mapear
  // pero el cliente los agrupa acá).
  const originesDelCanal = useMemo(() => {
    if (selected === null) return [];
    if (selected === CATCH) {
      return sinMapearTodos
        .filter((s: any) => esSinSentido(s.codigo))
        .map((s: any) => ({ ...s, channel: CATCH }));
    }
    return (data?.origins || []).filter((o: any) => o.channel === selected);
  }, [data, selected, sinMapearTodos]);

  // id de la regla PROPIA de un origen (para poder "sacarlo" del canal). null si
  // lo mapea una regla global (seed) → ese solo se puede MOVER, no desconectar.
  const userRuleIdFor = (o: any) => {
    const src = (o?.codigo || "").toLowerCase();
    // Origen desambiguado por medium → busca la regla source+medium; si no, la
    // source-only (r.medium null). Así "Sacar" borra la variante correcta.
    const med = o?.mediumLabel != null ? String(o.medium ?? "").toLowerCase() : null;
    const m = misMapeos.find((r: any) =>
      r.source === src &&
      (med == null ? r.medium == null : String(r.medium ?? "").toLowerCase() === med)
    );
    return m ? m.id : null;
  };

  // COBERTURA: 100% del tráfico legible ya está asignado a un canal (cada origen es
  // un canal por sí mismo vía passthrough; lo ilegible/spam va a "Otros orígenes").
  // El número se calcula SOBRE LO ASIGNADO — se aclara en el copy bajo la métrica.
  const mapPct = (data?.conCrudo ?? 0) > 0 ? 100 : 0;

  // POST puro de un mapeo (sin refetch ni UI). Devuelve el id de la regla creada
  // (para poder deshacer) o lanza. Reutilizado por `asignar` (1 fila) y por el bulk.
  async function postRule(codigo: string, channel: string, medium?: string): Promise<string> {
    const res = await fetch(`/api/admin/channel-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // medium presente (incluso '') → regla source+medium; ausente → source-only.
      body: JSON.stringify({ source: codigo, channel: channel.trim(), ...(medium !== undefined ? { medium } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    const body = await res.json().catch(() => ({}));
    return body?.id as string;
  }

  // Devuelve true si grabó; deja el error visible (y el input intacto) si falló.
  // En éxito muestra un toast con "Deshacer" (borra la regla recién creada).
  async function asignar(o: any, channel: string): Promise<boolean> {
    if (!channel?.trim()) return false;
    const k = okey(o);
    setRowError(null);
    setSaving((prev) => new Set(prev).add(k));
    try {
      const id = await postRule(o.codigo, channel, ruleMedium(o));
      refetch();
      setRowOk({
        msg: `Se agrupó «${o.nombre || o.codigo}» en ${channel.trim()}`,
        undo: id ? () => desconectar(id) : undefined,
      });
      return true;
    } catch (err: any) {
      console.error("Error asignando canal:", err);
      setRowError(`No se pudo asignar "${o.nombre || o.codigo}": ${err?.message || "error"}`);
      return false;
    } finally {
      setSaving((prev) => {
        const n = new Set(prev);
        n.delete(k);
        return n;
      });
    }
  }

  // Bulk: asigna TODOS los códigos seleccionados a un mismo canal (loop de POSTs,
  // un solo refetch al final). Para excluir en lote, channel = "Otros orígenes".
  async function asignarLote(channel: string) {
    const c = channel.trim();
    if (!c) return;
    const keys = [...seleccion];
    if (keys.length === 0) return;
    // Resolver las keys seleccionadas → orígenes (source+medium) de la lista visible.
    const byKey = new Map(sinMapearVisible.map((s: any) => [okey(s), s]));
    const items = keys.map((k) => byKey.get(k)).filter(Boolean) as any[];
    setRowError(null);
    setSaving((prev) => new Set([...prev, ...keys]));
    let ok = 0;
    const errores: string[] = [];
    for (const o of items) {
      try {
        await postRule(o.codigo, c, ruleMedium(o));
        ok++;
      } catch (err: any) {
        errores.push(o.nombre || o.codigo);
      }
    }
    setSaving((prev) => {
      const n = new Set(prev);
      keys.forEach((x) => n.delete(x));
      return n;
    });
    setSeleccion(new Set());
    setBulkCanal("");
    refetch();
    if (errores.length) setRowError(`No se pudieron asignar ${errores.length} de ${items.length} orígenes.`);
    if (ok) setRowOk({ msg: `Se agruparon ${ok} ${ok === 1 ? "origen" : "orígenes"} en ${c}` });
  }

  // Deshace un mapeo propio (borra la regla de la org). El origen vuelve a "sin
  // clasificar" en el próximo refresh.
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
      setRowError(`No se pudo sacar del canal: ${err?.message || "error"}`);
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
        <h1 className="text-lg font-semibold text-slate-900">Canales</h1>
        <button onClick={refetch} className={`text-xs text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors ${focusRing}`}>
          Actualizar
        </button>
      </div>
      <p className="text-[13px] text-slate-500 mb-5">
        Agrupá los orígenes de tráfico en canales. Elegí un canal para ver y editar qué orígenes tiene.
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
        <>
          <div className="flex items-center gap-5 mb-1">
            <div className="flex items-baseline gap-1.5" title="Porcentaje calculado sobre el tráfico ya asignado a un canal">
              <span className="text-lg font-semibold text-slate-900 tabular-nums">{mapPct}%</span>
              <span className="text-[11px] text-slate-500">cobertura</span>
            </div>
            <div className="h-1 w-28 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-label="Cobertura de canales" aria-valuenow={mapPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-slate-900 transition-all duration-500" style={{ width: `${Math.min(mapPct, 100)}%` }} />
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span className="tabular-nums">{plural(canalesReales.length, "canal", "canales")}</span>
              <span className="tabular-nums">{plural(sinMapearVisible.length, "origen sin clasificar", "orígenes sin clasificar")}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mb-5">Porcentaje calculado sobre el tráfico ya asignado a un canal.</p>
        </>
      )}

      {rowError && (
        <div className="bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-2.5 mb-4">
          <p className="text-[12px] text-amber-800">{rowError}</p>
        </div>
      )}

      {rowOk && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200/60 rounded-xl px-4 py-2.5 mb-4">
          <p className="text-[12px] text-emerald-800">{rowOk.msg}</p>
          {rowOk.undo && (
            <button
              onClick={() => { rowOk.undo?.(); setRowOk(null); }}
              className={`text-[11px] text-emerald-800 hover:text-emerald-900 font-semibold px-3 py-1 rounded-lg hover:bg-emerald-100 transition-colors ${focusRing}`}
            >
              Deshacer
            </button>
          )}
        </div>
      )}

      {/* Autocomplete de canales — UNA sola instancia; cada input la referencia por id. */}
      <datalist id="canales-existentes">
        {canales.map((c: string) => <option key={c} value={c} />)}
      </datalist>

      {loading && !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
          <div className={`${cardStyle} p-5 h-[460px] animate-pulse`} style={cardShadow} />
          <div className={`${cardStyle} p-5 h-[460px] animate-pulse`} style={cardShadow} />
        </div>
      ) : data?.channels ? (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
          {/* IZQUIERDA — Tus canales (clickeables) */}
          <div className={`${cardStyle} p-5 flex flex-col`} style={cardShadow}>
            <div className="flex items-start justify-between mb-3 gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Tus canales</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">Cada canal agrupa varios orígenes bajo un nombre.</p>
              </div>
              <button
                onClick={() => setCreando(true)}
                className={`text-[11px] font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0 rounded ${focusRing}`}
                title="Crear un canal nuevo"
              >
                + Crear canal
              </button>
            </div>
            {creando && (
              <div className="flex items-center gap-1.5 mb-2">
                <input
                  autoFocus
                  value={nuevoCanal}
                  onChange={(e) => setNuevoCanal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") crearCanal();
                    if (e.key === "Escape") { setCreando(false); setNuevoCanal(""); }
                  }}
                  placeholder="Nombre del canal…"
                  className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 placeholder-slate-500"
                />
                <button onClick={crearCanal} disabled={!nuevoCanal.trim()} className={`text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors ${focusRing} ${nuevoCanal.trim() ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-slate-100 text-slate-400 cursor-default"}`}>Crear</button>
                <button onClick={() => { setCreando(false); setNuevoCanal(""); }} className={`text-xs text-slate-500 hover:text-slate-800 px-1 rounded ${focusRing}`} title="Cancelar" aria-label="Cancelar">✕</button>
              </div>
            )}
            <div className="overflow-y-auto flex-1 pr-1 flex flex-col gap-0.5" style={{ maxHeight: 480, scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
              <ItemCanal
                nombre="Sin clasificar"
                visitantes={sinMapearVisible.reduce((a: number, s: any) => a + (s.visitantes || 0), 0)}
                badge={sinMapearVisible.length}
                selected={selected === null}
                muted
                onClick={() => setSelected(null)}
              />
              <div className="h-px bg-slate-100 my-1.5" />
              {canalesListado.length === 0 ? (
                <div className="text-center text-slate-500 py-6 text-xs">Todavía no hay canales resueltos</div>
              ) : (
                canalesListado.map((c: any) => (
                  <ItemCanal
                    key={c.channel}
                    nombre={c.channel}
                    visitantes={c.visitantes}
                    draft={c.draft}
                    selected={selected === c.channel}
                    muted={c.channel === CATCH}
                    onClick={() => setSelected(c.channel)}
                  />
                ))
              )}
            </div>
          </div>

          {/* DERECHA — contextual: sin clasificar (default) o los orígenes del canal */}
          <div className={`${cardStyle} p-5 flex flex-col`} style={cardShadow}>
            {selected === null ? (
              <>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Sin clasificar</h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">Asigná cada origen a un canal para agruparlos.</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0">
                    mín.
                    <select
                      value={minVis}
                      onChange={(e) => setMinVis(Number(e.target.value))}
                      className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 text-slate-600"
                    >
                      <option value={1}>todos</option>
                      <option value={2}>≥ 2 visitas</option>
                      <option value={5}>≥ 5 visitas</option>
                      <option value={10}>≥ 10 visitas</option>
                    </select>
                  </label>
                </div>
                {/* Barra de acción en lote: aparece al seleccionar ≥1 origen. */}
                {seleccion.size > 0 && (
                  <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-white border border-slate-200" style={cardShadow}>
                    <span className="text-[11px] font-medium text-slate-600 tabular-nums shrink-0 pl-1">{seleccion.size} sel.</span>
                    <input
                      list="canales-existentes"
                      value={bulkCanal}
                      onChange={(e) => setBulkCanal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && asignarLote(bulkCanal)}
                      placeholder="Asignar a canal…"
                      className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 placeholder-slate-500"
                    />
                    <button disabled={!bulkCanal.trim()} onClick={() => asignarLote(bulkCanal)} className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${focusRing} ${bulkCanal.trim() ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-slate-100 text-slate-400 cursor-default"}`}>Asignar</button>
                    <button onClick={() => asignarLote(CATCH)} title="Excluir los seleccionados (→ Otros orígenes)" className={`text-xs font-medium rounded-lg px-3 py-1.5 border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors ${focusRing}`}>Excluir</button>
                    <button onClick={() => setSeleccion(new Set())} title="Limpiar selección" aria-label="Limpiar selección" className={`text-xs text-slate-500 hover:text-slate-800 px-1 rounded ${focusRing}`}>✕</button>
                  </div>
                )}
                <div className="overflow-y-auto flex-1 pr-1 flex flex-col gap-2" style={{ maxHeight: 480, scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
                  {sinMapearVisible.length === 0 && (
                    <div className="text-center text-slate-500 py-8 text-sm">Todo consolidado</div>
                  )}
                  {sinMapearVisible.length > 0 && (
                    <label className="flex items-center gap-2 px-3 py-1 text-[11px] text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="accent-slate-900 w-3.5 h-3.5"
                        checked={seleccion.size > 0 && seleccion.size === sinMapearVisible.length}
                        ref={(el) => { if (el) el.indeterminate = seleccion.size > 0 && seleccion.size < sinMapearVisible.length; }}
                        onChange={(e) => setSeleccion(e.target.checked ? new Set(sinMapearVisible.map(okey)) : new Set())}
                      />
                      Seleccionar todos
                    </label>
                  )}
                  {sinMapearVisible.map((s: any) => (
                    <FilaOrigen
                      key={okey(s)}
                      o={s}
                      canales={canales}
                      saving={saving}
                      onAsignar={asignar}
                      onExcluir={() => asignar(s, CATCH)}
                      accion="Conectar"
                      placeholder="Asignar a canal…"
                      checked={seleccion.has(okey(s))}
                      onToggle={() => setSeleccion((prev) => {
                        const n = new Set(prev);
                        const k = okey(s);
                        n.has(k) ? n.delete(k) : n.add(k);
                        return n;
                      })}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <button onClick={() => setSelected(null)} className={`text-slate-500 hover:text-slate-800 transition-colors rounded ${focusRing}`} title="Volver a sin clasificar" aria-label="Volver">←</button>
                      <span className={`truncate ${selected === CATCH ? "italic text-slate-500" : ""}`}>{selected}</span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">Orígenes agrupados en este canal. Movelos a otro canal o sacalos.</p>
                  </div>
                  <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">{originesDelCanal.length}</span>
                </div>
                <div className="overflow-y-auto flex-1 pr-1 flex flex-col gap-2" style={{ maxHeight: 480, scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
                  {originesDelCanal.length === 0 && (
                    <div className="text-center text-slate-500 py-8 text-sm">Sin orígenes en este canal.</div>
                  )}
                  {originesDelCanal.map((o: any) => (
                    <FilaOrigen
                      key={okey(o)}
                      o={o}
                      canales={canales}
                      saving={saving}
                      onAsignar={asignar}
                      accion="Mover"
                      placeholder="Mover a…"
                      ruleId={userRuleIdFor(o)}
                      onSacar={desconectar}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Texto explicativo — help-center al pie, cubre canales y orígenes */}
        <div className={`${cardStyle} p-5 mt-5`} style={cardShadow}>
          <h3 className="text-[13px] font-semibold text-slate-900 mb-3">Cómo funciona</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[12px] leading-relaxed">
            <p className="text-slate-500"><span className="font-medium text-slate-700">Canales.</span> Un canal agrupa varios orígenes de tráfico bajo un mismo nombre —por ejemplo «Meta Ads» junta fb, ig, facebook y meta—. Así leés tus métricas por canal en vez de por cada origen suelto.</p>
            <p className="text-slate-500"><span className="font-medium text-slate-700">Sin clasificar.</span> Los orígenes que todavía no pertenecen a ningún canal. Asignalos a uno existente, creá uno nuevo, o excluílos. No es obligatorio: agrupá lo que te sirva.</p>
            <p className="text-slate-500"><span className="font-medium text-slate-700">Otros orígenes.</span> El canal donde caen los que excluís —ilegibles, spam o irrelevantes—. No se pierden: quedan agrupados y fuera del camino.</p>
            <p className="text-slate-500"><span className="font-medium text-slate-700">Cobertura.</span> El porcentaje se calcula sobre el tráfico ya asignado a un canal. Los orígenes sin clasificar podés agruparlos cuando quieras: no es obligatorio.</p>
          </div>
        </div>
        </>
      ) : !error ? (
        <div className="text-slate-500 text-sm py-16 text-center">Sin datos.</div>
      ) : null}
    </div>
  );
}

// Un canal en la lista de la izquierda (clickeable, con estado seleccionado).
function ItemCanal({ nombre, visitantes, badge, draft, selected, muted, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg transition-colors ${focusRing} ${selected ? "bg-slate-900" : "hover:bg-slate-50"}`}
    >
      <span className={`text-[13px] font-medium truncate ${selected ? "text-white" : muted ? "text-slate-500 italic" : "text-slate-700"}`} title={nombre}>
        {nombre}
      </span>
      <span className={`flex items-center gap-1.5 shrink-0 text-[11px] tabular-nums ${selected ? "text-slate-300" : "text-slate-500"}`}>
        {typeof badge === "number" && badge > 0 && (
          <span className={`px-1.5 py-px rounded-full text-[11px] ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{badge}</span>
        )}
        {draft ? <span className={`italic ${selected ? "text-slate-300" : "text-slate-500"}`}>nuevo</span> : fmt(visitantes)}
      </span>
    </button>
  );
}

// Una fila de origen en la derecha. En "Sin clasificar" el botón es "Conectar"
// (+ "Excluir" para mandarlo a Otros orígenes); dentro de un canal es "Mover"
// (+ "Sacar" si el origen lo mapea una regla propia). Muestra un PREVIEW en vivo
// de a dónde va antes de aplicar.
function FilaOrigen({ o, canales, saving, onAsignar, onExcluir, accion, placeholder, ruleId, onSacar, checked, onToggle }: any) {
  const [val, setVal] = useState("");
  const busy = saving.has(okey(o)) || (ruleId && saving.has(ruleId));
  const aplicar = async () => {
    const ok = await onAsignar(o, val);
    if (ok) setVal(""); // sólo limpia si grabó; si falló, deja lo escrito
  };
  const v = val.trim();
  const match = v ? canales.find((c: string) => c.toLowerCase() === v.toLowerCase()) : null;
  // Sugerencia anti-fragmentación: si escribiste algo parecido a un canal que ya
  // existe (pero no exacto), ofrecemos usarlo en vez de crear un duplicado.
  const sugerido = v && !match ? sugerirCanal(v, canales) : null;
  return (
    <div className={`flex flex-col gap-1 px-3 py-2 rounded-xl border transition-colors ${checked ? "border-slate-300 bg-slate-50" : "border-slate-100 hover:bg-slate-50/50"}`}>
      <div className="flex items-center gap-2">
        {onToggle && (
          <input
            type="checkbox"
            checked={!!checked}
            onChange={onToggle}
            className="accent-slate-900 shrink-0 w-3.5 h-3.5"
            aria-label={`Seleccionar ${o.nombre}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-slate-800 truncate flex items-center gap-1.5" title={o.mediumLabel ? `${o.nombre} · ${o.mediumLabel}` : o.nombre}>
            <span className="truncate">{o.nombre}</span>
            {o.mediumLabel && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-px rounded-full bg-slate-100 text-slate-500">{o.mediumLabel}</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 truncate">{o.codigo}{o.medium ? ` · ${o.medium}` : ""} · {fmt(o.visitantes)} visitantes</div>
        </div>
        <input
          list="canales-existentes"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && aplicar()}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-36 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 placeholder-slate-500"
        />
        {v ? (
          <button disabled={busy} onClick={aplicar} className={`text-xs font-medium rounded-lg px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white transition-colors disabled:opacity-50 ${focusRing}`}>{busy ? "…" : accion}</button>
        ) : ruleId ? (
          <button disabled={busy} onClick={() => onSacar(ruleId)} title="Sacar del canal (vuelve a sin clasificar)" className={`text-xs font-medium rounded-lg px-3 py-1.5 border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 ${focusRing}`}>{busy ? "…" : "Sacar"}</button>
        ) : accion === "Mover" ? (
          <span className="text-[11px] text-slate-500 px-2 w-[52px] text-center shrink-0" title="Regla por defecto — solo se puede mover">auto</span>
        ) : onExcluir ? (
          <button disabled={busy} onClick={onExcluir} title="Excluir: mandarlo a «Otros orígenes»" className={`text-xs font-medium rounded-lg px-3 py-1.5 border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors disabled:opacity-50 ${focusRing}`}>{busy ? "…" : "Excluir"}</button>
        ) : (
          <button disabled className="text-xs font-medium rounded-lg px-3 py-1.5 bg-slate-100 text-slate-400 cursor-default">{accion}</button>
        )}
      </div>
      {v && (
        <div className="text-[11px] pl-0.5">
          {match ? (
            <span className="text-slate-500">→ se agrupa en <span className="font-medium text-slate-700">{match}</span> · {fmt(o.visitantes)} visitantes</span>
          ) : sugerido ? (
            <span className="text-slate-500">
              → crea el canal <span className="font-medium text-slate-700">«{v}»</span> ·{" "}
              <button type="button" onClick={() => setVal(sugerido)} className={`text-slate-600 underline decoration-dotted underline-offset-2 hover:text-slate-900 rounded ${focusRing}`}>
                ¿quisiste decir «{sugerido}»?
              </button>
            </span>
          ) : (
            <span className="text-slate-500">→ crea el canal <span className="font-medium text-slate-700">«{v}»</span></span>
          )}
        </div>
      )}
    </div>
  );
}
