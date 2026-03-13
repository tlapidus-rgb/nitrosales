import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { GA4Connector } from "@/lib/connectors/ga4";

export const revalidate = 3600; // Cache 1h — GA4 data is typically delayed 24-48h

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

export async function GET() {
  try {
    /* ── 1) Get GA4 connection credentials ──────────────── */
    const connection = await prisma.connection.findUnique({
      where: {
        organizationId_platform: {
          organizationId: ORG_ID,
          platform: "GA4",
        },
      },
    });

    if (!connection || connection.status !== "ACTIVE") {
      return NextResponse.json({
        searchTerms: [],
        status: "disconnected",
      });
    }

    const credentials = connection.credentials as {
      propertyId: string;
      serviceAccountKey: string;
    };

    const ga4 = new GA4Connector(credentials);

    /* ── 2) Fetch internal searches (last 30 days) ──────── */
    const now = new Date();
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    );

    const rawSearches = await ga4.fetchInternalSearches({
      startDate: thirtyDaysAgo.toISOString().split("T")[0],
      endDate: now.toISOString().split("T")[0],
    });

    /* ── 3) Get products for matching ───────────────────── */
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

    /* ── 4) Match search terms to catalog ──────────────── */
    const searchTerms = rawSearches
      .filter((s: any) => {
        const term = (s.searchTerm || "").trim();
        // Filter out junk: empty, single char, or "(not set)"
        return term.length > 1 && term !== "(not set)";
      })
      .map((s: any) => {
        const term = s.searchTerm || "";
        const termLower = term.toLowerCase();
        const count = Math.round(s.eventCount || 0);

        // Fuzzy match: product name contains term, or term contains
        // a significant word from the product name
        const matched = products
          .filter((p) => {
            const nameLower = p.name.toLowerCase();
            return (
              nameLower.includes(termLower) ||
              termLower
                .split(/\s+/)
                .some(
                  (word) => word.length > 2 && nameLower.includes(word)
                )
            );
          })
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
          hasStock: matched.length === 0 || matched.some((m) => m.inStock),
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
