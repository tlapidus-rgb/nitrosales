// ══════════════════════════════════════════════════════════════════════════
// self-fetch.ts — A qué dominio le pega la app cuando se llama a sí misma
// ══════════════════════════════════════════════════════════════════════════
// ⚠️ POR QUÉ EXISTE ESTO (bug encontrado el 2026-09-06, probando en preview):
//
//   Varias rutas hacen `fetch` contra otra ruta de la misma app (los crons que
//   encadenan pasos, el runner de backfill, el trigger de sync on-demand). Todas
//   armaban la URL base así:
//
//       const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
//
//   `NEXTAUTH_URL` está configurada en Vercel para **All Environments** con el
//   valor de PRODUCCIÓN. Y el fallback también es producción. Resultado: un
//   deployment de PREVIEW que ejecuta cualquiera de esas rutas **le pega a
//   producción y escribe en la base de producción** — aunque la integración de
//   Neon le haya creado al preview su propia base.
//
//   No es teórico: probando la branch `fix/expansion-gate-e0` en su preview, el
//   paso `reconcile` de `sync/chain` corrió CONTRA PRODUCCIÓN y desactivó 12
//   productos y repuntó 730 order items ahí. Es la misma operación que el cron
//   de producción hace cada 2 horas, así que no hubo daño — pero podría haber
//   sido un backfill.
//
//   Consecuencia para el equipo: **probar en preview NO era seguro** para ningún
//   camino que se auto-invoque. Este helper es lo que lo vuelve seguro.
//
// LA REGLA:
//   · producción → `NEXTAUTH_URL` (necesario: cuando dispara Vercel Cron, el
//     origin del request es la URL del deployment, que está detrás de Deployment
//     Protection y devuelve 401 — ver R-C14 / BP-ROLLUP-CRON).
//   · preview y local → el propio origin del deployment, NUNCA producción. El
//     header de `selfFetchHeaders()` es lo que atraviesa su propia protección.
// ══════════════════════════════════════════════════════════════════════════

const PROD_FALLBACK = "https://app.nitrosales.ai";

/**
 * URL base para que la app se llame a sí misma.
 *
 * @param origin El `req.nextUrl.origin` del request en curso, si hay uno. Sin
 *               esto se cae a `VERCEL_BRANCH_URL`/`VERCEL_URL`, que en preview
 *               siguen apuntando al propio deployment.
 */
export function selfFetchBaseUrl(origin?: string | null): string {
  if (process.env.VERCEL_ENV === "production") {
    return process.env.NEXTAUTH_URL || origin || PROD_FALLBACK;
  }

  // Preview / development: jamás salir al dominio de producción.
  if (origin) return origin;

  const propio = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (propio) return `https://${propio}`;

  // Sin señales de Vercel estamos en local.
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

/**
 * Headers para atravesar la Deployment Protection del propio deployment.
 * Sin el secreto configurado no manda nada (en local no hace falta).
 */
export function selfFetchHeaders(): Record<string, string> | undefined {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret } : undefined;
}
