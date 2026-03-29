// Quick debug endpoint to test ML API access from Vercel
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const revalidate = 0;
export const maxDuration = 30;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = searchParams.get("q") || "lego juguete";
  const results: any = {};

  // 1. Get token from DB
  const conn = await prisma.connection.findFirst({
    where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" },
  });

  const creds = conn?.credentials as any;
  const token = creds?.accessToken;
  results.hasToken = !!token;

  // 2. Test search WITHOUT token
  try {
    const res = await fetch(
      `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=3`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    results.noTokenSearch = {
      status: res.status,
      total: data?.paging?.total || 0,
      error: data?.error || null,
      firstResult: data?.results?.[0]?.title || null,
    };
  } catch (e: any) {
    results.noTokenSearch = { error: e.message };
  }

  // 3. Test search WITH token
  if (token) {
    try {
      const res = await fetch(
        `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=3`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        }
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

  // 4. Test items endpoint (always public)
  try {
    const res = await fetch(
      `https://api.mercadolibre.com/sites/MLA`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    results.sitesEndpoint = {
      status: res.status,
      id: data?.id || null,
      error: data?.error || null,
    };
  } catch (e: any) {
    results.sitesEndpoint = { error: e.message };
  }

  return NextResponse.json(results);
}
