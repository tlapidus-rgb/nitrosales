// ══════════════════════════════════════════════════════════════
// NitroPixel — Ads Without UTMs Detector (Cron)
// ══════════════════════════════════════════════════════════════
// Scans the last 7 days of pixel events for sessions where the
// landing URL has a paid click ID (fbclid/gclid/ttclid/msclkid/
// li_fat_id) but NO utm_source. These are ads that bypass our
// attribution layer because they were not tagged in the ad
// platform with proper UTMs.
//
// Output:
//   - JSON summary per organization with counts grouped by
//     click-ID family + a list of sample landing URLs.
//   - Persists an Insight (type=ANOMALY, severity=MEDIUM) when
//     ≥10 untagged events are detected for the same click family.
//
// Auth: ?key=<ADMIN_API_KEY o SYNC_KEY>, o Authorization: Bearer <SYNC_KEY>.
// Schedule (recommended): once per day.
// ══════════════════════════════════════════════════════════════

import { registrarLatido } from "@/lib/cron/latido";
import { NextRequest, NextResponse } from "next/server";
import { ultimoProcesado, arranqueDeLaVuelta, guardarCorte } from "@/lib/cron/cursor-store";
import { prisma } from "@/lib/db/client";
import { isValidAdminKey } from "@/lib/admin-key";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// E-02/E-11 (agregado el 2026-09-08). Este era el peor de los tres: ademas de no
// tener reloj ni orden ni cursor con `maxDuration = 60`, hace un `findMany` de 7
// dias de `pixel_events` **por organizacion** sobre la tabla mas grande del
// sistema. O sea que es el que antes se come el presupuesto, y el que mas caro
// paga cada vuelta que arranca de cero.
const PRESUPUESTO_MS = 45_000;
const CRON = "ads-utm-audit";

