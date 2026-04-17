// ═══════════════════════════════════════════════════════════════════
// useCurrencyView
// ═══════════════════════════════════════════════════════════════════
// Hook central de conversion de moneda para el modulo Finanzas.
//
// 3 modos (decision D2 del plan P&L):
//   1. USD      (default, cotizacion MEP)   - "cuanto vale esto en dolares"
//   2. ARS      (nominal, el numero guardado) - "cuanto fue en pesos ese dia"
//   3. ARS_ADJ  (ajustado a poder adquisitivo de hoy) - "equivalente hoy"
//
// Ademas del modo principal, el user puede elegir la fuente del USD:
//   oficial | mep (default) | ccl | blue
//
// La seleccion se persiste en localStorage. Default: { USD, mep }.
//
// Uso tipico:
//   const { mode, setMode, usdSource, setUsdSource, convert, ready }
//     = useCurrencyView();
//   const shown = convert(amountARS, dateOfAmount);
//
// Si ready === false, convert() devuelve null (no hay datos aun).
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
export type CurrencyMode = "USD" | "ARS" | "ARS_ADJ";
export type UsdSource = "oficial" | "mep" | "ccl" | "blue";

export interface CurrencyViewState {
  mode: CurrencyMode;
  usdSource: UsdSource;
}

export interface LatestFx {
  date: string; // "YYYY-MM-DD"
  oficial: number | null;
  mep: number | null;
  ccl: number | null;
  blue: number | null;
  source: string;
}

export interface FxIpcPayload {
  latestFx: LatestFx | null;
  latestIpcMonth: string | null;
  currentIpcAcumulado: number | null;
  ipcByMonth: Record<string, { ipc: number | null; ipcAcumulado: number | null }>;
  loadedAt: string;
}

// ─────────────────────────────────────────────────────────────
// Persistencia
// ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "nitrosales.finanzas.currencyView";
const DEFAULT_STATE: CurrencyViewState = { mode: "USD", usdSource: "mep" };

function loadState(): CurrencyViewState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<CurrencyViewState>;
    const mode: CurrencyMode =
      parsed.mode === "USD" || parsed.mode === "ARS" || parsed.mode === "ARS_ADJ"
        ? parsed.mode
        : DEFAULT_STATE.mode;
    const usdSource: UsdSource =
      parsed.usdSource === "oficial" ||
      parsed.usdSource === "mep" ||
      parsed.usdSource === "ccl" ||
      parsed.usdSource === "blue"
        ? parsed.usdSource
        : DEFAULT_STATE.usdSource;
    return { mode, usdSource };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: CurrencyViewState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage llenado / deshabilitado. No es critico — es solo persistencia.
  }
}

// ─────────────────────────────────────────────────────────────
// Cache global del payload (evita refetch por cada hook mount)
// ─────────────────────────────────────────────────────────────
let cachedPayload: FxIpcPayload | null = null;
let cachedAt: number | null = null;
let inflightPromise: Promise<FxIpcPayload> | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

async function fetchFxIpc(): Promise<FxIpcPayload> {
  const now = Date.now();
  if (cachedPayload && cachedAt && now - cachedAt < CACHE_TTL_MS) {
    return cachedPayload;
  }
  if (inflightPromise) return inflightPromise;
  inflightPromise = (async () => {
    const res = await fetch("/api/finanzas/fx-ipc", { cache: "no-store" });
    if (!res.ok) throw new Error(`fx-ipc HTTP ${res.status}`);
    const json = (await res.json()) as FxIpcPayload;
    cachedPayload = json;
    cachedAt = Date.now();
    inflightPromise = null;
    return json;
  })();
  return inflightPromise;
}

