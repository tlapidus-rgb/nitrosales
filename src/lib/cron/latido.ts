// ══════════════════════════════════════════════════════════════════════════
// src/lib/cron/latido.ts — ¿este cron sigue corriendo?
// ══════════════════════════════════════════════════════════════════════════
// E-20 / R-C16. El modo de falla que más caro salió en la historia de este
// producto no es "el cron explota" —eso deja un 5XX en los logs— sino **"el cron
// deja de existir"**. `refresh-pixel-first-source` estuvo **cinco semanas** fuera
// de `vercel.json` y nadie se enteró: un cron que no corre no falla, simplemente
// no pasa nada.
//
// ── POR QUÉ NO ALCANZA CON EL CHEQUEO DE FRESCURA ────────────────────────
// `checkPipelineFreshness` detecta crons caídos **de rebote**: mira si las
// tablas que ellos escriben se quedaron viejas. Eso cubre quince tablas y deja
// afuera a todos los crons cuyo trabajo no termina en una tabla vigilada —
// `digest`, `anomalies`, `ads-utm-audit`, `control-alerts`, `alertas-clientes`,
// `warm-cache`, `sync/chain`. Si cualquiera de esos deja de correr, **hoy no se
// entera nadie**, y son justo los que le hablan al cliente.
//
// Un latido lo detecta directo y sin depender de qué escribe cada uno.
//
// ── LA CADENCIA SALE DE `vercel.json`, NO DE UNA LISTA A MANO ────────────
// Una lista de "este cron corre cada X" se desincroniza en silencio en cuanto
// alguien cambia un schedule, y el modo de falla sería no avisar sobre el cron
// que justamente cambió. Es exactamente el error que `freshness.ts` documenta
// sobre las columnas de organización. Acá la fuente de verdad es la misma que
// usa Vercel.
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { TABLA_CURSORES } from "./cursor-store";

export type Latido = {
  cron: string;
  ultimaCorrida: Date | null;
  ultimaOk: boolean | null;
  ultimoError: string | null;
};

export type CronAtrasado = {
  cron: string;
  /** Cada cuánto debería correr, en minutos, según `vercel.json`. */
  cadaMin: number;
  /** Hace cuánto que no corre, en minutos. `null` = nunca latió. */
  haceMin: number | null;
  motivo: "nunca-latio" | "atrasado" | "ultima-fallo";
  detalle: string;
};

/**
 * Cuánta tolerancia se le da a un cron antes de considerarlo caído.
 *
 * Tres veces su cadencia: absorbe una corrida perdida y un deploy sin gritar,
 * y sigue detectando un cron desagendado el mismo día. Es el mismo múltiplo que
 * ya usa `PIPELINE_FRESHNESS_TARGETS`, a propósito — dos sistemas que vigilan lo
 * mismo con criterios distintos se contradicen tarde o temprano.
 */
const TOLERANCIA = 3;

/**
 * Un piso, para que un cron de cada minuto no se reporte caído por un retraso
 * de segundos. Vercel no garantiza puntualidad al minuto.
 */
const TOLERANCIA_MINIMA_MIN = 15;

/**
 * Cada cuántos minutos dispara una expresión cron de las que usa este repo.
 *
 * Cubre las formas que aparecen en `vercel.json`: el comodin, el paso (barra
 * seguida de un numero), listas `a,b,c` y
 * valores fijos. Devuelve `null` para lo que no entiende, que es mejor que
 * inventar una cadencia y alertar de más.
 */
export function cadaCuantosMinutos(expr: string): number | null {
  const campos = expr.trim().split(/\s+/);
  if (campos.length < 5) return null;
  const [min, hora, diaMes, , diaSem] = campos;

  const vecesEn = (campo: string, total: number): number | null => {
    if (campo === "*") return total;
    if (/^\*\/\d+$/.test(campo)) {
      const n = parseInt(campo.slice(2), 10);
      return n > 0 ? Math.floor(total / n) : null;
    }
    if (/^[\d,]+$/.test(campo)) return campo.split(",").filter(Boolean).length;
    return null;
  };

  const porHora = vecesEn(min, 60);
  const horas = vecesEn(hora, 24);
  if (porHora === null || horas === null) return null;

  // Semanal o mensual: la cadencia deja de ser "por día".
  const semanal = diaSem !== "*" && /^[\d,]+$/.test(diaSem);
  const mensual = diaMes !== "*" && /^[\d,]+$/.test(diaMes);

  const porDia = porHora * horas;
  if (porDia <= 0) return null;
  if (mensual) return (30 * 24 * 60) / porDia;
  if (semanal) return (7 * 24 * 60) / (porDia * diaSem.split(",").length);
  return (24 * 60) / porDia;
}

