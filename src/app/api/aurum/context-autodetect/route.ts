export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aurum Onboarding Inteligente — Auto-detect business context
// ══════════════════════════════════════════════════════════════
// GET /api/aurum/context-autodetect
//
// Lee fuentes autoritativas de NitroSales para inferir campos del
// onboarding wizard SIN preguntar al usuario:
//   - industry: del catalogo de productos (categorias mas frecuentes)
//   - salesChannels: de la tabla connections (VTEX, ML, etc)
//   - adChannels: de la tabla connections (META_ADS, GOOGLE_ADS, etc)
//
// CAMPOS QUE NO SE PUEDEN AUTO-DETECTAR (siempre los pregunta el wizard):
//   - businessType: el modelo de negocio no esta en la DB
//   - country: Order no tiene country, Organization tampoco
//   - businessStage: NO inferir de fechas de ordenes (la primera orden
//     en NitroSales NO es la antiguedad real de la empresa — el usuario
//     pudo haber empezado a usar la plataforma mucho despues de fundar)
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

type Confidence = "high" | "medium" | "low" | "none";

type Detected<T> = {
  value: T | null;
  confidence: Confidence;
  source: string;
  hint?: string;
};

// Mapeo de palabras-clave en categorias/productos a rubros del wizard
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  juguetes: ["juguete", "juguetería", "muñec", "peluche", "lego", "playmobil", "pelota", "didactic", "infant", "bebé", "bebe"],
  moda: ["ropa", "remera", "pantalon", "vestido", "zapatilla", "calzado", "indument", "moda", "campera", "buzo", "jean"],
  electronica: ["celular", "smartphone", "notebook", "laptop", "tablet", "auricular", "tv", "televisor", "consola", "gamer"],
  alimentos: ["alimento", "comida", "snack", "bebida", "vino", "cerveza", "café", "gourmet", "almacén"],
  belleza: ["maquillaje", "skincare", "perfume", "shampoo", "crema", "labial", "cosmét", "belleza"],
  deportes: ["deporte", "fitness", "gym", "running", "futbol", "fútbol", "tenis", "yoga", "bicicleta", "outdoor"],
  hogar: ["mueble", "sillon", "sillón", "decor", "almohada", "sábana", "cocina", "vajilla", "iluminación", "lampara"],
};

function detectIndustry(categoryNames: string[], productNames: string[]): Detected<string> {
  const corpus = [...categoryNames, ...productNames].join(" ").toLowerCase();
  if (!corpus.trim()) {
    return { value: null, confidence: "none", source: "products", hint: "no hay productos cargados" };
  }
  const scores: Record<string, number> = {};
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    scores[industry] = 0;
    for (const kw of keywords) {
      const matches = corpus.split(kw).length - 1;
      scores[industry] += matches;
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topIndustry, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || ["", 0];
  if (topScore === 0) {
    return { value: null, confidence: "none", source: "products", hint: "no detectado en catalogo" };
  }
  // High confidence si el top es al menos 2x el segundo Y tiene >=5 matches
  const confidence: Confidence =
    topScore >= secondScore * 2 && topScore >= 5
      ? "high"
      : topScore >= 3
      ? "medium"
      : "low";
  return {
    value: topIndustry,
    confidence,
    source: "products",
    hint: `${topScore} matches en catalogo`,
  };
}

const PLATFORM_TO_SALES_CHANNEL: Record<string, string> = {
  VTEX: "VTEX",
  SHOPIFY: "Shopify",
  TIENDANUBE: "Tienda Nube",
  WOOCOMMERCE: "Tienda propia",
  MERCADOLIBRE: "MercadoLibre",
};

const PLATFORM_TO_AD_CHANNEL: Record<string, string> = {
  GOOGLE_ADS: "Google Ads",
  META_ADS: "Meta Ads",
  TIKTOK_ADS: "TikTok Ads",
};

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const org = await getOrganization();

    // 1. Connections → sales + ad channels
    const connections = await prisma.connection.findMany({
      where: { organizationId: org.id, status: "ACTIVE" },
      select: { platform: true },
    });

    const salesChannelsArr = Array.from(
      new Set(
        connections
          .map((c) => PLATFORM_TO_SALES_CHANNEL[c.platform as string])
          .filter((v): v is string => Boolean(v))
      )
    );
    const adChannelsArr = Array.from(
      new Set(
        connections
          .map((c) => PLATFORM_TO_AD_CHANNEL[c.platform as string])
          .filter((v): v is string => Boolean(v))
      )
    );

    // 2. Industry → categorias + productos
    let categoryNames: string[] = [];
    let productNames: string[] = [];
    try {
      const products = await prisma.product.findMany({
        where: { organizationId: org.id },
        select: { name: true, category: true },
        take: 500,
      });
      productNames = products.map((p) => p.name).filter((v): v is string => Boolean(v));
      categoryNames = products
        .map((p) => p.category)
        .filter((v): v is string => Boolean(v));
    } catch {
      // ignore
    }
    const industry = detectIndustry(categoryNames, productNames);

    // 3. Datos auxiliares (no son del wizard, pero sirven a Aurum como contexto)
    let totalRevenue12m: number | null = null;
    let totalOrders12m: number | null = null;
    let avgOrderValue: number | null = null;
    try {
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const agg = await prisma.order.aggregate({
        where: { organizationId: org.id, orderDate: { gte: since } },
        _sum: { totalValue: true },
        _count: { _all: true },
      });
      const sumDecimal = agg._sum.totalValue;
      totalRevenue12m = sumDecimal ? Number(sumDecimal.toString()) : 0;
      totalOrders12m = agg._count._all;
      avgOrderValue = totalOrders12m > 0 ? totalRevenue12m / totalOrders12m : 0;
    } catch {
      // ignore
    }

    return NextResponse.json({
      orgName: org.name,
      detected: {
        industry,
        salesChannels: {
          value: salesChannelsArr.length > 0 ? salesChannelsArr : null,
          confidence: salesChannelsArr.length > 0 ? ("high" as Confidence) : ("none" as Confidence),
          source: "connections",
          hint: `${connections.length} conexiones activas`,
        },
        adChannels: {
          value: adChannelsArr.length > 0 ? adChannelsArr : null,
          confidence: adChannelsArr.length > 0 ? ("high" as Confidence) : ("none" as Confidence),
          source: "connections",
          hint: `${adChannelsArr.length} plataformas de ads conectadas`,
        },
      },
      // Datos auxiliares para la base de conocimiento (no del wizard)
      aux: {
        totalRevenue12m,
        totalOrders12m,
        avgOrderValue,
      },
      // Campos que NO se pueden auto-detectar (siempre los pregunta el wizard)
      mustAsk: ["businessType", "country", "businessStage"],
    });
  } catch (e: any) {
    console.error("[context-autodetect]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
