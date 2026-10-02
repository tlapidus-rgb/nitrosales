// ══════════════════════════════════════════════════════════════════════════
// src/lib/oauth-state.ts — el `state` de los OAuth de Meta y Google Ads
// ══════════════════════════════════════════════════════════════════════════
// El `state` es `orgId.firma.returnTo`, y el callback guarda los tokens en la
// conexión de ESA organización. Había tres agujeros:
//
//   1. El inicio (`/api/oauth/meta/start`, `/api/auth/google-ads`) aceptaba
//      `?orgId=` sin sesión y firmaba el `state` del lado del servidor: cualquiera
//      podía arrancar el flujo para la organización de otro, autorizar con SU
//      cuenta de Meta/Google, y el callback pisaba la conexión del cliente.
//   2. La firma es un HMAC con NEXTAUTH_SECRET (y con "fallback-secret" si faltaba).
//      Ese secreto está filtrado: quien lo tiene arma un `state` válido para
//      cualquier organización sin pasar por el inicio.
//   3. `returnTo` sale del `state` y terminaba en un redirect: con un `state`
//      armado, a cualquier dominio.
//
// Por eso la firma ya no es la barrera: el callback exige que la SESIÓN del
// navegador sea de la organización del `state` (ver `sesionDeLaOrg`). La firma
// se mantiene (sin fallback, comparación en tiempo constante) porque sigue
// atando el `state` a este servidor si algún día se rota el secreto.
//
// Las páginas de error de los callbacks mostraban `error` / `error_description`
// de la URL sin escapar: con un link armado, JavaScript en nuestro dominio
// (y con eso, la sesión de quien lo abriera). Todo texto que se muestra pasa
// por `escaparHtml`.
// ══════════════════════════════════════════════════════════════════════════

import { createHmac } from "crypto";
import { esOrgIdValido } from "@/lib/org-id-seguro";
import { igualSeguro } from "@/lib/comparacion-segura";

const DESTINO_POR_DEFECTO = "/settings/integraciones";

function firma(orgId: string): string | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(orgId).digest("hex").slice(0, 16);
}

/**
 * Sólo un camino de esta app: empieza con "/" y no con "//" ni "/\" (que el
 * navegador interpreta como otro dominio). Cualquier otra cosa → el destino
 * por defecto.
 */
export function destinoSeguro(returnTo: string | null | undefined, porDefecto = DESTINO_POR_DEFECTO): string {
  if (typeof returnTo !== "string") return porDefecto;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.startsWith("/\\")) return porDefecto;
  if (/[\u0000-\u001f]/.test(returnTo)) return porDefecto;
  return returnTo;
}

export function armarState(orgId: string, returnTo: string | null | undefined): string | null {
  if (!esOrgIdValido(orgId)) return null;
  const f = firma(orgId);
  if (!f) return null;
  return `${orgId}.${f}.${encodeURIComponent(destinoSeguro(returnTo))}`;
}

/** El `state` del callback, o null si no tiene forma válida o la firma no coincide. */
export function leerState(state: string, porDefecto = DESTINO_POR_DEFECTO): { orgId: string; returnTo: string } | null {
  const [orgId, recibida, ...resto] = state.split(".");
  if (!orgId || !recibida || !esOrgIdValido(orgId)) return null;
  const esperada = firma(orgId);
  if (!esperada || !igualSeguro(recibida, esperada)) return null;
  let returnTo: string;
  try {
    returnTo = decodeURIComponent(resto.join("."));
  } catch {
    return null;
  }
  return { orgId, returnTo: destinoSeguro(returnTo || null, porDefecto) };
}

/** True si la sesión del navegador es de esa organización. */
export function sesionDeLaOrg(session: any, orgId: string): boolean {
  const deLaSesion = session?.user?.organizationId;
  return typeof deLaSesion === "string" && deLaSesion.length > 0 && deLaSesion === orgId;
}

export function escaparHtml(texto: unknown): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
