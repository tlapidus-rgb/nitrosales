// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/oauth/meta/callback?code=...&state=...
// ══════════════════════════════════════════════════════════════
// Callback de Meta OAuth. Flow:
//   1. Verifica state (CSRF guard) y extrae orgId.
//   2. Intercambia el `code` por short-lived access_token (~1-2 hs).
//   3. Lo cambia por long-lived access_token (60 dias) via
//      grant_type=fb_exchange_token.
//   4. Hace GET /me/adaccounts para listar las Ad Accounts disponibles.
//   5. Persiste en Connection (organizationId, platform=META_ADS) con:
//      - accessToken (long-lived)
//      - tokenExpiresAt (now + 60d)
//      - adAccounts (lista para que el cliente elija despues)
//   6. Redirige al usuario al wizard / settings con feedback.
//
// El cliente queda con el token guardado y NO necesita reconectar por
// 60 dias. Antes del dia 55, el cron meta-token-refresh lo renueva
// automaticamente.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v21.0";

function verifyState(payload: string, signature: string): boolean {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const expected = hmac.digest("hex").slice(0, 16);
  return expected === signature;
}

function errorPage(title: string, message: string, retryUrl?: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>NitroSales — Error conectando Meta</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 40px 20px; }
  .card { max-width: 560px; margin: 60px auto; background: #1a1a1a; border-radius: 16px; padding: 32px; border: 1px solid #2a2a2a; }
  h1 { color: #ef4444; margin-top: 0; font-size: 22px; }
  p { line-height: 1.6; color: #ccc; }
  pre { background: #000; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px; color: #f87171; white-space: pre-wrap; word-break: break-word; }
  a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; }
</style>
</head>
<body>
<div class="card">
  <h1>${title}</h1>
  <p>${message}</p>
  ${retryUrl ? `<a href="${retryUrl}">Reintentar</a>` : ""}
  <a href="/onboarding">Volver al onboarding</a>
</div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error") || "";
  const errorDescription = url.searchParams.get("error_description") || "";

  // Caso: usuario cancelo el consent.
  if (error) {
    return errorPage(
      "Cancelaste la conexión",
      `Meta nos avisó: <code>${error}</code>${errorDescription ? ` — ${errorDescription}` : ""}. Si fue un error, podés volver a intentar.`,
    );
  }

  if (!code) {
    return errorPage("Falta código de autorización", "Meta no devolvió el code. Reintentá.");
  }
  if (!state) {
    return errorPage("Falta state parameter", "Posible intento de CSRF. Reintentá desde el wizard.");
  }

  // Parse state: orgId.signature.returnTo
  const parts = state.split(".");
  if (parts.length < 2) {
    return errorPage("State malformado", "El parametro state no tiene el formato esperado.");
  }
  const [orgId, signature, ...returnToParts] = parts;
  const returnTo = decodeURIComponent(returnToParts.join(".") || "/onboarding");

  if (!verifyState(orgId, signature)) {
    return errorPage(
      "State inválido (CSRF guard)",
      "La firma del state no coincide. Posible intento de fraude o link viejo.",
    );
  }

  const appId = (process.env.META_APP_ID || "").trim();
  const appSecret = (process.env.META_APP_SECRET || "").trim();
  if (!appId || !appSecret) {
    return errorPage(
      "Server config incompleta",
      "Faltan env vars META_APP_ID y/o META_APP_SECRET. Avisar a admin.",
    );
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/oauth/meta/callback`;

  try {
    // 1. Intercambiar code por short-lived token.
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString(), {
      signal: AbortSignal.timeout(15000),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData?.error) {
      const msg = tokenData?.error?.message || `HTTP ${tokenRes.status}`;
      return errorPage(
        "Falló el intercambio del código",
        `Meta rechazó el code: ${msg}. Posibles causas: redirect_uri no coincide con la configurada en la App, o el code expiró.`,
        `/api/oauth/meta/start?orgId=${orgId}`,
      );
    }

    const shortLivedToken = tokenData.access_token;
    if (!shortLivedToken) {
      return errorPage("Token no recibido", "Meta devolvió 200 pero sin access_token.");
    }

    // 2. Cambiar short-lived por long-lived (60 dias).
    const exchangeUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    exchangeUrl.searchParams.set("grant_type", "fb_exchange_token");
    exchangeUrl.searchParams.set("client_id", appId);
    exchangeUrl.searchParams.set("client_secret", appSecret);
    exchangeUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const exchangeRes = await fetch(exchangeUrl.toString(), {
      signal: AbortSignal.timeout(15000),
    });
    const exchangeData = await exchangeRes.json();

    const longLivedToken = exchangeData?.access_token || shortLivedToken;
    const expiresIn = Number(exchangeData?.expires_in) || 60 * 24 * 3600; // 60 dias default
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // 3. Listar Ad Accounts disponibles para mostrar al cliente.
    let adAccounts: Array<{ id: string; name: string; account_status: number }> = [];
    try {
      const accountsRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${encodeURIComponent(longLivedToken)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const accountsData = await accountsRes.json();
      if (Array.isArray(accountsData?.data)) {
        adAccounts = accountsData.data;
      }
    } catch {
      // No bloquea — el cliente puede elegir Ad Account despues.
    }

    // 4. Persistir en Connection. Upsert por (organizationId, platform).
    const existing = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "META_ADS" as any },
    });

    const credentials = {
      accessToken: longLivedToken,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
      // Preservamos campos que el cliente cargo en el wizard (adAccountId,
      // pixelId, etc) si existian. NO sobrescribimos esos.
      ...((existing?.credentials as any) || {}),
      // Pero el accessToken nuevo SI gana al viejo.
      accessToken: longLivedToken,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
      // Lista de cuentas accesibles para que el cliente elija si no la tiene.
      availableAdAccounts: adAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.account_status,
      })),
    };

    if (existing) {
      await prisma.connection.update({
        where: { id: existing.id },
        data: {
          credentials,
          status: "ACTIVE" as any,
          lastSyncError: null,
        },
      });
    } else {
      await prisma.connection.create({
        data: {
          organizationId: orgId,
          platform: "META_ADS" as any,
          status: "ACTIVE" as any,
          credentials,
        },
      });
    }

    // 5. Redirigir al wizard con feedback de exito.
    const successUrl = new URL(returnTo, baseUrl);
    successUrl.searchParams.set("metaConnected", "1");
    successUrl.searchParams.set("metaAccounts", String(adAccounts.length));
    return NextResponse.redirect(successUrl.toString());
  } catch (err: any) {
    console.error("[oauth/meta/callback] error:", err);
    return errorPage(
      "Error inesperado",
      `${err?.message || "Unknown"}. Reintentá o avisá a soporte.`,
      `/api/oauth/meta/start?orgId=${orgId}`,
    );
  }
}
