import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import * as crypto from "crypto";

export const revalidate = 3600; // Cache 1h

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

/* ── JWT auth (same pattern as sync/ga4) ───────── */
function createJWT(serviceAccount: any) {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");

  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");

  const signInput = header + "." + claim;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(serviceAccount.private_key, "base64url");

  return signInput + "." + signature;
}

async function getAccessToken(serviceAccount: any) {
  const jwt = createJWT(serviceAccount);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const data = await res.json();
  return data.access_token;
}

export async function GET() {
  try {
    /* ── 1) Read credentials from env vars ─────── */
    const saJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
    const propertyId = process.env.GA4_PROPERTY_ID;

    if (!saJson || !propertyId) {
      return NextResponse.json({ searchTerms: [], status: "disconnected" });
    }

    const serviceAccount = JSON.parse(saJson);
    const accessToken = await getAccessToken(serviceAccount);

    if (!accessToken) {
      return NextResponse.json({ searchTerms: [], status: "error", error: "Failed to get access token" });
    }

    /* ── 2) Fetch internal search terms (last 30d) ─ */
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const gaRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [
            {
              startDate: thirtyDaysAgo.toISOString().split("T")[0],
              endDate: now.toISOString().split("T")[0],
            },
          ],
          dimensions: [{ name: "searchTerm" }],
          metrics: [{ name: "eventCount" }],
          limit: 50,
          orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        }),
      }
    );

    if (!gaRes.ok) {
      const errText = await gaRes.text();
      return NextResponse.json({
        searchTerms: [],
        status: "error",
        error: errText.substring(0, 200),
      });
    }

    const gaData = await gaRes.json();
    const rows = gaData.rows || [];

    /* ── 3) Parse raw searches ─────────────────── */
    const rawSearches = rows.map((row: any) => ({
      searchTerm: row.dimensionValues[0]?.value || "",
      eventCount: parseInt(row.metricValues[0]?.value || "0"),
    }));

    /* ── 4) Match to product catalog ───────────── */
    const products = await prisma.product.findMany({
      where: { organizationId: ORG_ID, isActive: true },
      select: {
        id: true,
        name: true,
        stock: true,
        imageUrl: true,
        brand: true,
        category: true,
      },
    });

    const searchTerms = rawSearches
      .filter((s: any) => {
        const term = (s.searchTerm || "").trim();
        return term.length > 1 && term !== "(not set)";
      })
      .map((s: any) => {
        const term = s.searchTerm || "";
        const termLower = term.toLowerCase();
        const count = Math.round(s.eventCount || 0);

        const allMatched = products
          .filter((p) => {
            const nameLower = p.name.toLowerCase();
            return (
              nameLower.includes(termLower) ||
              termLower
                .split(/\s+/)
                .some((word: string) => word.length > 2 && nameLower.includes(word))
            );
          });

        const anyHasStock = allMatched.some((p) => p.stock !== null && p.stock > 0);

        const matched = allMatched
          .slice(0, 3)
          .map((p) => ({
            id: p.id,
            name: p.name,
            imageUrl: p.imageUrl,
            stock: p.stock,
            brand: p.brand,
            inStock: p.stock !== null && p.stock > 0,
          }));

        return {
          term,
          count,
          matchedProducts: matched,
          hasStock:
            matched.length === 0 || anyHasStock,
        };
      });

    return NextResponse.json({ searchTerms, status: "ok" });
  } catch (error: any) {
    console.error("Search metrics error:", error);
    return NextResponse.json({
      searchTerms: [],
      status: "error",
      error: error.message,
    });
  }
}
