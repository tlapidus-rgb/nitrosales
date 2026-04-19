import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// Mapea el ConnectionStatus del enum Prisma al status que consume el UI
// (PENDING|ACTIVE|ERROR|DISCONNECTED) -> (CONNECTED|PENDING|ERROR|DISCONNECTED)
function mapDbStatus(
  dbStatus: "PENDING" | "ACTIVE" | "ERROR" | "DISCONNECTED" | undefined
): "CONNECTED" | "PENDING" | "ERROR" | "DISCONNECTED" {
  if (dbStatus === "ACTIVE") return "CONNECTED";
  if (dbStatus === "ERROR") return "ERROR";
  if (dbStatus === "PENDING") return "PENDING";
  return "DISCONNECTED";
}

// Data fresca en los ultimos 14 dias = plataforma claramente conectada
// aunque no tenga fila en `connections`.
const FRESHNESS_WINDOW_DAYS = 14;

function isFresh(d: Date | null | undefined): boolean {
  if (!d) return false;
  const ageDays = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays <= FRESHNESS_WINDOW_DAYS;
}

export async function GET() {
  const ORG_ID = await getOrganizationId();
  try {
    const connections = await prisma.connection.findMany({
      where: { organizationId: ORG_ID },
      select: {
        platform: true,
        status: true,
        lastSyncAt: true,
        lastSyncError: true,
      },
      orderBy: { platform: "asc" },
    });

    // Freshness de la data real — si cualquiera de estas tablas tiene
    // un registro reciente, consideramos la plataforma CONNECTED
    // aunque connections no lo diga.
    const [
      latestOrderVtex,
      latestOrderMeli,
      latestWebMetric,
      latestGoogleAd,
      latestMetaAd,
      latestSeoQuery,
    ] = await Promise.all([
      prisma.order.findFirst({
        where: { organizationId: ORG_ID, source: "VTEX" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.order.findFirst({
        where: { organizationId: ORG_ID, source: "MELI" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.webMetricDaily.findFirst({
        where: { organizationId: ORG_ID },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.adMetricDaily.findFirst({
        where: {
          campaign: { organizationId: ORG_ID, platform: "GOOGLE" },
        },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.adMetricDaily.findFirst({
        where: {
          campaign: { organizationId: ORG_ID, platform: "META" },
        },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.seoQueryDaily.findFirst({
        where: { organizationId: ORG_ID },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
    ]);

    const platformLabels: Record<string, string> = {
      VTEX: "VTEX",
      MERCADOLIBRE: "MercadoLibre",
      GA4: "Google Analytics 4",
      GOOGLE_ADS: "Google Ads",
      META_ADS: "Meta Ads",
      GOOGLE_SEARCH_CONSOLE: "Google Search Console",
    };

    const dataFreshness: Record<string, Date | null> = {
      VTEX: latestOrderVtex?.createdAt ?? null,
      MERCADOLIBRE: latestOrderMeli?.createdAt ?? null,
      GA4: latestWebMetric?.date ?? null,
      GOOGLE_ADS: latestGoogleAd?.date ?? null,
      META_ADS: latestMetaAd?.date ?? null,
      GOOGLE_SEARCH_CONSOLE: latestSeoQuery?.date ?? null,
    };

    const platforms = [
      "VTEX",
      "MERCADOLIBRE",
      "GA4",
      "GOOGLE_ADS",
      "META_ADS",
      "GOOGLE_SEARCH_CONSOLE",
    ];

    const connectors = platforms.map((platform) => {
      const conn = connections.find((c) => c.platform === platform);
      const dbStatus = mapDbStatus(conn?.status as any);
      const freshness = dataFreshness[platform] ?? null;
      const fresh = isFresh(freshness);

      // Si hay data fresca pero la connection no existe o dice DISCONNECTED,
      // lo consideramos CONNECTED — clearly the integration esta funcionando.
      let finalStatus = dbStatus;
      if (fresh && (dbStatus === "DISCONNECTED" || dbStatus === "PENDING")) {
        finalStatus = "CONNECTED";
      }

      return {
        platform,
        label: platformLabels[platform] ?? platform,
        status: finalStatus,
        lastSyncAt: conn?.lastSyncAt ?? null,
        lastSyncError: conn?.lastSyncError ?? null,
        latestDataAt: freshness,
        hasRecentData: fresh,
      };
    });

    return NextResponse.json({ connectors });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
