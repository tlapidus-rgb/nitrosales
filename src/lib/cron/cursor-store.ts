// ══════════════════════════════════════════════════════════════════════════
// src/lib/cron/cursor-store.ts — dónde quedó cada cron
// ══════════════════════════════════════════════════════════════════════════
// E-11. De los 14 crons que recorren todas las organizaciones dentro de una
// invocación con presupuesto fijo, ocho **no tienen forma de continuar donde
// quedaron**. Varios ni siquiera es que les falte el dato: lo calculan y lo
// devuelven —`resume: "?orgCursor=7"`, `callAgain: true`, `"sin tiempo, volvé"`—
// y no hay nadie del otro lado que lo lea.
//
// El modo de falla al crecer no es "va más lento". Es **"a algunos clientes no
// les corre nunca"**, en silencio, y siempre a los mismos: los últimos de la
// lista, que son los más nuevos. Justo los que acabás de vender.
//
// Esto es un key-value chiquito: cada cron guarda por dónde iba y la próxima
// invocación arranca ahí. Sin colas, sin workers, sin self-fetch encadenado
// (que además arrastra el lío del bypass de Deployment Protection).
//
// ── DEGRADA SIN ROMPER ───────────────────────────────────────────────────
// Si la tabla todavía no existe, leer devuelve `null` (arrancás de cero, que
// es exactamente lo que pasa hoy) y escribir no hace nada. Es el mismo patrón
// que ya usan los crons Gold con sus tablas: el código se puede deployar antes
// de correr la migración, como manda `CLAUDE.md`. Mientras la tabla no esté,
// el comportamiento es idéntico al actual — ni mejor ni peor.
//
// La migración es `POST /api/admin/migrate-cron-cursors`.
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

export const TABLA_CURSORES = "cron_cursors";

/** `true` si el error es "la tabla no existe" (42P01 de Postgres). */
function esTablaAusente(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e);
  return msg.includes("42P01") || /relation .* does not exist/i.test(msg);
}

/**
 * Por dónde iba `cron`. `null` = nunca guardó nada, o la tabla no existe
 * todavía → arrancar del principio.
 *
 * Nunca tira: un cron no puede dejar de correr porque falló la lectura de su
 * propio cursor. En el peor caso vuelve a empezar, que es el comportamiento de
 * hoy.
 */
export async function leerCursor(cron: string): Promise<string | null> {
  try {
    const filas = await prisma.$queryRawUnsafe<Array<{ cursor: string | null }>>(
      `SELECT cursor FROM "${TABLA_CURSORES}" WHERE name = $1 LIMIT 1`,
      cron,
    );
    return filas[0]?.cursor ?? null;
  } catch (e) {
    if (!esTablaAusente(e)) {
      console.error(`[cursor-store] no se pudo leer el cursor de ${cron}:`, e);
    }
    return null;
  }
}

/**
 * Guarda por dónde va `cron`. `null` borra el cursor — que es lo que hay que
 * hacer al terminar una vuelta completa, para que la próxima arranque de cero.
 *
 * Tampoco tira: si esto falla, el cron ya hizo su trabajo; lo único que se
 * pierde es el punto de retorno.
 */
export async function guardarCursor(cron: string, cursor: string | null): Promise<void> {
  try {
    if (cursor === null) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${TABLA_CURSORES}" WHERE name = $1`, cron);
      return;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${TABLA_CURSORES}" (name, cursor, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = NOW()`,
      cron,
      cursor,
    );
  } catch (e) {
    if (!esTablaAusente(e)) {
      console.error(`[cursor-store] no se pudo guardar el cursor de ${cron}:`, e);
    }
  }
}

/**
 * El envoltorio que usan los crons: decide desde qué índice arrancar y deja
 * guardado dónde cortó.
 *
 * `total` es la cantidad de unidades de esta vuelta (típicamente
 * organizaciones). Si el cursor guardado quedó fuera de rango —porque se borró
 * una organización, o porque la lista se acortó— se arranca de cero en vez de
 * saltear todo, que es el modo de falla silencioso que esto viene a evitar.
 */
export async function indiceDeArranque(cron: string, total: number): Promise<number> {
  const guardado = await leerCursor(cron);
  if (guardado === null) return 0;
  // Estricto a proposito: `parseInt` es indulgente y con "3.5.2" devuelve 3,
  // asi que un cursor corrupto arrancaria en un indice inventado en vez de
  // reiniciar la vuelta. Si el valor no es exactamente un entero, se descarta.
  if (!/^[0-9]+$/.test(guardado)) return 0;
  const n = Number(guardado);
  if (!Number.isSafeInteger(n) || n >= total) return 0;
  return n;
}

/**
 * Guarda el corte al terminar la invocación.
 * `siguiente >= total` significa vuelta completa → se borra el cursor.
 */
export async function guardarCorte(
  cron: string,
  siguiente: number,
  total: number,
): Promise<void> {
  await guardarCursor(cron, siguiente >= total ? null : String(siguiente));
}
