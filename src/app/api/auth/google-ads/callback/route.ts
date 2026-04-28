// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/auth/google-ads/callback
// ══════════════════════════════════════════════════════════════
// S58 OAuth update: en vez de mostrar el token en HTML para que Tomy
// lo copie a Vercel env vars, ahora se guarda directo en la Connection
// de la org del cliente (mismo patron que Meta OAuth).
//
// Flow: verifica state → intercambia code → persiste en DB → redirige.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

function verifyState(payload: string, signature: string): boolean {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const expected = hmac.digest("hex").slice(0, 16);
  return expected === signature;
}

function errorPage(title: string, message: string, retryUrl?: string): NextResponse {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>NitroSales — Error Google OAuth</title>
<style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:40px 20px;}
.card{max-width:560px;margin:60px auto;background:#1a1a1a;border-radius:16px;padding:32px;border:1px solid #2a2a2a;}
h1{color:#ef4444;margin-top:0;}
a{display:inline-block;margin:8px 8px 0 0;padding:10px 20px;background:#3b82f6;color:white;text-decoration:none;border-radius:8px;}
</style></head><body>
<div class="card"><h1>${title}</h1><p>${message}</p>${retryUrl ? `<a href="${retryUrl}">Reintentar</a>` : ""}<a href="/onboarding">Volver al onboarding</a></div>
</body></html>`;
  return new NextResponse(html, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error") || "";

  if (error) {
    return errorPage("OAuth Error", `Google nos avisó: <code>${error}</code>. Si fue por error, reintentá.`);
  }
  if (!code) {
    return errorPage("Falta authorization code", "Google no devolvió el code. Reintentá.");
  }
  if (!state) {
    return errorPage("Falta state", "Reintentá desde el wizard.");
  }

  const parts = state.split(".");
  if (parts.length < 2) {
    return errorPage("State malformado", "El state no tiene formato esperado.");
  }
  const [orgId, signature, ...returnToParts] = parts;
  const returnTo = decodeURIComponent(returnToParts.join(".") || "/onboarding");

  if (!verifyState(orgId, signature)) {
    return errorPage("State inválido (CSRF)", "Firma del state no coincide. Posible link viejo.");
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/auth/google-ads/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_ADS_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData?.refresh_token) {
      const msg = tokenData?.error_description || tokenData?.error || `HTTP ${tokenRes.status}`;
      return errorPage(
        "Falló intercambio del código",
        `Google rechazó: ${msg}.`,
        `/api/auth/google-ads?orgId=${orgId}`,
      );
    }

    const refreshToken = tokenData.refresh_token;
    const accessToken = tokenData.access_token || "";

    const existing = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "GOOGLE_ADS" as any },
    });

    const credentials = {
      ...((existing?.credentials as any) || {}),
      refreshToken,
      accessToken,
      tokenObtainedAt: new Date().toISOString(),
    };

    if (existing) {
      await prisma.connection.update({
        where: { id: existing.id },
        data: { credentials, status: "ACTIVE" as any, lastSyncError: null },
      });
    } else {
      await prisma.connection.create({
        data: {
          organizationId: orgId,
          platform: "GOOGLE_ADS" as any,
          status: "ACTIVE" as any,
          credentials,
        },
      });
    }

    const successUrl = new URL(returnTo, baseUrl);
    successUrl.searchParams.set("googleConnected", "1");
    return NextResponse.redirect(successUrl.toString());
  } catch (err: any) {
    console.error("[google-ads/callback] error:", err);
    return errorPage("Error inesperado", `${err?.message || "Unknown"}. Reintentá.`, `/api/auth/google-ads?orgId=${orgId}`);
  }
}
