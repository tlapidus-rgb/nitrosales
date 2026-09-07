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
 * El último id procesado por `cron`, o `null` si nunca guardó nada.
 *
 * ⚠️ POR QUÉ UN ID Y NO UN ÍNDICE (corregido el 2026-09-07, tras revisión):
 * la primera versión de esto guardaba una POSICIÓN. Eso sólo funciona si la
 * lista es la misma entre corridas, y en tres de los cuatro crons que lo usan
 * NO lo es:
 *
 *   · `refresh-gold-attribution-channel` lista las orgs con atribuciones en los
 *     últimos 4 días — una ventana deslizante que se recalcula cada media hora;
 *   · `attribution-reconcile` y `vtex-sync-recent` listan las conexiones VTEX
 *     con `status = ACTIVE`, y una credencial vencida saca a esa org de la lista.
 *
 * Cuando una organización sale del conjunto, todos los índices posteriores se
 * corren uno: guardaste "seguí en el 5", se cayó la del 2, y el 5 de ahora es
 * la que antes era la 6. **Salteaste una organización que nunca se procesó**, en
 * silencio — exactamente el bug que el cursor venía a arreglar, sólo que más
 * difícil de ver porque es intermitente.
 *
 * Con el id no pasa: "seguí después de `cmod6ns…`" sigue significando lo mismo
 * aunque la lista cambie de tamaño, de composición, o aunque esa organización
 * ya no exista.
 */
export async function ultimoProcesado(cron: string): Promise<string | null> {
  return leerCursor(cron);
}

/**
 * Guarda el último id procesado. `null` = vuelta completa → la próxima corrida
 * arranca del principio.
 */
export async function guardarUltimo(cron: string, id: string | null): Promise<void> {
  return guardarCursor(cron, id);
}

/**
 * Índice del primer elemento que todavía NO se procesó, dado el último id
 * procesado. `0` si no hay cursor.
 *
 * `ids` tiene que venir ordenado ascendente y de forma estable (el `ORDER BY`
 * de la query). Si el cursor apunta a algo que ya no está en la lista, se cae
 * naturalmente en el primero que le sigue — que es la propiedad que hace que
 * esto sea inmune a que el conjunto cambie.
 */
export function indiceDespuesDe(ids: readonly string[], cursor: string | null): number {
  if (!cursor) return 0;
  const i = ids.findIndex((id) => id > cursor);
  // Ninguno es mayor: o la vuelta ya terminó, o la lista se acortó por detrás.
  // En los dos casos corresponde empezar de nuevo, no quedarse trabado.
  return i < 0 ? 0 : i;
}

/**
 * Dónde arranca esta vuelta y si le corresponde mover el cursor persistido.
 *
 * ⚠️ EL CURSOR ES SOLO DEL MODO INCREMENTAL (revisión del 2026-09-07).
 * Los crons tienen dos modos y confundirlos rompe los dos:
 *
 *   · el **incremental**, que es el que corre por schedule y el único dueño del
 *     cursor;
 *   · el **manual** —`?full=1` para rehacer toda la historia, `?orgCursor=N`
 *     para retomar a mano— que se corre cuando algo ya salió mal.
 *
 * Si el manual arranca desde el cursor del incremental, un `?full=1` se saltea
 * en silencio todas las orgs anteriores: decís "rehacé todo", devuelve `ok` y
 * no rehizo lo que le pediste. Y si además lo guarda, mueve el cursor del
 * incremental y el cron de todos los días se saltea justo las que le faltaban.
 * `refresh-gold-attribution-channel` ya lo hacía bien; `refresh-silver-orders`
 * lo hacía mal de las dos formas.
 *
 * Está acá, y no repetido en cada route, porque es la clase de regla que se
 * escribe bien en un cron y mal en el siguiente.
 */
export function arranqueDeLaVuelta(o: {
  ids: readonly string[];
  /** Lo que devolvió `ultimoProcesado`. */
  cursorGuardado: string | null;
  /** El `?orgCursor=` crudo de la URL, o `null` si no vino. */
  cursorExplicito: string | null;
  /** `?full=1`. */
  full: boolean;
}): { desde: number; persiste: boolean } {
  if (o.cursorExplicito !== null) {
    const n = parseInt(o.cursorExplicito, 10);
    const desde = Number.isFinite(n) ? Math.max(0, Math.min(n, o.ids.length)) : 0;
    return { desde, persiste: false };
  }
  if (o.full) return { desde: 0, persiste: false };
  return { desde: indiceDespuesDe(o.ids, o.cursorGuardado), persiste: true };
}

/**
 * Guarda el corte al terminar la invocación.
 *
 * `siguiente` es el índice del primer elemento NO procesado (o `ids.length` si
 * se completó la vuelta). Si no se procesó ninguno, el cursor no se toca: pisarlo
 * con algo inventado es peor que dejarlo donde estaba.
 */
export async function guardarCorte(
  cron: string,
  siguiente: number,
  ids: readonly string[],
): Promise<void> {
  if (siguiente >= ids.length) {
    await guardarUltimo(cron, null); // vuelta completa
    return;
  }
  if (siguiente <= 0) return; // no se procesó nada: dejar el cursor como estaba
  await guardarUltimo(cron, ids[siguiente - 1]);
}
