// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-gold-attribution-channel — Gold por CANAL
// ══════════════════════════════════════════════════════════════════════════
// Recomputa gold_attribution_channel (revenue de atribución por org×día×CANAL)
// para la ventana reciente, leyendo pixel_attributions (Bronze). Es el gemelo por
// canal de refresh-gold-attribution: existe para que, con PIXEL_USE_CHANNELS ON,
// el serve lea Gold (rápido) en vez de escanear pa.touchpoints en vivo (que en 30d
// de la org grande se pasa del timeout → mock en 0).
//
// PER-ORG: la resolución de canal depende de las reglas de la org (channel_rule),
// así que carga las reglas de cada org y materializa con SU channelCase. Resumible
// por orgCursor (una org grande puede comerse el budget). El total es idéntico al
// de gold_attribution_source (test de paridad). attribution.ts INTACTO.
//
//   • Off-switch: ATTRIBUTION_ROLLUP_ENABLED=false lo apaga (mismo que el de source).
//   • Corre por DEFAULT para que la tabla esté fresca ANTES de flipear
//     PIXEL_USE_GOLD_CHANNEL (el flag que controla la LECTURA del serve).
//   • Resiliente: si gold_attribution_channel o channel_rule no existen, no rompe.
//   • ?full=1 → backfill de toda la historia. ?orgCursor=N → reanuda.
//
// Auth: ?key=<ADMIN_API_KEY>.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  buildGoldAttributionChannelUpsert,
  buildGoldAttributionChannelDeleteOrphans,
} from "@/data/gold/gold-attribution-channel-transform";
import { buildTouchpointChannelCase } from "@/lib/pixel/touchpoint-channel-sql";
import { LOAD_CHANNEL_RULES_SQL, rowToChannelRule, type ChannelRuleRow } from "@/lib/pixel/channel-rules-store";
import { ultimoProcesado, arranqueDeLaVuelta, guardarCorte } from "@/lib/cron/cursor-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAYS_BACK = 4; // ventana incremental + margen de borde

// Nombre bajo el que este cron guarda por donde iba. E-11.
const CRON = "refresh-gold-attribution-channel";
const BUDGET_MS = 250_000; // bajo el cap real de 300s

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (process.env.ATTRIBUTION_ROLLUP_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "ATTRIBUTION_ROLLUP_ENABLED=false" });
  }

  const startedAt = Date.now();
  const full = url.searchParams.get("full") === "1";
  const since = full
    ? "1970-01-01T00:00:00Z"
    : new Date(Date.now() - DAYS_BACK * 86_400_000).toISOString();
  // E-11 — EL CURSOR EXISTIA Y NO LO LEIA NADIE.
  // Este endpoint venia devolviendo `resume: "?orgCursor=7"` desde siempre, pero
  // el unico que lo invoca es Vercel Cron con la URL fija de vercel.json: nadie
  // leia ese campo ni volvia a llamar. O sea que cada corrida arrancaba de la
  // org 0 y, si el budget se acababa antes de llegar al final, las ultimas
  // organizaciones de la lista NO SE PROCESABAN NUNCA. Siempre las mismas,
  // porque el orden es `ORDER BY 1` sobre el organizationId — estable.
  //
  // Ahora el corte se persiste y la proxima invocacion arranca ahi. El
  // `?orgCursor=` explicito sigue mandando por encima del guardado, para poder
  // reanudar a mano desde donde uno quiera.
  const cursorExplicito = url.searchParams.get("orgCursor");

  try {
    // ⚠️ El reloj de la BASE, no `new Date()`. `gold_updated_at` lo escribe
    // Postgres; con desfasaje de reloj el DELETE borraría lo recién insertado.
    const [{ now: runStartedAt }] = await prisma.$queryRawUnsafe<Array<{ now: Date }>>(
      `SELECT now() AS now`,
    );

    // Orgs con órdenes atribuidas en la ventana (o todas, si backfill).
    const orgsRes: any = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT "organizationId" org FROM pixel_attributions
       WHERE "organizationId" IS NOT NULL AND "createdAt" >= $1::timestamptz ORDER BY 1`,
      since,
    );
    const orgs: string[] = orgsRes.map((o: any) => o.org);

    // El cursor guardado solo aplica al modo incremental. Un `?full=1` es una
    // operacion manual sobre toda la historia: arranca donde el que la corre
    // diga, no donde quedo la corrida automatica de hace media hora.
    const { desde: start, persiste: persisteCursor } = arranqueDeLaVuelta({
      ids: orgs,
      cursorGuardado: await ultimoProcesado(CRON),
      cursorExplicito,
      full,
    });

    const done: Array<{ org: string; rows: number; huerfanasBorradas: number }> = [];
    let i = start;
    for (; i < orgs.length; i++) {
      if (Date.now() - startedAt > BUDGET_MS) break;
      const org = orgs[i];
      // Reglas de la org (globales + propias) → mismo CASE que el panel y el serve.
      let channelCase: string;
      try {
        const rules = ((await prisma.$queryRawUnsafe(LOAD_CHANNEL_RULES_SQL, org)) as ChannelRuleRow[]).map(rowToChannelRule);
        channelCase = buildTouchpointChannelCase(rules, "tp");
      } catch {
        channelCase = buildTouchpointChannelCase([], "tp"); // channel_rule ausente → passthrough
      }
      // Upsert + borrado de huérfanas EN LA MISMA TRANSACCIÓN, por org.
      // Separarlos deja una ventana donde conviven la fila del canal viejo y la
      // del nuevo — o sea revenue DUPLICADO si alguien lee el panel justo ahí.
      const [n, huerfanas] = await prisma.$transaction([
        prisma.$executeRawUnsafe(buildGoldAttributionChannelUpsert(channelCase), org, since),
        prisma.$executeRawUnsafe(
          buildGoldAttributionChannelDeleteOrphans(),
          org,
          since,
          runStartedAt,
        ),
      ]);
      done.push({ org, rows: Number(n), huerfanasBorradas: Number(huerfanas) });
    }
    const remaining = i < orgs.length;
    // Guardar donde cortamos. Si terminamos la vuelta, se borra el cursor y la
    // proxima arranca de cero. Solo para el modo automatico: una corrida manual
    // con ?orgCursor= o ?full=1 no tiene por que mover el cursor del cron.
    if (persisteCursor) {
      await guardarCorte(CRON, i, orgs);
    }
    return NextResponse.json({
      ok: true,
      mode: full ? "backfill" : "incremental",
      since,
      orgsTotal: orgs.length,
      procesadas: done.length,
      done,
      done_all: !remaining,
      resume: remaining ? `?orgCursor=${i}${full ? "&full=1" : ""}` : null,
      // Desde E-11 esto ya no depende de que alguien lea `resume`: el corte
      // queda persistido y la proxima invocacion del cron arranca ahi sola.
      arrancoEn: start,
      cursorPersistido: persisteCursor,
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300), durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