interface FamilyStats {
  family: string;
  untaggedCount: number;
  sampleUrls: string[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const syncKey =
    searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  // ⚠️ FAIL-CLOSED (R-01, 2026-09-15). Antes era `syncKey !== process.env.SYNC_KEY`
  // a secas: si la env NO estaba seteada, las dos puntas valian `undefined` y
  // `undefined !== undefined` es **false**, asi que un GET sin `?key=` y sin
  // header ENTRABA. Con una clave incorrecta devolvia 401, o sea que solo se
  // abria mandando *nada* — ningun escaner que pruebe claves lo encontraba.
  //
  // Y no alcanza con agregar el guard de vacio: `vercel.json` manda
  // `?key=<ADMIN_API_KEY>` a estos cinco, NO `SYNC_KEY`. Cerrar solo la de
  // SYNC_KEY los dejaria a los cinco en 401, y un cron que devuelve 401 no
  // alerta a nadie (es el modo de falla de E-20).
  //
  // Por eso entran por cualquiera de las dos, y las dos son fail-closed:
  // `isValidAdminKey` cae a una clave aleatoria por proceso si la env falta, y
  // la de SYNC_KEY exige que exista ANTES de comparar.
  const porSyncKey =
    typeof process.env.SYNC_KEY === "string" &&
    process.env.SYNC_KEY.length > 0 &&
    syncKey === process.env.SYNC_KEY;
  if (!porSyncKey && !isValidAdminKey(syncKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const arrancoEn = Date.now();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const orgs = await prisma.organization.findMany({
      // Orden estable: sin esto el cursor no significa nada y "quien queda
      // afuera" lo elige Postgres.
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    const results: Array<{
      orgId: string;
      orgName: string;
      totalUntaggedEvents: number;
      families: FamilyStats[];
      insightCreated: boolean;
    }> = [];
    const failures: { orgId: string; orgName: string; error: string }[] = [];

    const ids = orgs.map((o) => o.id);
    const { desde } = arranqueDeLaVuelta({
      ids,
      cursorGuardado: await ultimoProcesado(CRON),
      cursorExplicito: req.nextUrl.searchParams.get("orgCursor"),
      full: false,
    });
    let i = desde;
    let cortoPorReloj = false;

    for (; i < orgs.length; i++) {
      const org = orgs[i];
      if (Date.now() - arrancoEn > PRESUPUESTO_MS) {
        cortoPorReloj = true;
        break;
      }
      // E-05: aislamiento por organización. El `try` de arriba envuelve TODO el
      // loop: una org que explota cancelaba la auditoría de UTMs de todas las
      // siguientes, y el 500 resultante no lo mira nadie.
      try {
      // Pull recent landing-ish events (PAGEVIEW + SESSION_START) that have
      // some clickIds attached. We rely on the JSON column to be non-null.
      const events = await prisma.pixelEvent.findMany({
        where: {
          organizationId: org.id,
          receivedAt: { gte: since },
          type: { in: ["PAGE_VIEW", "PAGEVIEW", "SESSION_START"] },
          NOT: { clickIds: { equals: undefined } },
        },
        select: { clickIds: true, pageUrl: true, props: true },
        take: 5000,
      });

      const families = new Map<string, FamilyStats>();

      for (const ev of events) {
        const clicks = (ev.clickIds || {}) as Record<string, string>;
        if (!clicks || Object.keys(clicks).length === 0) continue;

        // Determine the click family
        let family: string | null = null;
        if (clicks.fbclid) family = "meta";
        else if (clicks.gclid) family = "google";
        else if (clicks.ttclid) family = "tiktok";
        else if (clicks.msclkid) family = "microsoft";
        else if (clicks.li_fat_id) family = "linkedin";
        if (!family) continue;

        // Check if URL has utm_source
        const url = ev.pageUrl || "";
        const hasUtm = /[?&]utm_source=/.test(url);

        // Also accept utm carried in props (page-level snapshot)
        const props = (ev.props || {}) as Record<string, unknown>;
        const utms = (props.utm || props.utms || {}) as Record<string, string>;
        const propsHasUtm = !!utms?.source;

        if (hasUtm || propsHasUtm) continue;

        // Untagged ad click — count it
        const stats = families.get(family) || {
          family,
          untaggedCount: 0,
          sampleUrls: [],
        };
        stats.untaggedCount += 1;
        if (stats.sampleUrls.length < 5 && url) {
          // Strip query params for the sample to avoid leaking ids
          const clean = url.split("?")[0];
          if (!stats.sampleUrls.includes(clean)) stats.sampleUrls.push(clean);
        }
        families.set(family, stats);
      }

      const familyList = Array.from(families.values()).sort(
        (a, b) => b.untaggedCount - a.untaggedCount,
      );
      const totalUntagged = familyList.reduce((s, f) => s + f.untaggedCount, 0);

      // Persist an Insight if there are meaningful untagged volumes
      let insightCreated = false;
      const offenders = familyList.filter((f) => f.untaggedCount >= 10);
      if (offenders.length > 0) {
        try {
          const summary = offenders
            .map((f) => `${f.family}: ${f.untaggedCount} clicks sin UTM`)
            .join(" · ");
          await prisma.insight.create({
            data: {
              organizationId: org.id,
              type: "ALERT",
              priority: "MEDIUM",
              title: `Ads sin UTM detectados (últimos 7 días)`,
              description: `Hay clicks pagos llegando a la tienda sin utm_source. NitroPixel los puede atribuir igual via click ID, pero NO va a poder agruparlos por campaña/ad set/creativo. Detalle: ${summary}.`,
              action: `Agregá UTMs en cada campaña del ad platform: utm_source=meta|google|tiktok, utm_medium=cpc, utm_campaign={{campaign.name}}, utm_content={{ad.name}}.`,
              metric: "untagged_clicks",
              metricValue: offenders.reduce((s, f) => s + f.untaggedCount, 0),
            },
          });
          insightCreated = true;
        } catch (e) {
          console.error(`[ads-utm-audit] failed to persist insight for org ${org.id}:`, e);
        }
      }

      results.push({
        orgId: org.id,
        orgName: org.name,
        totalUntaggedEvents: totalUntagged,
        families: familyList,
        insightCreated,
      });
      } catch (e: any) {
        console.error(`[ads-utm-audit] org ${org.name} (${org.id}) falló:`, e?.message);
        failures.push({ orgId: org.id, orgName: org.name, error: e?.message ?? String(e) });
      }
    }

    // E-05: ver digest. Ninguna org procesada + fallos = no es un exito.
    const todasFallaron = results.length === 0 && failures.length > 0;
    await guardarCorte(CRON, i, ids);
    await registrarLatido("ads-utm-audit", true);
    return NextResponse.json({
      ok: !todasFallaron,
      since: since.toISOString(),
      results,
      // Con datos = a esos clientes NO se les auditaron las UTMs, aunque ok sea true.
      failures,
      arrancoEn: desde,
      cortoEn: i >= orgs.length ? 0 : i,
      cortoPorReloj,
    });
  } catch (error) {
    await registrarLatido("ads-utm-audit", false, String((error as any)?.message ?? "error"));
    console.error("[ads-utm-audit] error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