/**
 * Qué crons están caídos o atrasados.
 *
 * Un cron que **nunca latió** no se reporta como caído: puede ser que el código
 * del latido se haya deployado recién, o que ese cron todavía no corrió una
 * primera vez. Se reporta aparte, porque "no sé" no es "está roto" — y porque
 * si lo tratáramos como caído, el primer deploy encendería todas las alarmas a
 * la vez y nadie las volvería a mirar.
 */
export function cronesAtrasados(
  latidos: readonly Latido[],
  /** cron → expresión de `vercel.json`. */
  schedules: Readonly<Record<string, string>>,
  ahora: Date = new Date(),
): CronAtrasado[] {
  const out: CronAtrasado[] = [];
  const porNombre = new Map(latidos.map((l) => [l.cron, l]));

  for (const [cron, expr] of Object.entries(schedules)) {
    const cadaMin = cadaCuantosMinutos(expr);
    if (cadaMin === null) continue; // expresión que no entendemos: no inventamos

    const l = porNombre.get(cron);
    if (!l || !l.ultimaCorrida) {
      out.push({
        cron,
        cadaMin,
        haceMin: null,
        motivo: "nunca-latio",
        detalle: "Nunca registró una corrida. Puede ser que el latido se haya deployado recién.",
      });
      continue;
    }

    const haceMin = Math.floor((ahora.getTime() - l.ultimaCorrida.getTime()) / 60_000);
    const corte = Math.max(cadaMin * TOLERANCIA, TOLERANCIA_MINIMA_MIN);

    if (haceMin > corte) {
      out.push({
        cron,
        cadaMin,
        haceMin,
        motivo: "atrasado",
        detalle:
          `Debería correr cada ${formatoMin(cadaMin)} y no corre hace ${formatoMin(haceMin)}. ` +
          "Lo más probable es que lo hayan sacado de vercel.json o que Vercel dejó de dispararlo.",
      });
      continue;
    }

    if (l.ultimaOk === false) {
      out.push({
        cron,
        cadaMin,
        haceMin,
        motivo: "ultima-fallo",
        detalle: `Corre, pero la última terminó con error: ${l.ultimoError ?? "sin detalle"}`,
      });
    }
  }

  return out;
}

function formatoMin(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} días`;
}

// ══════════════════════════════════════════════════════════════════════════
// Escribir y leer el latido
// ══════════════════════════════════════════════════════════════════════════


/** `true` si el error es "la tabla no existe" (42P01). */
function esTablaAusente(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e);
  return msg.includes("42P01") || /relation .* does not exist/i.test(msg);
}

/**
 * Deja anotado que este cron corrió, y cómo le fue.
 *
 * **Nunca tira.** Un cron no puede fallar porque no pudo escribir su propio
 * latido: eso convertiría al monitoreo en la causa de la caída. Y degrada solo
 * si la migración todavía no se corrió, igual que el cursor.
 */
export async function registrarLatido(
  cron: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${TABLA_CURSORES}" (name, last_run_at, last_ok, last_error, updated_at)
       VALUES ($1, NOW(), $2, $3, NOW())
       ON CONFLICT (name) DO UPDATE
         SET last_run_at = NOW(), last_ok = EXCLUDED.last_ok,
             last_error = EXCLUDED.last_error, updated_at = NOW()`,
      cron,
      ok,
      error ? error.slice(0, 500) : null,
    );
  } catch (e) {
    if (!esTablaAusente(e)) {
      console.error(`[latido] no se pudo registrar el latido de ${cron}:`, e);
    }
  }
}

/** Todos los latidos registrados. Lista vacía si la tabla no existe todavía. */
export async function leerLatidos(): Promise<Latido[]> {
  try {
    const filas = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT name, last_run_at, last_ok, last_error FROM "${TABLA_CURSORES}"`,
    );
    return filas.map((f) => ({
      cron: String(f.name),
      ultimaCorrida: f.last_run_at ? new Date(f.last_run_at) : null,
      ultimaOk: f.last_ok === null || f.last_ok === undefined ? null : Boolean(f.last_ok),
      ultimoError: f.last_error ?? null,
    }));
  } catch (e) {
    if (!esTablaAusente(e)) {
      console.error("[latido] no se pudieron leer los latidos:", e);
    }
    return [];
  }
}
