import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const syncKey = process.env.NEXTAUTH_SECRET || "";
  const baseUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";

  const results: Record<string, any> = {};

  // Run all syncs in parallel to stay within 60s
  const [vtexRes, ga4Res, gadsRes, metaRes] = await Promise.allSettled([
    fetch(baseUrl + "/api/sync/vtex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey }),
    }).then((r) => r.json()),
    fetch(baseUrl + "/api/sync/ga4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey }),
    }).then((r) => r.json()),
    fetch(
      baseUrl + `/api/sync/google-ads?key=${encodeURIComponent(syncKey)}`,
      { method: "GET" }
    ).then((r) => r.json()),
    fetch(
      baseUrl + `/api/sync/meta?key=${encodeURIComponent(syncKey)}`,
      { method: "GET" }
    ).then((r) => r.json()),
  ]);

  results.vtex =
    vtexRes.status === "fulfilled" ? vtexRes.value : { error: vtexRes.reason?.message };
  results.ga4 =
    ga4Res.status === "fulfilled" ? ga4Res.value : { error: ga4Res.reason?.message };
  results.googleAds =
    gadsRes.status === "fulfilled" ? gadsRes.value : { error: gadsRes.reason?.message };
  results.metaAds =
    metaRes.status === "fulfilled" ? metaRes.value : { error: metaRes.reason?.message };

  return NextResponse.json({ ok: true, results });
}
