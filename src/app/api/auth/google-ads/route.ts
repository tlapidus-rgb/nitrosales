// @ts-nocheck
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { armarState } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_ADS_CLIENT_ID not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const referrerPath = (() => {
    try {
      const ref = req.headers.get("referer");
      if (!ref) return null;
      const refUrl = new URL(ref);
      return refUrl.pathname + (refUrl.search || "");
    } catch { return null; }
  })();
  const returnTo = url.searchParams.get("returnTo") || referrerPath || "/settings/integraciones";

  // La organización sale SÓLO de la sesión (ver src/lib/oauth-state.ts): antes
  // se aceptaba ?orgId= sin sesión y cualquiera arrancaba el flujo para otra org.
  let orgId = "";
  try {
    const session = await getServerSession(authOptions as any);
    orgId = (session as any)?.user?.organizationId || "";
  } catch (err) {
    console.error("[google-ads] no se pudo leer la sesión:", err);
  }
  if (!orgId) {
    return NextResponse.json({ error: "Iniciá sesión para conectar Google Ads" }, { status: 401 });
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/auth/google-ads/callback`;

  // State: orgId.firma.returnTo. El callback además exige sesión de esta org.
  const state = armarState(orgId, returnTo);
  if (!state) {
    return NextResponse.json({ error: "No se pudo iniciar la conexión con Google Ads" }, { status: 500 });
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
