// Temporary endpoint to trigger ONLY Google Ads sync
// Uses session auth instead of syncKey, avoids timeout from full sync
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const syncKey = process.env.NEXTAUTH_SECRET || "";
  const baseUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";

  try {
    const res = await fetch(
      baseUrl + `/api/sync/google-ads?key=${encodeURIComponent(syncKey)}`,
      { method: "GET" }
    );
    const data = await res.json();
    return NextResponse.json({ googleAds: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
