import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const orderId = req.nextUrl.searchParams.get("orderId") || "";
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

    const account = process.env.VTEX_ACCOUNT || "";
    const appKey = process.env.VTEX_APP_KEY || "";
    const appToken = process.env.VTEX_APP_TOKEN || "";

    const res = await fetch(
      `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${orderId}`,
      { headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken, Accept: "application/json" } }
    );
    if (!res.ok) return NextResponse.json({ error: "VTEX HTTP " + res.status });
    const detail = await res.json();

    // Extract ALL promo-related fields
    const rbd = detail.ratesAndBenefitsData;
    const ratesAndBenefitsIdentifiers = detail.ratesAndBenefitsIdentifiers;
    const itemPromos = (detail.items || []).map((item: any) => ({
      name: item.name?.substring(0, 40),
      priceTags: item.priceTags || [],
      offerings: item.offerings || [],
      priceDefinition: item.priceDefinition ? "exists" : "none"
    }));
    const marketingData = detail.marketingData;
    const totals = detail.totals;

    return NextResponse.json({
      orderId,
      status: detail.status,
      ratesAndBenefitsData: rbd,
      ratesAndBenefitsIdentifiers,
      itemPromos,
      marketingData,
      totals,
      hasRBD: !!rbd,
      rbdType: typeof rbd,
      rbdIsArray: Array.isArray(rbd),
      rbdLength: Array.isArray(rbd) ? rbd.length : 0
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
