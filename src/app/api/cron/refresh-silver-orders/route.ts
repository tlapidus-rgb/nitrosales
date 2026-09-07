// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-silver-orders — Fase 2 (§8, §9)
// ══════════════════════════════════════════════════════════════════════════
// Mantiene silver_orders al día: por cada org, upsertea los orders de la ventana
// reciente (o toda la historia con ?full=1) usando buildSilverOrdersUpsert().
//
// SEGURIDAD / ESTADO:
//   • FLAG-GATED por SILVER_ORDERS_ENABLED: si != "true", NO escribe nada (skip).
//     Inerte hasta que el equipo lo encienda en Vercel, aun si se invoca el endpoint.
//   • IDEMPOTENTE: el upsert hace ON CONFLICT DO UPDATE → correr N veces = igual.
//   • BUDGET: corta si se pasa del presupuesto, para no timeoutear (retorna 200 parcial).
//   • Los flags is_valid/is_web salen del CONTRATO (via el transform) → sin drift.
//
// Auth: header user-agent vercel-cron, o ?key=<ADMIN_API_KEY> (igual que los demás crons).
// AGENDADO en vercel.json cada 30 min (`0,30 * * * *`). El comentario anterior
// decía "NO está en vercel.json todavía" y llevaba semanas siendo falso — un
// header que miente sobre si un cron corre es peligroso justo cuando hay que
// diagnosticar por qué unos números no se actualizan. Ver docs/medallion/silver-orders.md.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { buildSilverOrdersUpsert } from "@/data/silver/silver-orders-transform";
import { buildCustomerFirstsUpsert } from "@/data/silver/silver-customer-firsts-transform";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAYS_BACK = 3; // ventana incremental (cubre huecos de hasta 3 días)
import {
  ultimoProcesado,
  arranqueDeLaVuelta,
  guardarCorte,
} from "@/lib/cron/cursor-store";

const INVOCATION_BUDGET_MS = 250_000;

// E-11 — sin cursor, cada corrida arrancaba de la primera org. Si el budget se
// acaba antes de llegar al final, las ultimas de la lista NO SE PROCESAN NUNCA:
// el orden es estable, asi que son siempre las mismas. Ahora se guarda el
// ultimo id procesado y la proxima invocacion sigue en el que le sigue.
const CRON = "refresh-silver-orders";
//
// Ojo: el cursor por INDICE solo sirve cuando el cron procesa a TODAS las orgs
// en cada vuelta, como este. En un cron que ya saltea las orgs hechas hace poco
// —refresh-product-dimensions, refresh-pixel-name-dict— arrancar siempre de
// cero YA es correcto y autocorrectivo: las stale se hacen, las frescas se
// saltean. Ahi un cursor de indice EMPEORA las cosas, porque puede saltear orgs
// que si necesitan trabajo. Por eso esos dos quedan como estan.

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  // Auth: SÓLO por key. El bypass por `user-agent: vercel-cron` (spoofeable) se
  // quitó (auditoría 2026-07-22): Vercel Cron manda la key en vercel.json.
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Off-switch: corre por DEFAULT (la paridad del backfill ya se verificó en prod,
  // mismatches=0). Se puede apagar seteando SILVER_ORDERS_ENABLED=false en Vercel.
  if (process.env.SILVER_ORDERS_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "SILVER_ORDERS_ENABLED=false (deshabilitado manualmente)" });
  }

  const startedAt = Date.now();
  const full = url.searchParams.get("full") === "1";
  const since = full
    ? "1970-01-01T00:00:00Z"
    : new Date(Date.now() - DAYS_BACK * 86_400_000).toISOString();

  const upsertSql = buildSilverOrdersUpsert();
  const customerFirstsSql = buildCustomerFirstsUpsert();

  // Todas las orgs; el upsert filtra por org+fecha, las que no tienen datos = no-op.
  const orgs = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    // ORDER BY obligatorio: el cursor de E-11 guarda el ULTIMO ID PROCESADO y
    // se reanuda con "el primero mayor que ese". Eso exige orden estable y
    // ascendente; sin ORDER BY, Postgres no lo garantiza.
    `SELECT id FROM organizations ORDER BY id`
  );

  const results: Array<{ org: string; ok: boolean; ms: number; error?: string }> = [];
  let budgetHit = false;
  const ids = orgs.map((o) => o.id);

  // El cursor es SOLO del modo incremental: un `?full=1` no puede arrancar
  // desde donde quedo el cron de cada hora ni pisarle el cursor. La regla vive
  // en `arranqueDeLaVuelta` para no reescribirla en cada route.
  const { desde: arrancoEn, persiste: persisteCursor } = arranqueDeLaVuelta({
    ids,
    cursorGuardado: await ultimoProcesado(CRON),
    cursorExplicito: url.searchParams.get("orgCursor"),
    full,
  });
  let i = arrancoEn;
  for (; i < orgs.length; i++) {
    const { id } = orgs[i];
    if (Date.now() - startedAt > INVOCATION_BUDGET_MS) {
      budgetHit = true;
      break;
    }
    const t = Date.now();
    try {
      await prisma.$executeRawUnsafe(upsertSql, id, since);
      // Dim de primera orden por cliente (tanda 3) — DESPUÉS del upsert de
      // silver_orders (lee de ahí). Resiliente: si la tabla no existe aún,
      // no rompe el refresh de Silver.
      try {
        await prisma.$executeRawUnsafe(customerFirstsSql, id, since);
      } catch {
        /* tabla aún no creada (runbook pendiente) — no-op */
      }
      results.push({ org: id, ok: true, ms: Date.now() - t });
    } catch (e: any) {
      results.push({ org: id, ok: false, ms: Date.now() - t, error: String(e?.message).slice(0, 200) });
    }
  }

  if (persisteCursor) {
    await guardarCorte(CRON, i, ids);
  }

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    mode: full ? "backfill" : "incremental",
    since,
    orgsProcessed: results.length,
    totalOrgs: orgs.length,
    budgetHit,
    cursorPersistido: persisteCursor,
    // Con qué seguir si se cortó por budget. En `?full=1` el cursor no se
    // guarda, así que sin esto no habría forma de retomar el backfill.
    resume: budgetHit ? `?orgCursor=${i}${full ? "&full=1" : ""}` : null,
    // E-11: de donde arranco esta corrida y donde corto. Si budgetHit es true,
    // la proxima invocacion sigue en `cortoEn` en vez de volver a empezar.
    arrancoEn,
    cortoEn: i >= orgs.length ? 0 : i,
    durationMs: Date.now() - startedAt,
    results,
  });
}
