// ══════════════════════════════════════════════════════════════════════════
// src/lib/webhook-key.ts — la clave que VTEX manda en la URL del webhook
// ══════════════════════════════════════════════════════════════════════════
// El webhook de órdenes de VTEX se autentica con `?key=<NEXTAUTH_SECRET>`. No
// es la clave de admin/cron (`ADMIN_API_KEY`): es un segundo secreto, con su
// propia ventana de rotación, y por eso vive en su propio módulo.
//
// ── POR QUÉ IMPORTA ROTAR ESTE SIN CORTAR NADA ───────────────────────────
// La URL con la clave adentro está guardada **del lado de VTEX**, en la
// config del Orders Broadcaster de cada cliente (`POST /api/orders/hook/config`,
// que es API-only: no hay UI donde mirarla). O sea que rotar `NEXTAUTH_SECRET`
// de un saque es peor que en el caso de los crons:
//
//   · la URL vieja hay que actualizarla **en cada cuenta VTEX**, una por una,
//     con las credenciales de cada cliente;
//   · mientras tanto el webhook devuelve 401 y **VTEX no reintenta**: las
//     órdenes de esa ventana no entran nunca por esta vía;
//   · el cron diario de las 3am las levanta después, así que no se pierden —
//     pero dejan de ser tiempo real y nadie se entera hasta el día siguiente.
//
// Con `NEXTAUTH_SECRET_ANTERIOR` la rotación pasa a ser por etapas:
//
//   1. `NEXTAUTH_SECRET_ANTERIOR` = el valor viejo · `NEXTAUTH_SECRET` = el
//      nuevo. **Las dos funcionan.** Nada se corta.
//   2. Se actualizan los hooks de cada cuenta VTEX, con calma, verificando uno
//      por uno con `verificarOrdersBroadcaster`.
//   3. Se borra `NEXTAUTH_SECRET_ANTERIOR`. Recién ahí la vieja deja de servir.
//
// ⚠️ ESTO NO ROTA NADA. Con sólo `NEXTAUTH_SECRET` seteada el comportamiento es
// **idéntico** al de antes.
//
// ⚠️ Y OJO CON ESTE SECRETO EN PARTICULAR: `NEXTAUTH_SECRET` es además la clave
// con la que NextAuth firma los JWT de sesión. Rotarlo desloguea a todos los
// usuarios. Esta ventana cubre el webhook, NO las sesiones — NextAuth lee la
// env por su cuenta.
//
// ⚠️ ALCANCE: hay ~50 endpoints más que comparan contra `NEXTAUTH_SECRET` con
// `!==` (todo `/api/sync/*`, los `migrate-*`, el webhook de inventory). Esos
// siguen igual: durante la ventana aceptan sólo la clave nueva. Están anotados
// en el plan; darles el mismo trato es un cambio aparte.
// ══════════════════════════════════════════════════════════════════════════

import { coincideConAlguna } from "./comparacion-segura";

/**
 * Validación fail-closed de la clave del webhook.
 *
 * True si `key` es no-vacía y coincide con `NEXTAUTH_SECRET` **o** con
 * `NEXTAUTH_SECRET_ANTERIOR` mientras haya una ventana de rotación abierta.
 *
 * Lee el entorno en cada llamada a propósito: este módulo lo importa una ruta
 * de Next que puede quedar viva entre deploys, y una env leída al importar se
 * congelaría con el valor de ese momento.
 */
export function esClaveDeWebhookValida(key: string | null | undefined): boolean {
  return coincideConAlguna(key, process.env.NEXTAUTH_SECRET ?? "", process.env.NEXTAUTH_SECRET_ANTERIOR);
}

/**
 * `true` si hay una ventana de rotación abierta para la clave del webhook.
 *
 * Existe para que el checklist lo pueda preguntar: **una ventana que queda
 * abierta para siempre es una rotación que no terminó**, y no hay ningún
 * síntoma que lo delate — todo sigue funcionando igual.
 */
export function hayVentanaDeRotacionDeWebhookAbierta(): boolean {
  const anterior = process.env.NEXTAUTH_SECRET_ANTERIOR;
  return typeof anterior === "string" && anterior.length > 0;
}
