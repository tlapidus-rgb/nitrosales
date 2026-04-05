export const dynamic = "force-dynamic";

// Quick ML API diagnostic endpoint — forces token refresh
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { MLCredentials } from "@/lib/connectors/mercadolibre";

export const revalidate = 0;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";
const ML_API = "https://api.mercadolibre.com";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diagnostics: Record<string, any> = {};

  try {
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" },
    });

    if (!connection) {
      return NextResponse.json({ ok: false, error: "No ML connection" });
    }

    const creds = connection.credentials as unknown as MLCredentials;
    diagnostics.storedTokenPrefix = creds.accessToken?.substring(0, 25);
    diagnostics.storedTokenExpiresAt = creds.tokenExpiresAt;

    // Step 1: Test stored token
    const storedRes = await fetch(`${ML_API}/sites/MLA/search?q=monopoly&limit=1`, {
      headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    diagnostics.storedTokenStatus = storedRes.status;

    // Step 2: Force refresh via refresh_token
    let freshToken: string | undefined;
    if (creds.refreshToken && creds.appId && creds.secretKey) {
      const refreshRes = await fetch(`${ML_API}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: creds.appId,
          client_secret: creds.secretKey,
          refresh_token: creds.refreshToken,
        }),
      });
      diagnostics.refreshStatus = refreshRes.status;
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        freshToken = data.access_token;
        diagnostics.freshTokenPrefix = freshToken?.substring(0, 25);
        diagnostics.freshExpiresIn = data.expires_in;

        // Save the fresh token to DB
        const newCreds = {
          ...creds,
          accessToken: data.access_token,
          refreshToken: data.refresh_token || creds.refreshToken,
          tokenExpiresAt: Date.now() + (data.expires_in * 1000),
        };
        await prisma.connection.update({
          where: { id: connection.id },
          data: { credentials: newCreds as any },
        });
        diagnostics.savedNewToken = true;
      } else {
        diagnostics.refreshBody = (await refreshRes.text()).substring(0, 300);
      }
    } else {
      diagnostics.refreshSkipped = "Missing refreshToken, appId, or secretKey";
    }

    // Step 3: Test with fresh token
    if (freshToken) {
      const freshRes = await fetch(`${ML_API}/sites/MLA/search?q=monopoly&limit=3`, {
        headers: { Authorization: `Bearer ${freshToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      diagnostics.freshTokenStatus = freshRes.status;
      if (freshRes.ok) {
        const data = await freshRes.json();
        diagnostics.freshResults = data.results?.length || 0;
        diagnostics.freshTotal = data.paging?.total || 0;
        diagnostics.freshSample = data.results?.slice(0, 2).map((r: any) => ({
          title: r.title?.substring(0, 60),
          price: r.price,
        }));
      } else {
        diagnostics.freshBody = (await freshRes.text()).substring(0, 200);
      }
    }

    // Step 4: Test without auth at all
    const noAuthRes = await fetch(`${ML_API}/sites/MLA/search?q=monopoly&limit=1`, {
      signal: AbortSignal.timeout(10000),
    });
    diagnostics.noAuthStatus = noAuthRes.status;

    return NextResponse.json({ ok: true, diagnostics });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, diagnostics });
  }
}
