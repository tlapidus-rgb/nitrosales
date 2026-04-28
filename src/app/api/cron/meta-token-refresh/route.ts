// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/meta-token-refresh
// ══════════════════════════════════════════════════════════════
// Renueva tokens de Meta Ads que están a menos de 7 dias de expirar.
// Long-lived tokens duran 60 dias. Para evitar que un cliente quede
// con conexion rota silenciosa, este cron corre 1x/dia y renueva
// los que ya entran en zona de riesgo.
//
// Trigger: Vercel cron (configurado en vercel.json) o disparo manual
// con ?key=...
//
// Para cada Connection activa de META_ADS:
//   - Si tokenExpiresAt < ahora + 7d → refrescar
//   - Refresh: GET /oauth/access_token?grant_type=fb_exchange_token con
//     el token actual como fb_exchange_token. Meta devuelve uno nuevo
//     con +60d de validez.
//   - Si refresh falla → marcar status=ERROR y notificar (TODO).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEY = "nitrosales-secret-key-2024-production";
const META_API_VERSION = "v21.0";
const REFRESH_THRESHOLD_DAYS = 7; // Renovar si quedan menos de 7 dias

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    // Cron Vercel pasa header x-vercel-cron-signature, key=KEY para manual,
    // o sesion admin.
    const isCron = req.headers.get("x-vercel-cron") === "1";
    const allowed = isCron || key === KEY || (await isInternalUser());
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const appId = (process.env.META_APP_ID || "").trim();
    const appSecret = (process.env.META_APP_SECRET || "").trim();
    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "META_APP_ID o META_APP_SECRET no configurados" },
        { status: 500 },
      );
    }

    const thresholdDate = new Date(Date.now() + REFRESH_THRESHOLD_DAYS * 24 * 3600 * 1000);

    // Connections META_ADS activas
    const connections = await prisma.connection.findMany({
      where: { platform: "META_ADS" as any, status: "ACTIVE" as any },
      select: { id: true, organizationId: true, credentials: true },
    });

    const results: any[] = [];

    for (const conn of connections) {
      const creds = (conn.credentials as any) || {};
      const currentToken = creds.accessToken;
      const expiresAtStr = creds.tokenExpiresAt;

      if (!currentToken) {
        results.push({ orgId: conn.organizationId, status: "skipped", reason: "no token" });
        continue;
      }

      // Si no tiene tokenExpiresAt (token cargado manualmente vieja-escuela),
      // skipeamos — no podemos saber cuando expira.
      if (!expiresAtStr) {
        results.push({
          orgId: conn.organizationId,
          status: "skipped",
          reason: "no expiresAt (token manual legacy)",
        });
        continue;
      }

      const expiresAt = new Date(expiresAtStr);
      if (expiresAt > thresholdDate) {
        results.push({
          orgId: conn.organizationId,
          status: "skipped",
          reason: "token aun valido",
          daysLeft: Math.floor((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000)),
        });
        continue;
      }

      // Refresh
      try {
        const refreshUrl = new URL(
          `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
        );
        refreshUrl.searchParams.set("grant_type", "fb_exchange_token");
        refreshUrl.searchParams.set("client_id", appId);
        refreshUrl.searchParams.set("client_secret", appSecret);
        refreshUrl.searchParams.set("fb_exchange_token", currentToken);

        const r = await fetch(refreshUrl.toString(), { signal: AbortSignal.timeout(15000) });
        const data = await r.json();

        if (!r.ok || data?.error || !data?.access_token) {
          const msg = data?.error?.message || `HTTP ${r.status}`;
          // Marcar como ERROR para que el cliente sepa.
          await prisma.connection.update({
            where: { id: conn.id },
            data: {
              status: "ERROR" as any,
              lastSyncError: `Meta token refresh failed: ${msg}`,
            },
          });
          results.push({
            orgId: conn.organizationId,
            status: "failed",
            error: msg,
          });
          continue;
        }

        const newToken = data.access_token;
        const newExpiresIn = Number(data.expires_in) || 60 * 24 * 3600;
        const newExpiresAt = new Date(Date.now() + newExpiresIn * 1000);

        await prisma.connection.update({
          where: { id: conn.id },
          data: {
            credentials: {
              ...creds,
              accessToken: newToken,
              tokenExpiresAt: newExpiresAt.toISOString(),
            },
            status: "ACTIVE" as any,
            lastSyncError: null,
          },
        });

        results.push({
          orgId: conn.organizationId,
          status: "refreshed",
          newExpiresAt: newExpiresAt.toISOString(),
        });
      } catch (err: any) {
        results.push({
          orgId: conn.organizationId,
          status: "exception",
          error: err?.message || "unknown",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      total: connections.length,
      refreshed: results.filter((r) => r.status === "refreshed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed" || r.status === "exception").length,
      results,
    });
  } catch (err: any) {
    console.error("[meta-token-refresh] fatal:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
