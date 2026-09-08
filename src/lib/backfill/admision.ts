// ══════════════════════════════════════════════════════════════════════════
// src/lib/backfill/admision.ts — cuándo se le permite correr a un backfill
// ══════════════════════════════════════════════════════════════════════════
// E-08. El momento de mayor riesgo para los clientes que YA están adentro es
// cuando entra uno nuevo: el backfill de Arredo trajo 252.701 órdenes y tumbó
// Neon repetidas veces (`BACKLOG_PENDIENTES.md` → BP-NEON-CAPACITY).
//
// Hasta ahora no había ningún freno:
//   · `backfill-runner` corre **cada minuto** con `maxDuration = 300`, así que
//     puede haber 5 invocaciones solapadas;
//   · `pickNextJob` no reclamaba el job de forma atómica — el "lock" era la
//     frescura de `lastChunkAt`, con 2 minutos de ventana. Dos invocaciones que
//     arrancan juntas (el cron + el trigger inmediato de `approve-backfill`)
//     podían tomar el MISMO job QUEUED;
//   · y con varios jobs encolados (4 plataformas de un cliente, o dos clientes
//     la misma semana) cada invocación tomaba uno distinto y los corría **en
//     paralelo** contra la misma base.
//
// Este módulo es la lógica pura de admisión: sin DB, sin red, testeable sola.
// El claim atómico vive en `job-manager.ts` (`reclamarProximoJob`).
//
// ── Criterio de los defaults ─────────────────────────────────────────────
// Lo que NO puede dejar a un cliente colgado va prendido por default: el límite
// de concurrencia y el freno por latencia sólo **demoran** trabajo, nunca lo
// pierden. La ventana horaria, en cambio, es política de negocio (¿aceptamos
// que un alta aprobada a las 3 de la tarde empiece a la madrugada?), así que va
// **apagada** salvo que se configure. Prenderla por default cambiaría el
// comportamiento del alta sin que nadie lo haya pedido.
// ══════════════════════════════════════════════════════════════════════════

const TZ_AR = "America/Argentina/Buenos_Aires";

/** Cuántos backfills pesados pueden estar corriendo a la vez. */
export const MAX_CONCURRENTES_DEFAULT = 1;

/**
 * Umbral de latencia de la base. Por encima de esto el runner no arranca un
 * chunk nuevo. 2 s es holgado para un `SELECT 1` contra Neon: si tarda más, la
 * base ya está sufriendo y sumarle un backfill sólo empeora las cosas para los
 * clientes que están mirando el panel.
 */
export const LATENCIA_MAX_MS_DEFAULT = 2_000;

/** Un job RUNNING con `lastChunkAt` más viejo que esto se considera abandonado. */
export const COOLDOWN_JOB_MS = 2 * 60 * 1000;

export function maxConcurrentes(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseInt(env.BACKFILL_MAX_CONCURRENTES || "", 10);
  return Number.isFinite(n) && n > 0 ? n : MAX_CONCURRENTES_DEFAULT;
}

export function latenciaMaxMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseInt(env.BACKFILL_LATENCIA_MAX_MS || "", 10);
  return Number.isFinite(n) && n > 0 ? n : LATENCIA_MAX_MS_DEFAULT;
}

export type Ventana = { desde: number; hasta: number };

/**
 * Parsea `BACKFILL_VENTANA` con formato `"desde-hasta"` en horas 0-23, hora
 * argentina. `"1-7"` = de la 1 a las 7 de la mañana. `null` = sin restricción.
 *
 * Se acepta que dé la vuelta al día (`"22-6"`). `"0-0"` y cualquier cosa que no
 * parsee se tratan como sin restricción: preferimos que un valor mal escrito
 * deje pasar el backfill y no que lo congele para siempre en silencio.
 */
