import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import * as crypto from "crypto";

// Generate JWT for Google service account auth
function createJWT(serviceAccount: any) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");
  
  const signInput = header + "." + claim;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(serviceAccount.private_key, "base64url");
  
  return signInput + "." + signature;
}

// Get access token from service account
async function getAccessToken(serviceAccount: any) {
  const jwt = createJWT(serviceAccount);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const data = await res.json();
  return data.access_token;
}

export async function POST(req: Request) {
  try {
    const { syncKey } = await req.json();
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const saJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
    const propertyId = process.env.GA4_PROPERTY_ID;

    if (!saJson || !propertyId) {
      return NextResponse.json({ error: "Missing GA4 credentials", has_sa: !!saJson, has_pid: !!propertyId }, { status: 400 });
    }

    const serviceAccount = JSON.parse(saJson);
    const accessToken = await getAccessToken(serviceAccount);

    if (!accessToken) {
      return NextResponse.json({ error: "Failed to get access token" }, { status: 401 });
    }

    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    // Fetch last 30 days of GA4 data
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    const gaRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "newUsers" },
            { name: "screenPageViews" },
            { name: "averageSessionDuration" },
            { name: "bounceRate" },
          ],
        }),
      }
    );

    if (!gaRes.ok) {
      const errText = await gaRes.text();
      return NextResponse.json({ error: "GA4 API error", status: gaRes.status, detail: errText.substring(0, 500) });
    }

    const gaData = await gaRes.json();
    const rows = gaData.rows || [];

    // Get existing dates to skip them
    const existingMetrics = await prisma.webMetricDaily.findMany({
      where: { organizationId: org.id },
      select: { date: true },
    });
    const existingDates = new Set(existingMetrics.map((m: any) => m.date.toISOString().split("T")[0]));

    const newRows = rows.filter((row: any) => {
      const d = row.dimensionValues[0].value;
      const dateStr = d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6, 8);
      return !existingDates.has(dateStr);
    });

    if (newRows.length > 0) {
      await prisma.webMetricDaily.createMany({
        data: newRows.map((row: any) => {
          const d = row.dimensionValues[0].value;
          const dateStr = d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6, 8);
          const m = row.metricValues;
          return {
            organizationId: org.id,
            date: new Date(dateStr),
            sessions: parseInt(m[0].value || "0"),
            users: parseInt(m[1].value || "0"),
            newUsers: parseInt(m[2].value || "0"),
            pageViews: parseInt(m[3].value || "0"),
            avgSessionDuration: parseFloat(m[4].value || "0"),
            bounceRate: parseFloat(m[5].value || "0"),
          };
        }),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      ok: true,
      totalRows: rows.length,
      new: newRows.length,
      skipped: rows.length - newRows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
