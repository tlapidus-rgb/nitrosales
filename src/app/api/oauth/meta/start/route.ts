// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/oauth/meta/start?orgId=X
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
// State parameter: enviamos orgId firmado para evitar CSRF y poder
// asociar el callback con la org correcta.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v21.0";

function signState(payload: string): string {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("hex").slice(0, 16);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId") || "";
  const returnTo = url.searchParams.get("returnTo") || "/onboarding";

  if (!orgId) {
    return NextResponse.json({ error: "orgId requerido" }, { status: 400 });
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

  // State firmado: orgId + signature para validar en callback.
  // Format: orgId.sig
  const sig = signState(orgId);
  const state = `${orgId}.${sig}.${encodeURIComponent(returnTo)}`;

  // Build Meta OAuth URL.
  const authUrl = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "ads_read,ads_management,business_management");

  return NextResponse.redirect(authUrl.toString());
}
