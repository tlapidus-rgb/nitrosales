// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/debug-flags — diagnóstico TEMPORAL (R-V02)
// ══════════════════════════════════════════════════════════════════════════
// Contesta la pregunta que el plan marca como bloqueante: qué feature flags
// están efectivamente prendidos. De eso depende si R-C25 (los rollups Gold de
// atribución sin borrado de huérfanas) es un problema ACTIVO o latente.
//
// Se puede correr en PREVIEW y vale para producción: las tres variables de
// PIXEL_* tienen alcance "Production and Preview" en Vercel, o sea el mismo
// valor en ambos entornos.
//
// Son flags de configuración, no secretos. Aun así se devuelve sólo el valor
// booleano derivado y el string crudo, nada más.
//
// ⚠️ BORRAR cuando la pregunta esté contestada.
// ══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { isValidAdminKey } from "@/lib/admin-key";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isValidAdminKey(req.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const crudo = (n: string) => process.env[n] ?? "(no seteada)";

  // Espejo EXACTO de cómo los lee el serve, para no razonar sobre el string.
  // Ver src/app/api/metrics/pixel/route.ts:264,294,324.
  const usePixelGold = process.env.PIXEL_USE_GOLD === "true";
  const usePixelChannels = process.env.PIXEL_USE_CHANNELS === "true";
  const useGoldChannel =
    usePixelGold && usePixelChannels && process.env.PIXEL_USE_GOLD_CHANNEL === "true";

  return NextResponse.json({
    entorno: process.env.VERCEL_ENV ?? "(no visible)",
    crudos: {
      PIXEL_USE_GOLD: crudo("PIXEL_USE_GOLD"),
      PIXEL_USE_CHANNELS: crudo("PIXEL_USE_CHANNELS"),
      PIXEL_USE_GOLD_CHANNEL: crudo("PIXEL_USE_GOLD_CHANNEL"),
      ORDERS_USE_GOLD: crudo("ORDERS_USE_GOLD"),
      // Estos dos son opt-OUT: sin setear, están PRENDIDOS.
      SILVER_ORDERS_ENABLED: crudo("SILVER_ORDERS_ENABLED"),
      ATTRIBUTION_ROLLUP_ENABLED: crudo("ATTRIBUTION_ROLLUP_ENABLED"),
    },
    derivados: {
      usePixelGold,
      usePixelChannels,
      // ⬇️ LA PREGUNTA: si es true, R-C25 es un incendio activo.
      useGoldChannel,
      ordersUseGold: process.env.ORDERS_USE_GOLD === "true",
      silverOrdersActivo: process.env.SILVER_ORDERS_ENABLED !== "false",
      attributionRollupActivo: process.env.ATTRIBUTION_ROLLUP_ENABLED !== "false",
    },
  });
}
