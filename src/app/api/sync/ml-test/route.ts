// Quick debug endpoint to test ML API access from Vercel Edge
// Edge runs on Cloudflare network — different IPs than Node.js serverless
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const revalidate = 0;

const CRON_KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = searchParams.get("q") || "lego juguete";
  const token = searchParams.get("token") || "";
  const results: any = { runtime: "edge" };

  // Test search WITHOUT token
  try {
    const res = await fetch(
      `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=3`
    );
    const data = await res.json();
    results.noTokenSearch = {
      status: res.status,
      total: data?.paging?.total || 0,
      error: data?.error || null,
      message: data?.message || null,
      firstResult: data?.results?.[0]?.title || null,
    };
  } catch (e: any) {
    results.noTokenSearch = { error: e.message };
  }

  // Test search WITH token (if provided)
  if (token) {
    try {
      const res = await fetch(
        `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=3`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      results.withTokenSearch = {
        status: res.status,
        total: data?.paging?.total || 0,
        error: data?.error || null,
        firstResult: data?.results?.[0]?.title || null,
      };
    } catch (e: any) {
      results.withTokenSearch = { error: e.message };
    }
  }

  // Test basic /sites/MLA endpoint
  try {
    const res = await fetch(`https://api.mercadolibre.com/sites/MLA`);
    const data = await res.json();
    results.sitesEndpoint = {
      status: res.status,
      id: data?.id || null,
      name: data?.name || null,
      error: data?.error || null,
    };
  } catch (e: any) {
    results.sitesEndpoint = { error: e.message };
  }

  return NextResponse.json(results);
}
