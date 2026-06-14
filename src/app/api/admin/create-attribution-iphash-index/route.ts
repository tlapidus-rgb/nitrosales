// @ts-nocheck
// ══════════════════════════════════════════════════════════════════════════
// POST /api/admin/create-attribution-iphash-index?key=<ADMIN_API_KEY>
// ══════════════════════════════════════════════════════════════════════════
// Crea el índice que arregla la lentitud de calculateAttribution (BP-PERF-ATTR).
//
// CAUSA RAÍZ (investigación 2026-06-14): calculateAttribution hace un IP-merge
// (`attribution.ts:248`): `WHERE organizationId AND ipHash IN (...) AND timestamp
// ∈ ventana 31d`. `ipHash` NO tiene índice → Postgres escanea TODOS los eventos
// de la org en 31 días (~2,7M filas para EMDJ) por CADA orden → decenas de
// segundos/orden. Al crecer el volumen, el webhook real-time no alcanza a
// completar la atribución → la cobertura cayó (exactamente lo que reporta el
// cliente: "antes 100%, se degradó con el volumen"). NO es un cambio de lógica
// CORE — es un índice de DB.
//
// El índice (organizationId, ipHash, timestamp) WHERE ipHash IS NOT NULL deja
// que el IP-merge haga seeks directos a los pocos ipHash del visitante (1-3) en
// la ventana → de ~2,7M filas escaneadas a un puñado → sub-segundo/orden.
//
// ── Por qué un cliente Prisma DEDICADO a la conexión directa ────────────────
// `CREATE INDEX CONCURRENTLY` NO puede correr dentro de una transacción
// (error 25001). El `DATABASE_URL` de prod es el `-pooler` de Neon (pgbouncer
// transaction-mode), que envuelve cada statement en una transacción → falla
// (lo vimos con ensure-coherence-indexes). La conexión `DATABASE_URL_UNPOOLED`
// (directa, session-mode) corre en autocommit → CONCURRENTLY funciona y NO
// bloquea los writes del pixel mientras construye.
//
// Idempotente: IF NOT EXISTS. Si un intento previo quedó a medias dejó un índice
// INVÁLIDO (mismo nombre, inusable) → lo dropea y reconstruye.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
// CONCURRENTLY hace 2 pasadas sobre pixel_events (~6M filas) sin lock; puede
// tardar 1-3 min. Margen amplio para que no se corte (un corte deja índice inválido).
export const maxDuration = 800;

const INDEX_NAME = "pixel_events_org_iphash_ts_idx";
const CREATE_SQL =
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}" ` +
  `ON "pixel_events" ("organizationId", "ipHash", "timestamp") ` +
  `WHERE "ipHash" IS NOT NULL`;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const directUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!directUrl) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL_UNPOOLED no está seteada (necesaria para CONCURRENTLY sin pooler)." },
      { status: 500 }
    );
  }

  // Cliente dedicado a la conexión DIRECTA (autocommit) — ver nota arriba.
  const direct = new PrismaClient({ datasourceUrl: directUrl });
  const startedAt = Date.now();
  try {
    // ¿Quedó un índice inválido de un intento interrumpido? IF NOT EXISTS NO lo
    // recrea (el nombre existe) pero está inutilizable → dropearlo primero.
    const invalid: any = await direct.$queryRawUnsafe(
      `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
       WHERE c.relname = $1 AND i.indisvalid = false`,
      INDEX_NAME
    );
    let droppedInvalid = false;
    if (Array.isArray(invalid) && invalid.length > 0) {
      await direct.$executeRawUnsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
      droppedInvalid = true;
    }

    await direct.$executeRawUnsafe(CREATE_SQL);

    // Verificar estado final.
    const check: any = await direct.$queryRawUnsafe(
      `SELECT i.indisvalid AS valid, pg_size_pretty(pg_relation_size(c.oid)) AS size
       FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
       WHERE c.relname = $1`,
      INDEX_NAME
    );

    return NextResponse.json({
      ok: true,
      index: INDEX_NAME,
      droppedInvalid,
      valid: check?.[0]?.valid ?? null,
      size: check?.[0]?.size ?? null,
      ms: Date.now() - startedAt,
      next: "Verificá valid:true. Después: drenar con /api/cron/attribution-reconcile (ahora rápido).",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message, ms: Date.now() - startedAt },
      { status: 500 }
    );
  } finally {
    await direct.$disconnect().catch(() => {});
  }
}
