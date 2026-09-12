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
// ⚠️ Y NO ALCANZA SOLO: el webhook de órdenes de VTEX compara contra
// `NEXTAUTH_SECRET` con su propio `!==`, y ese archivo está marcado como CORE
// PROTECTED en `docs/HANDOFF.md`. Darle el mismo trato necesita autorización
// explícita — está anotado en el plan.
// ──────────────────────────────────────────────────────────────
import crypto from "crypto";

export const ADMIN_API_KEY: string =
  process.env.ADMIN_API_KEY || crypto.randomBytes(32).toString("hex");

/**
 * La clave anterior, válida durante la ventana de rotación. `null` fuera de esa
 * ventana, que es lo normal.
 */
const CLAVE_ANTERIOR: string | null = process.env.ADMIN_API_KEY_ANTERIOR || null;

/**
 * Comparación de tiempo constante.
 *
 * Se hashean los dos lados antes de comparar: `timingSafeEqual` exige buffers
 * del mismo largo, y compararlos crudos filtraría el largo del secreto. Con el
 * hash los dos son siempre de 32 bytes.
 *
 * El `===` que había antes cortaba en el primer byte distinto. Para un secreto
 * que se puede probar desde internet contra 29 endpoints, eso es una diferencia
 * medible.
 */
function igualSeguro(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Validación fail-closed de la key de bypass admin/cron.
 *
 * True si `key` es no-vacía y coincide con la clave actual **o** con la anterior
 * mientras haya una ventana de rotación abierta.
 */
export function isValidAdminKey(key: string | null | undefined): boolean {
  if (typeof key !== "string" || key.length === 0) return false;
  if (igualSeguro(key, ADMIN_API_KEY)) return true;
  if (CLAVE_ANTERIOR && igualSeguro(key, CLAVE_ANTERIOR)) return true;
  return false;
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
