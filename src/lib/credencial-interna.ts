// ══════════════════════════════════════════════════════════════════════════
// src/lib/credencial-interna.ts — una credencial para llamadas entre rutas
// ══════════════════════════════════════════════════════════════════════════
// El cron warm-cache llama a las rutas de métricas "como" cada organización,
// sin sesión. Lo hacía con `?orgId=X&key=<ADMIN_API_KEY>`, y esa clave está
// filtrada (está en vercel.json, en un repo público): cualquiera leía las
// métricas de cualquier organización, con orgIds que también figuran en los
// docs del repo.
//
// Esta credencial no está escrita en ningún lado: se DERIVA en el servidor, con
// un HMAC sobre DATABASE_URL (un secreto que tiene que existir para que la app
// funcione y que no está filtrado). La calcula el que llama y la verifica la
// ruta; nunca viaja en la URL (no queda en logs), va en un header.
//
// Si DATABASE_URL cambia (rotación de la password de Neon), la credencial cambia
// sola en los dos lados. Si falta, no hay credencial y nada entra (fail-closed).
// Cada propósito tiene la suya: la del warm-cache no sirve para otra cosa.
// ══════════════════════════════════════════════════════════════════════════

import { createHmac } from "crypto";
import { igualSeguro } from "@/lib/comparacion-segura";

export const HEADER_CREDENCIAL_INTERNA = "x-nitro-interno";

export function credencialInterna(proposito: string): string | null {
  const base = process.env.DATABASE_URL;
  if (!base || !proposito) return null;
  return createHmac("sha256", base).update(`nitrosales-interno:${proposito}`).digest("hex");
}

/** True si el request trae la credencial interna de ese propósito. */
export function traeCredencialInterna(req: Request, proposito: string): boolean {
  const esperada = credencialInterna(proposito);
  const recibida = req.headers.get(HEADER_CREDENCIAL_INTERNA);
  return !!esperada && typeof recibida === "string" && recibida.length > 0 && igualSeguro(recibida, esperada);
}
