// ══════════════════════════════════════════════════════════════════════════
// src/lib/org-id-seguro.ts — validar un organizationId que viene de afuera
// ══════════════════════════════════════════════════════════════════════════
// Encontrado en la revisión de seguridad del 2026-09-07.
//
// Los tres endpoints de métricas pesadas (`/api/metrics/orders`, `/pixel` y
// `/products`) aceptan `?orgId=<x>&key=<ADMIN_API_KEY>` para que el cron
// `warm-cache` pueda calentar la caché de cada organización sin sesión. Ese
// `orgId` entra CRUDO y, en `metrics/orders`, se interpola entre comillas
// simples dentro de un `$queryRawUnsafe` en 53 lugares distintos:
//
//     WHERE "organizationId" = '${ORG_ID}'
//
// O sea inyección SQL: un `orgId` que cierre la comilla alcanza la base entera,
// de todos los clientes.
//
// ── POR QUÉ SE VALIDA EN EL BORDE Y NO SE PARAMETRIZAN LAS 53 ─────────────
// `metrics/orders` es el archivo que `CLAUDE.md` § REGLA #3b señala como "una
// query lenta o que explota mata TODA la página". Reescribir 53 queries de un
// endpoint con ese historial, para arreglar un problema que se cierra entero
// validando una sola vez en la entrada, es cambiar un riesgo chico y acotado por
// uno grande y difuso. La validación de formato hace que no exista ningún valor
// capaz de escapar de la comilla: no hay superficie que parametrizar.
//
// Parametrizarlas sigue siendo lo correcto a futuro, pero como refactor propio,
// con su propia verificación, no colgado de un arreglo de seguridad.
//
// ── LO QUE ESTO *NO* ARREGLA ─────────────────────────────────────────────
// El bypass sigue existiendo: con el `ADMIN_API_KEY` se pueden pedir las
// métricas de cualquier organización (IDOR). No se cierra acá porque el cron
// `warm-cache` depende de ese mismo camino y romperlo dejaría la caché fría para
// todos. El arreglo de fondo es separar y rotar esa clave —hoy es además el
// mismo literal que `NEXTAUTH_SECRET`— y eso está en R-C07/08/09.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Los ids de organización son cuid de Prisma (`@default(cuid())`): empiezan con
 * `c` y siguen con base36 en minúscula. Se acepta un rango de largo holgado para
 * no atarse a cuid v1 vs v2, pero el juego de caracteres es estricto — que es lo
 * único que importa para que no pueda escapar de una comilla SQL.
 */
const FORMA_ORG_ID = /^[a-z0-9]{20,40}$/;

/** `true` si `v` puede ser un organizationId real. */
export function esOrgIdValido(v: unknown): v is string {
  return typeof v === "string" && FORMA_ORG_ID.test(v);
}

/**
 * El `?orgId=` de la querystring, sólo si tiene forma de id real.
 * Devuelve `null` para cualquier otra cosa — incluido el string vacío, un
 * intento de inyección, o un id con mayúsculas o guiones.
 */
export function orgIdDeLaQuery(v: string | null | undefined): string | null {
  return esOrgIdValido(v) ? v : null;
}
