// ──────────────────────────────────────────────────────────────
// src/lib/admin-key.ts — Clave de bypass admin/cron (BP-M1, 2026-06-11)
// ──────────────────────────────────────────────────────────────
// Antes esta key estaba HARDCODEADA como string literal en ~89 archivos
// (endpoints admin, crons, sync). Ahora se lee de la env `ADMIN_API_KEY`.
//
// Si la env NO está seteada, se cae a un valor ALEATORIO por proceso
// (fail-closed): ninguna request entrante puede matchearlo, así que el
// bypass admin/cron queda deshabilitado — en vez de aceptar una key vacía
// (que sería un bypass total). NO queda ningún literal del secreto en el código.
//
// ⚠️ PREREQUISITO DE DEPLOY A PROD: setear `ADMIN_API_KEY` en el entorno
// (Vercel) ANTES de mergear a main, idealmente con un valor ROTADO (distinto
// al histórico). Si no se setea, los crons/endpoints admin dejan de
// autenticarse (fallan cerrado). En local/branch va en `.env`.
//
// ══════════════════════════════════════════════════════════════════════════
// ROTAR SIN CORTAR NADA (agregado el 2026-09-12)
// ══════════════════════════════════════════════════════════════════════════
// La rotación de secretos lleva semanas trabada, y el motivo es real: hoy
// rotar es un **corte de raíz**. La clave viaja en la URL de los 29 crons de
// `vercel.json` y en la del webhook de órdenes de VTEX, así que cambiar el valor
// en Vercel deja a todo eso devolviendo 403 hasta que se actualicen las URLs —
// y un cron que devuelve 403 **no alerta a nadie**.
//
// Con `ADMIN_API_KEY_ANTERIOR` deja de serlo. La rotación pasa a ser por etapas
// y cada una es reversible:
//
//   1. `ADMIN_API_KEY_ANTERIOR` = el valor viejo · `ADMIN_API_KEY` = el nuevo.
//      **Las dos funcionan.** Nada se corta, nada cambia para el que llama.
//   2. Se actualizan las URLs de `vercel.json` y la del webhook de VTEX, con
//      calma, verificando una por una.
//   3. Se borra `ADMIN_API_KEY_ANTERIOR`. Recién ahí la vieja deja de servir.
//
// Si algo sale mal en el paso 2, se vuelve atrás sin apuro: la clave vieja
// sigue andando.
//
// ⚠️ ESTO NO ROTA NADA. Con sólo `ADMIN_API_KEY` seteada el comportamiento es
// **idéntico** al de antes. Lo único que cambia es que el sistema queda
// preparado para tolerar una rotación.
//
// ⚠️ Y NO ALCANZA SOLO: el webhook de órdenes de VTEX se autentica con
// `NEXTAUTH_SECRET`, que es **otro secreto**, con su propia ventana. Tiene su
// módulo en `src/lib/webhook-key.ts` (agregado el 2026-09-12 con autorización
// explícita de Axel para tocar el archivo CORE PROTECTED). Los dos comparten la
// primitiva de comparación, no el secreto.
// ──────────────────────────────────────────────────────────────
import crypto from "crypto";
import { coincideConAlguna } from "./comparacion-segura";

export const ADMIN_API_KEY: string =
  process.env.ADMIN_API_KEY || crypto.randomBytes(32).toString("hex");

/**
 * La clave anterior, válida durante la ventana de rotación. `null` fuera de esa
 * ventana, que es lo normal.
 */
const CLAVE_ANTERIOR: string | null = process.env.ADMIN_API_KEY_ANTERIOR || null;

/**
 * Validación fail-closed de la key de bypass admin/cron.
 *
 * True si `key` es no-vacía y coincide con la clave actual **o** con la anterior
 * mientras haya una ventana de rotación abierta.
 *
 * La comparación es de tiempo constante y vive en `comparacion-segura.ts`: es
 * la misma que usa el webhook de VTEX, y una primitiva de seguridad duplicada
 * es una que en algún momento va a estar arreglada en un lado y rota en el otro.
 */
export function isValidAdminKey(key: string | null | undefined): boolean {
  return coincideConAlguna(key, ADMIN_API_KEY, CLAVE_ANTERIOR);
}

/**
 * `true` si hay una ventana de rotación abierta.
 *
 * Existe para que el checklist lo pueda preguntar: **una ventana que queda
 * abierta para siempre es una rotación que no terminó**, y la clave vieja sigue
 * sirviendo para entrar. Es el paso que más fácil se olvida, porque una vez que
 * todo funciona no hay ningún síntoma.
 */
export function hayVentanaDeRotacionAbierta(): boolean {
  return CLAVE_ANTERIOR !== null;
}
