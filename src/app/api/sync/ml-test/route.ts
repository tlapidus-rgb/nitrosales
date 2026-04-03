// Quick ML API diagnostic endpoint
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getAccessToken, MLCredentials } from "@/lib/connectors/mercadolibre";

export const revalidate = 0;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diagnostics: Record<string, any> = {};

  try {
    // 1. Get ML credentials
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" },
    });

    if (!connection) {
      return NextResponse.json({ ok: false, error: "No ML connection" });
    }

    const creds = connection.credentials as unknown as MLCredentials;
    diagnostics.hasAppId = !!creds.appId;
    diagnostics.hasSecretKey = !!creds.secretKey;
    diagnostics.hasAccessToken = !!creds.accessToken;
    diagnostics.hasRefreshToken = !!creds.refreshToken;
    diagnostics.tokenExpiresAt = creds.tokenExpiresAt;
    diagnostics.tokenExpired = creds.tokenExpiresAt ? Date.now() > creds.tokenExpiresAt : "unknown";

    // 2. Try to get access token
    let token: string | undefined;
    try {
      token = await getAccessToken(creds);
      diagnostics.gotToken = true;
      diagnostics.tokenPrefix = token?.substring(0, 20);
    } catch (e: any) {
      diagnostics.gotToken = false;
      diagnostics.tokenError = e.message;
    }

    // 3. Test ML API without auth
    const testEan = "7796785008401"; // Monopoly Popular
    const noAuthRes = await fetch(
      `https://api.mercadolibre.com/sites/MLA/search?q=${testEan}&limit=3`,
      { signal: AbortSignal.timeout(10000) }
    );
    diagnostics.noAuthStatus = noAuthRes.status;
    if (noAuthRes.ok) {
      const data = await noAuthRes.json();
      diagnostics.noAuthResults = data.results?.length || 0;
    } else {
      diagnostics.noAuthBody = (await noAuthRes.text()).substring(0, 200);
    }

    // 4. Test ML API with auth
    if (token) {
      const authRes = await fetch(
        `https://api.mercadolibre.com/sites/MLA/search?q=${testEan}&limit=3`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        }
      );
      diagnostics.authStatus = authRes.status;
      if (authRes.ok) {
        const data = await authRes.json();
        diagnostics.authResults = data.results?.length || 0;
        diagnostics.authSample = data.results?.slice(0, 2).map((r: any) => ({
          title: r.title?.substring(0, 60),
          price: r.price,
          id: r.id,
        }));
      } else {
        diagnostics.authBody = (await authRes.text()).substring(0, 200);
      }
    }

    // 5. Test with a name search
    if (token) {
      const nameRes = await fetch(
        `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent("Monopoly juego mesa")}&limit=3&condition=new`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        }
      );
      diagnostics.nameSearchStatus = nameRes.status;
      if (nameRes.ok) {
        const data = await nameRes.json();
        diagnostics.nameSearchResults = data.results?.length || 0;
        diagnostics.nameSearchTotal = data.paging?.total || 0;
      } else {
        diagnostics.nameSearchBody = (await nameRes.text()).substring(0, 200);
      }
    }

    return NextResponse.json({ ok: true, diagnostics });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, diagnostics });
  }
}
