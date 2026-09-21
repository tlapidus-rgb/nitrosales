// ══════════════════════════════════════════════════════════════════════════
// src/lib/cron/schedules.ts — la cadencia esperada de cada cron
// ══════════════════════════════════════════════════════════════════════════
// E-20. Se lee de `vercel.json`, que es la MISMA fuente que usa Vercel para
// dispararlos. Una lista escrita a mano se desincronizaría en silencio en
// cuanto alguien cambie un schedule, y el modo de falla sería no avisar sobre
// el cron que justamente cambió — que es el peor de todos.
//
// El import se resuelve en build (`resolveJsonModule`), así que el archivo
// queda embebido y no hay que leerlo del filesystem en runtime, cosa que en
// una función serverless no está garantizada.
// ══════════════════════════════════════════════════════════════════════════

import vercel from "../../../vercel.json";

/** Nombre del cron (el último segmento de su path) → expresión cron. */
export type CronSchedules = Record<string, string | string[]>;
export const CRONES_CON_LATIDO = ["alertas-clientes", "ads-utm-audit", "alerts-scheduler",
  "anomalies", "control-alerts", "digest", "warm-cache"] as const;

export function schedulesDeVercel(crons: readonly { path: string; schedule: string }[] = vercel.crons): CronSchedules {
  const out: CronSchedules = {};
  for (const c of crons) {
    const nombre = nombreDeCron(String(c.path ?? ""));
    if (nombre && c.schedule) {
      const previous = out[nombre];
      out[nombre] = previous ? [...(Array.isArray(previous) ? previous : [previous]), c.schedule] : c.schedule;
    }
  }
  return out;
}

/** Only instrumented routes can be expected to emit a heartbeat. */
export function schedulesConLatido(): CronSchedules {
  return Object.fromEntries(Object.entries(schedulesDeVercel()).filter(([name]) =>
    (CRONES_CON_LATIDO as readonly string[]).includes(name)));
}

export function coberturaDeLatidos() {
  const schedules = schedulesDeVercel();
  const conLatido = Object.keys(schedulesConLatido());
  return { conLatido, sinLatido: Object.keys(schedules).filter(name => !conLatido.includes(name)) };
}

/**
 * El nombre con el que un cron se identifica en su latido.
 *
 * Se deriva del path y no se declara aparte: que el nombre del latido y el del
 * schedule salgan del mismo lugar es lo que hace que no se puedan desincronizar.
 */
export function nombreDeCron(path: string): string {
  return path
    .replace(/\?.*$/, "")
    .replace(/\/$/, "")
    .split("/")
    .filter(Boolean)
    .pop() ?? "";
}
