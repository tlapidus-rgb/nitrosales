// ══════════════════════════════════════════════════════════════════════════
// src/lib/alertas/destinatarios.ts — a quién le avisamos
// ══════════════════════════════════════════════════════════════════════════
// E-19.3. Todas las alertas operativas iban a **una sola casilla**, con el
// literal escrito a mano en seis archivos distintos:
//
//     cron/control-alerts · cron/refresh-pixel-rollups · cron/warm-cache
//     me/google-auth-request · me/meta-auth-request · me/onboarding/submit-wizard
//
// Dos problemas. El obvio: cambiar el destinatario es tocar seis archivos y
// acordarse de los seis. El que importa: **si esa casilla manda los mails a
// spam, el sistema pierde su único sentido de la vista.** Hay problemas de
// entregabilidad documentados, y el modo de falla no es "llegan tarde" sino "no
// llega ninguna y nadie sabe que dejaron de llegar".
//
// ── COMPATIBLE HACIA ATRÁS A PROPÓSITO ───────────────────────────────────
// Sin ninguna variable seteada, esto devuelve exactamente la casilla de antes.
// El cambio no altera el comportamiento hasta que alguien configure
// `ALERTAS_EMAILS`; y ahí, agregar un segundo destinatario es una variable de
// entorno, no un deploy.
// ══════════════════════════════════════════════════════════════════════════

/**
 * La casilla histórica. Se mantiene como último recurso: que una alerta no
 * llegue por una variable mal escrita sería peor que el problema original.
 */
const CASILLA_POR_DEFECTO = "tlapidus@99media.com.ar";

const PARECE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * A quién van las alertas operativas.
 *
 * Orden: `ALERTAS_EMAILS` (separadas por coma) → `ADMIN_EMAIL` → la casilla
 * por defecto. Nunca devuelve una lista vacía.
 */
export function destinatariosDeAlertas(env: NodeJS.ProcessEnv = process.env): string[] {
  const crudo = env.ALERTAS_EMAILS || env.ADMIN_EMAIL || "";
  const parseadas = crudo
    .split(",")
    .map((e) => e.trim())
    .filter((e) => PARECE_EMAIL.test(e));

  // Sin nada válido configurado, la casilla de siempre. Una variable con un
  // typo no puede dejar al sistema sin avisar a nadie.
  return parseadas.length > 0 ? Array.from(new Set(parseadas)) : [CASILLA_POR_DEFECTO];
}

/**
 * Lo mismo, listo para el campo `to` de un envío.
 *
 * Se devuelve un array y no un string separado por comas: el proveedor los
 * trata como destinatarios distintos, y así una casilla rebotada no se lleva
 * puesto el envío a las demás.
 */
export function paraElCampoTo(env: NodeJS.ProcessEnv = process.env): string[] {
  return destinatariosDeAlertas(env);
}
