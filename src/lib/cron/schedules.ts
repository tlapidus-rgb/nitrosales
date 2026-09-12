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
export function schedulesDeVercel(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of (vercel as any).crons ?? []) {
    const nombre = nombreDeCron(String(c.path ?? ""));
    if (nombre && c.schedule) out[nombre] = String(c.schedule);
  }
  return out;
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
