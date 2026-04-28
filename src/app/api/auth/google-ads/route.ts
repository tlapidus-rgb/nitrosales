// @ts-nocheck
import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

function signState(payload: string): string {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("hex").slice(0, 16);
}

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

  // S58 OAuth: resolver orgId desde sesion NextAuth (igual que Meta).
  let orgId = url.searchParams.get("orgId") || "";
  try {
    const session = await getServerSession(authOptions as any);
    const sessionOrgId = (session as any)?.user?.organizationId;
    if (sessionOrgId) orgId = sessionOrgId;
  } catch {}

  if (!orgId) {
    return NextResponse.json({ error: "orgId requerido (loguearse o pasar ?orgId=)" }, { status: 400 });
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/auth/google-ads/callback`;

  // State firmado: orgId.signature.returnTo (igual que Meta).
  const sig = signState(orgId);
  const state = `${orgId}.${sig}.${encodeURIComponent(returnTo)}`;

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
