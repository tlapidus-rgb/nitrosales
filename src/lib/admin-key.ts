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
// ──────────────────────────────────────────────────────────────
import crypto from "crypto";

export const ADMIN_API_KEY: string =
  process.env.ADMIN_API_KEY || crypto.randomBytes(32).toString("hex");

/**
 * Validación fail-closed de la key de bypass admin/cron.
 * True solo si `key` es no-vacía y coincide con `ADMIN_API_KEY`.
 */
export function isValidAdminKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.length > 0 && key === ADMIN_API_KEY;
}
