// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/oauth/meta/start  (con sesión; la org sale de la sesión)
// ══════════════════════════════════════════════════════════════
// Inicia el flow OAuth de Meta Marketing API.
// Redirige al usuario al login oficial de Facebook con los scopes
// necesarios. Despues del consent, Meta redirige a /api/oauth/meta/callback
// con un `code` que ese endpoint cambia por un access_token long-lived
// (60 dias).
//
// Scopes pedidos:
//   - ads_read: leer campañas, insights, etc.
//   - ads_management: crear/modificar audiences, eventos CAPI.
//   - business_management: acceder a Business Manager (asignar Ad Accounts).
//
// ⚠️ Estos 3 scopes requieren App Review aprobado de Meta para que clientes
// no-developer puedan conectarse. Mientras esperamos review, el cliente
// debe estar agregado como "App Tester" en developers.facebook.com.
//
// State parameter: orgId firmado + returnTo (src/lib/oauth-state.ts). El
// callback además exige que la sesión sea de esa org: la firma sola no alcanza.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { armarState, COOKIE_NONCE, nuevoNonce, OPCIONES_COOKIE_NONCE } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v21.0";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Default returnTo: /settings/integraciones (donde se conecta Meta normalmente).
  // Si el cliente esta en onboarding, pasa explicitamente ?returnTo=/onboarding.
  // Tambien soportamos returnTo desde el referrer cuando no se pasa explicito.
  const referrerPath = (() => {
    try {
      const ref = req.headers.get("referer");
      if (!ref) return null;
      const refUrl = new URL(ref);
      return refUrl.pathname + (refUrl.search || "");
    } catch {
      return null;
    }
  })();
  const returnTo = url.searchParams.get("returnTo") || referrerPath || "/settings/integraciones";

  // La organización sale SÓLO de la sesión: antes se aceptaba ?orgId= sin
  // sesión ("link directo") y cualquiera arrancaba el flujo para otra org.
  let orgId = "";
  try {
    const session = await getServerSession(authOptions as any);
    orgId = (session as any)?.user?.organizationId || "";
  } catch (err) {
    console.error("[oauth/meta/start] no se pudo leer la sesión:", err);
  }
  if (!orgId) {
    return NextResponse.json({ error: "Iniciá sesión para conectar Meta" }, { status: 401 });
  }

  const appId = (process.env.META_APP_ID || "").trim();
  if (!appId) {
    return NextResponse.json(
      { error: "META_APP_ID no configurado en server. Avisar a admin." },
      { status: 500 },
    );
  }

  // Construir Redirect URI a partir del host actual (soporta tanto
  // app.nitrosales.ai como nitrosales.vercel.app).
  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/oauth/meta/callback`;

  // State: orgId.firma.nonce.returnTo. El nonce queda en una cookie httpOnly de
  // ESTE navegador; el callback exige la misma cookie y la sesión de esta org.
  const nonce = nuevoNonce();
  const state = armarState(orgId, nonce, returnTo);
  if (!state) {
    return NextResponse.json({ error: "No se pudo iniciar la conexión con Meta" }, { status: 500 });
  }

  // Build Meta OAuth URL.
  const authUrl = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "ads_read,ads_management,business_management");

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set(COOKIE_NONCE.meta, nonce, OPCIONES_COOKIE_NONCE);
  return res;
}