// ─────────────────────────────────────────────────────────────
// Event bus para sincronizar cambios entre instancias del hook
// (cuando el user cambia el toggle en un lugar, todas las
//  instancias del hook en la pagina se enteran).
// ─────────────────────────────────────────────────────────────
type Listener = (state: CurrencyViewState) => void;
const listeners = new Set<Listener>();
function notifyAll(state: CurrencyViewState) {
  listeners.forEach((l) => l(state));
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useCurrencyView() {
  const [state, setState] = useState<CurrencyViewState>(DEFAULT_STATE);
  const [payload, setPayload] = useState<FxIpcPayload | null>(cachedPayload);
  const [loading, setLoading] = useState<boolean>(!cachedPayload);

  // Hydrate state desde localStorage una vez montado (SSR safe)
  useEffect(() => {
    setState(loadState());
  }, []);

  // Suscribirse al bus de cambios de state (para multi-instancia)
  useEffect(() => {
    const listener: Listener = (s) => setState(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Fetch del payload FX/IPC (una sola vez por pagina, via cache global)
  useEffect(() => {
    let active = true;
    fetchFxIpc()
      .then((p) => {
        if (!active) return;
        setPayload(p);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((mode: CurrencyMode) => {
    setState((prev) => {
      const next = { ...prev, mode };
      saveState(next);
      notifyAll(next);
      return next;
    });
  }, []);

  const setUsdSource = useCallback((usdSource: UsdSource) => {
    setState((prev) => {
      const next = { ...prev, usdSource };
      saveState(next);
      notifyAll(next);
      return next;
    });
  }, []);

  // ─────────────────────────────────────────────────────────────
  // convert(amountARS, dateOfAmount?)
  //
  //  - amountARS: monto en pesos argentinos nominales
  //  - dateOfAmount: "YYYY-MM-DD" opcional (usado solo en ARS_ADJ).
  //                  Si no se pasa, ARS_ADJ asume que el monto ya es
  //                  "de hoy" y no ajusta.
  //
  // Devuelve:
  //  - number: el monto convertido
  //  - null: aun no hay datos (usar `ready` para skeleton)
  // ─────────────────────────────────────────────────────────────
  const convert = useCallback(
    (amountARS: number | null | undefined, dateOfAmount?: string | null): number | null => {
      if (amountARS === null || amountARS === undefined || !Number.isFinite(amountARS)) {
        return null;
      }
      if (state.mode === "ARS") return amountARS;

      if (state.mode === "USD") {
        if (!payload?.latestFx) return null;
        const rate = payload.latestFx[state.usdSource];
        if (!rate || rate <= 0) return null;
        return amountARS / rate;
      }

      // ARS_ADJ: ajustar al poder adquisitivo de HOY
      //
      // Semantica:
      //   amountARS esta "en plata del mes X" → lo queremos ver "en plata de hoy".
      //   factor = IPC_hoy / IPC_mes_X.
      //
      // Detalles importantes:
      //   - Si no tenemos fecha: factor = 1 (asumimos que el monto ya es "de hoy").
      //   - Si el mes del monto no esta en ipcByMonth (ej: abril 2026 cuando
      //     solo tenemos hasta marzo), usamos el ultimo mes disponible como
      //     punto de partida (el mas cercano <= monthKey).
      //   - "IPC_hoy" se extrapola desde el ultimo IPC mensual publicado,
      //     sumando los dias transcurridos del mes actual * inflacion mensual.
      //     Asi un monto del mes actual todavia ve un ajuste ~1-2%.
      if (state.mode === "ARS_ADJ") {
        if (!payload || payload.currentIpcAcumulado === null) return amountARS;
        if (!dateOfAmount) return amountARS;

        // Buscar row del mes del dateOfAmount. Si no existe, caer al
        // mes disponible mas cercano hacia atras.
        const monthKey = `${dateOfAmount.substring(0, 7)}-01`;
        let row = payload.ipcByMonth[monthKey];
        if (!row || row.ipcAcumulado === null || row.ipcAcumulado <= 0) {
          const allKeys = Object.keys(payload.ipcByMonth).sort();
          const fallbackKey = allKeys.filter((k) => k <= monthKey).pop();
          if (!fallbackKey) return amountARS;
          row = payload.ipcByMonth[fallbackKey];
          if (!row || row.ipcAcumulado === null || row.ipcAcumulado <= 0) {
            return amountARS;
          }
        }

        // Extrapolar IPC de hoy desde el ultimo mes publicado.
        // Ejemplo: si latestIpcMonth = "2026-03-31", hoy = 2026-04-17,
        // y IPC mensual de marzo = 3.4%, entonces para abril asumimos
        // 3.4% prorrateado por dia → ~1.9% al dia 17 de abril.
        let ipcToday = payload.currentIpcAcumulado;
        if (payload.latestIpcMonth) {
          const latestKey = payload.latestIpcMonth.substring(0, 10);
          const lastRow = payload.ipcByMonth[latestKey];
          const lastIpcMensual = lastRow?.ipc;
          if (lastIpcMensual !== undefined && lastIpcMensual !== null && lastIpcMensual > 0) {
            const today = new Date();
            const lastYear = Number(latestKey.substring(0, 4));
            const lastMonth0 = Number(latestKey.substring(5, 7)) - 1;
            // dias transcurridos desde fin del ultimo mes IPC
            const lastMonthEnd = new Date(Date.UTC(lastYear, lastMonth0 + 1, 0));
            const daysSince = Math.max(
              0,
              Math.floor((today.getTime() - lastMonthEnd.getTime()) / 86_400_000)
            );
            // Dias del mes actual (para prorratear la inflacion mensual)
            const daysInCurMonth = new Date(
              today.getUTCFullYear(),
              today.getUTCMonth() + 1,
              0
            ).getUTCDate();
            const extraFactor = 1 + (lastIpcMensual / 100) * (daysSince / daysInCurMonth);
            ipcToday = payload.currentIpcAcumulado * extraFactor;
          }
        }

        const factor = ipcToday / row.ipcAcumulado;
        return amountARS * factor;
      }

      return amountARS;
    },
    [state.mode, state.usdSource, payload]
  );

  // ─────────────────────────────────────────────────────────────
  // Formato para display (prefijo + separadores)
  // ─────────────────────────────────────────────────────────────
  const format = useCallback(
    (value: number | null, options?: { decimals?: number; compact?: boolean }) => {
      if (value === null || value === undefined || !Number.isFinite(value)) return "—";
      const decimals = options?.decimals ?? (state.mode === "USD" ? 0 : 0);
      const compact = options?.compact ?? false;
      const formatter = new Intl.NumberFormat("es-AR", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
        notation: compact ? "compact" : "standard",
      });
      const prefix = state.mode === "USD" ? "US$ " : "$ ";
      return `${prefix}${formatter.format(value)}`;
    },
    [state.mode]
  );

  // Rate activo (util para mostrar "usando dolar MEP $1430" en la UI)
  const activeUsdRate =
    state.mode === "USD" && payload?.latestFx ? payload.latestFx[state.usdSource] : null;

  return {
    mode: state.mode,
    usdSource: state.usdSource,
    setMode,
    setUsdSource,
    convert,
    format,
    ready: !loading && payload !== null,
    loading,
    payload,
    activeUsdRate,
    lastFxDate: payload?.latestFx?.date ?? null,
    lastIpcMonth: payload?.latestIpcMonth ?? null,
  };
}
