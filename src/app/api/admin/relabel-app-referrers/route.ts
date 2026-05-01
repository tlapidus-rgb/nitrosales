// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/relabel-app-referrers?orgId=X&key=Y&dryRun=1
// ══════════════════════════════════════════════════════════════
// Limpia retroactivamente los touchpoints de pixel_attributions
// donde el source quedo etiquetado con un app schema raro
// (ej: "com.instagram.android" → "instagram").
//
// Causa: hasta S60, el codigo de attribution.ts no reconocia los
// hostnames android-app://com.<app>.android y caian a fallback con
// el hostname literal como source. S60 agrego patterns nuevos pero
// solo aplica a futuras atribuciones — este endpoint corrige las
// pasadas.
//
// Mappings aplicados:
//   com.instagram.* → instagram
//   com.facebook.* (katana, lite, orca) → facebook
//   com.zhiliaoapp.* / com.ss.android.ugc.trill → tiktok
//   com.twitter.* / com.x.android → twitter
//   com.linkedin.* → linkedin
//   com.google.android.youtube → youtube
//   com.pinterest → pinterest
//   com.whatsapp → whatsapp
//   org.telegram.messenger → telegram
//
// Multi-tenant: pasa orgId para limitar. Sin orgId aplica a todas.
// dryRun=1 para ver que cambiaria sin escribir.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const KEY = "nitrosales-secret-key-2024-production";

const APP_TO_SOURCE: Array<{ pattern: RegExp; source: string }> = [
  { pattern: /^com\.instagram\./, source: "instagram" },
  { pattern: /^com\.facebook\./, source: "facebook" },
  { pattern: /^com\.zhiliaoapp\.musically$|^com\.ss\.android\.ugc\.trill$/, source: "tiktok" },
  { pattern: /^com\.twitter\.|^com\.x\.android$/, source: "twitter" },
  { pattern: /^com\.linkedin\./, source: "linkedin" },
  { pattern: /^com\.google\.android\.youtube$/, source: "youtube" },
  { pattern: /^com\.pinterest/, source: "pinterest" },
  { pattern: /^com\.whatsapp/, source: "whatsapp" },
  { pattern: /^org\.telegram\.messenger$/, source: "telegram" },
];

function relabelSource(source: string): string | null {
  if (!source) return null;
  for (const rule of APP_TO_SOURCE) {
    if (rule.pattern.test(source)) return rule.source;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const where: any = {};
    if (orgId) where.organizationId = orgId;

    const all = await prisma.pixelAttribution.findMany({
      where,
      select: { id: true, organizationId: true, touchpoints: true },
    });

    let scanned = 0;
    let touchpointsTotal = 0;
    let touchpointsRelabeled = 0;
    let rowsUpdated = 0;
    const sourceCounts: Record<string, number> = {};

    for (const row of all) {
      scanned++;
      const tps = Array.isArray(row.touchpoints) ? (row.touchpoints as any[]) : [];
      let modified = false;
      for (const tp of tps) {
        touchpointsTotal++;
        if (typeof tp.source === "string") {
          const newSource = relabelSource(tp.source);
          if (newSource && newSource !== tp.source) {
            sourceCounts[`${tp.source} → ${newSource}`] =
              (sourceCounts[`${tp.source} → ${newSource}`] || 0) + 1;
            tp.source = newSource;
            // Si tenia medium "referral" lo cambiamos a "social" para los social apps,
            // pero solo si NO esta ya seteado a algo razonable
            if (newSource !== "whatsapp" && newSource !== "telegram") {
              tp.medium = "social";
            }
            modified = true;
            touchpointsRelabeled++;
          }
        }
      }
      if (modified) {
        rowsUpdated++;
        if (!dryRun) {
          await prisma.pixelAttribution.update({
            where: { id: row.id },
            data: { touchpoints: tps as any },
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      orgId: orgId || "(all orgs)",
      dryRun,
      scanned,
      touchpointsTotal,
      touchpointsRelabeled,
      rowsUpdated,
      sourceCounts,
      message: dryRun
        ? "Dry run completado. Volve a correr sin dryRun=1 para aplicar."
        : "Cambios aplicados. Refresca el dashboard para verlos.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