export function parseVentana(env: NodeJS.ProcessEnv = process.env): Ventana | null {
  const raw = (env.BACKFILL_VENTANA || "").trim();
  if (!raw) return null;

  // ⚠️ FALLA ABIERTO, PERO NO EN SILENCIO (agregado el 2026-09-08).
  // Dejar pasar el backfill ante un valor mal escrito es lo correcto —congelarlo
  // para siempre sería peor— pero no avisar no lo es: el que puso la variable
  // cree que la ventana está activa y no lo está.
  //
  // No es hipotético: `docs/ESTADO-BRANCH-INTEGRACION.md` documentaba el formato
  // como `HH:MM-HH:MM`, que este parser rechaza. Alguien siguiendo esa tabla al
  // mergear habría puesto `01:00-07:00`, la ventana habría quedado apagada sin
  // ninguna señal, y el backfill de un cliente nuevo podría arrancar a las 3 de
  // la tarde contra Neon — el escenario exacto que E-08 vino a evitar.
  const avisar = (motivo: string): null => {
    console.error(
      `[backfill/admision] BACKFILL_VENTANA="${raw}" ${motivo}. ` +
        `Se ignora y el backfill corre A CUALQUIER HORA. El formato son horas ` +
        `enteras 0-23, por ejemplo "1-7" (de la 1 a las 7 AM, hora argentina).`,
    );
    return null;
  };

  const m = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return avisar("no tiene el formato esperado");
  const desde = parseInt(m[1], 10);
  const hasta = parseInt(m[2], 10);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return avisar("no son números");
  if (desde < 0 || desde > 23 || hasta < 0 || hasta > 23)
    return avisar("tiene horas fuera del rango 0-23");
  if (desde === hasta) return avisar("tiene la misma hora de inicio y fin");
  return { desde, hasta };
}

/** Hora (0-23) en zona argentina para un instante dado. */
export function horaArgentina(now: Date): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_AR,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return parseInt(s, 10) % 24;
}

/** ¿`now` cae dentro de la ventana? Sin ventana configurada, siempre sí. */
export function dentroDeVentana(now: Date, ventana: Ventana | null): boolean {
  if (!ventana) return true;
  const h = horaArgentina(now);
  // Ventana que da la vuelta al día (ej: 22-6) vs. ventana normal (ej: 1-7).
  return ventana.desde < ventana.hasta
    ? h >= ventana.desde && h < ventana.hasta
    : h >= ventana.desde || h < ventana.hasta;
}

export type Decision =
  | { admitido: true }
  | { admitido: false; motivo: string; detalle?: Record<string, unknown> };

/**
 * ¿Puede el runner arrancar un chunk nuevo ahora?
 *
 * El orden importa para el diagnóstico: primero lo que es política (ventana),
 * después lo que es capacidad (concurrencia, latencia). Así el motivo que sale
 * en la respuesta del cron dice lo que realmente frenó.
 */
export function decidirAdmision(params: {
  now: Date;
  ventana: Ventana | null;
  ignorarVentana?: boolean;
  jobsActivos: number;
  maxConcurrentes: number;
  latenciaMs: number;
  latenciaMaxMs: number;
}): Decision {
  if (!params.ignorarVentana && !dentroDeVentana(params.now, params.ventana)) {
    return {
      admitido: false,
      motivo: "fuera-de-ventana",
      detalle: {
        horaAr: horaArgentina(params.now),
        ventana: `${params.ventana!.desde}-${params.ventana!.hasta}`,
      },
    };
  }
  if (params.jobsActivos >= params.maxConcurrentes) {
    return {
      admitido: false,
      motivo: "otro-backfill-corriendo",
      detalle: { jobsActivos: params.jobsActivos, maxConcurrentes: params.maxConcurrentes },
    };
  }
  if (params.latenciaMs > params.latenciaMaxMs) {
    return {
      admitido: false,
      motivo: "base-lenta",
      detalle: { latenciaMs: params.latenciaMs, umbralMs: params.latenciaMaxMs },
    };
  }
  return { admitido: true };
}

/**
 * ¿Sigue estando bien seguir con el chunk siguiente DENTRO de la misma
 * invocación? Acá no se re-chequea ni la ventana ni la concurrencia: la ventana
 * no debería cortar un job por la mitad (lo dejaría a medias con el cursor
 * guardado, que es peor que terminarlo), y la concurrencia ya la ganamos.
 * Lo único que se vuelve a mirar es la latencia: si la base empezó a sufrir
 * MIENTRAS corríamos, hay que soltar.
 */
export function seguirEnElLoop(params: {
  latenciaMs: number;
  latenciaMaxMs: number;
}): Decision {
  if (params.latenciaMs > params.latenciaMaxMs) {
    return {
      admitido: false,
      motivo: "base-lenta",
      detalle: { latenciaMs: params.latenciaMs, umbralMs: params.latenciaMaxMs },
    };
  }
  return { admitido: true };
}
