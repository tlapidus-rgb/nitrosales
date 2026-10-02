// ══════════════════════════════════════════════════════════════════════════
// src/lib/oauth-state.ts — el `state` de los OAuth de Meta y Google Ads
// ══════════════════════════════════════════════════════════════════════════
// El `state` es `orgId.firma.nonce.returnTo`, y el callback guarda los tokens
// en la conexión de ESA organización. Había cuatro agujeros:
//
//   1. El inicio (`/api/oauth/meta/start`, `/api/auth/google-ads`) aceptaba
//      `?orgId=` sin sesión y firmaba el `state` del lado del servidor: cualquiera
//      podía arrancar el flujo para la organización de otro, autorizar con SU
//      cuenta de Meta/Google, y el callback pisaba la conexión del cliente.
//   2. La firma es un HMAC con NEXTAUTH_SECRET (y con "fallback-secret" si faltaba).
//      Ese secreto está filtrado: quien lo tiene arma un `state` válido para
//      cualquier organización sin pasar por el inicio.
//   3. El `state` era siempre el mismo para cada organización: un atacante podía
//      sacar un `code` de SU cuenta y mandarle a un usuario logueado de la
//      víctima el link al callback con el `state` de esa org (CSRF de
//      vinculación). La conexión quedaba con el token del atacante.
//   4. `returnTo` sale del `state` y terminaba en un redirect: con un `state`
//      armado, a cualquier dominio.
//
// Ahora: el inicio exige sesión y setea un nonce aleatorio en una cookie
// httpOnly del navegador que arrancó el flujo; el nonce va dentro del `state`
// firmado y el callback exige (a) el mismo nonce en la cookie y (b) que la
// SESIÓN del navegador sea de la organización del `state`. Un link armado por
// otro no trae la cookie del navegador de la víctima. La firma se mantiene (sin
// repuesto, en tiempo constante) porque ata el `state` a este servidor.
//
// Las páginas de error de los callbacks mostraban `error` / `error_description`
// de la URL sin escapar: con un link armado, JavaScript en nuestro dominio
// (y con eso, la sesión de quien lo abriera). Todo texto que se muestra pasa
// por `escaparHtml`.
// ══════════════════════════════════════════════════════════════════════════

import { createHmac, randomBytes } from "crypto";
import { esOrgIdValido } from "@/lib/org-id-seguro";
import { igualSeguro } from "@/lib/comparacion-segura";

const DESTINO_POR_DEFECTO = "/settings/integraciones";
const NONCE = /^[0-9a-f]{32}$/;

/** Una cookie por proveedor: arrancar el de Google no invalida el de Meta en curso. */
export const COOKIE_NONCE = { meta: "nitro-oauth-meta", google: "nitro-oauth-google" } as const;

/** Vive lo que dura un consentimiento; sólo la ven las rutas de la API. */
export const OPCIONES_COOKIE_NONCE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api",
  maxAge: 10 * 60,
};

function firma(orgId: string, nonce: string): string | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${orgId}:${nonce}`).digest("hex").slice(0, 16);
}

export function nuevoNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Sólo un camino de esta app: empieza con "/" y no con "//" ni "/\" (que el
 * navegador interpreta como otro dominio), sin caracteres de control (un tab o
 * un salto de línea que el navegador descarta convierten "/\t/evil" en
 * "//evil"), y nunca una ruta de la API (por ejemplo el propio callback, que
 * llega como Referer al reintentar). Cualquier otra cosa → el destino por
 * defecto.
 */
export function destinoSeguro(returnTo: string | null | undefined, porDefecto = DESTINO_POR_DEFECTO): string {
  if (typeof returnTo !== "string") return porDefecto;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.startsWith("/\\")) return porDefecto;
  if (/[\u0000-\u001f\u007f]/.test(returnTo)) return porDefecto;
  if (returnTo === "/api" || returnTo.startsWith("/api/") || returnTo.startsWith("/api?")) return porDefecto;
  return returnTo;
}

export function armarState(orgId: string, nonce: string, returnTo: string | null | undefined): string | null {
  if (!esOrgIdValido(orgId) || !NONCE.test(nonce)) return null;
  const f = firma(orgId, nonce);
  if (!f) return null;
  return `${orgId}.${f}.${nonce}.${encodeURIComponent(destinoSeguro(returnTo))}`;
}

/**
 * El `state` del callback, o null si no tiene forma válida, la firma no
 * coincide o el nonce no es el de la cookie de este navegador.
 */
export function leerState(
  state: string,
  nonceDeLaCookie: string | null,
  porDefecto = DESTINO_POR_DEFECTO,
): { orgId: string; returnTo: string } | null {
  const [orgId, recibida, nonce, ...resto] = state.split(".");
  if (!orgId || !recibida || !nonce || !esOrgIdValido(orgId) || !NONCE.test(nonce)) return null;
  if (!nonceDeLaCookie || !igualSeguro(nonce, nonceDeLaCookie)) return null;
  const esperada = firma(orgId, nonce);
  if (!esperada || !igualSeguro(recibida, esperada)) return null;
  let returnTo: string;
  try {
    returnTo = decodeURIComponent(resto.join("."));
  } catch {
    return null;
  }
  return { orgId, returnTo: destinoSeguro(returnTo || null, porDefecto) };
}

/** El valor de una cookie del request (sirve con Request y con NextRequest). */
export function leerCookie(req: Request, nombre: string): string | null {
  for (const parte of (req.headers.get("cookie") || "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim() || null;
  }
  return null;
}

/** True si la sesión del navegador es de esa organización. */
export function sesionDeLaOrg(session: any, orgId: string): boolean {
  const deLaSesion = session?.user?.organizationId;
  return typeof deLaSesion === "string" && deLaSesion.length > 0 && deLaSesion === orgId;
}

export { escaparHtml } from "@/lib/escapar-html";
