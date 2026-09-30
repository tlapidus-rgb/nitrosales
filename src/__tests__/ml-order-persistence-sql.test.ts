import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// persistMlOrder — una notificación vieja no puede pisar una orden más nueva
// ══════════════════════════════════════════════════════════════════════════
// MELI no garantiza el orden de entrega: webhook, reconcile, missed_feeds y
// backfill pueden traer la MISMA orden en versiones distintas, y la vieja puede
// llegar última. Lo único que lo impide es el WHERE del `ON CONFLICT DO UPDATE`:
// sólo se pisa si `externalUpdatedAt` guardado es MENOR que el entrante.
//
// Todos los tests de ingesta mockean `persistMlOrder`, así que ninguno ejecutaba
// ese WHERE: se podía borrar y la suite seguía verde. Acá corre el SQL REAL del
// módulo contra Postgres de verdad (PGlite), con una tabla `orders` mínima: sólo
// las columnas que toca el upsert, más el UNIQUE que usa el ON CONFLICT.
// ══════════════════════════════════════════════════════════════════════════

const db = vi.hoisted(() => ({ pg: null as unknown as import("@electric-sql/pglite").PGlite }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    // Prisma y PGlite usan los mismos placeholders ($1, $2…): se reenvía tal cual.
    $queryRawUnsafe: async (sql: string, ...params: unknown[]) => (await db.pg.query(sql, params)).rows,
  },
}));
import { persistMlOrder } from "@/lib/connectors/ml-order-persistence";

const ESQUEMA = `
CREATE TYPE "OrderStatus" AS ENUM ('PENDING','APPROVED','INVOICED','SHIPPED','DELIVERED','CANCELLED','RETURNED');
CREATE TABLE orders (
  id                        text PRIMARY KEY,
  "externalId"              text NOT NULL,
  "packId"                  text,
  status                    "OrderStatus" NOT NULL,
  "totalValue"              numeric(12,2) NOT NULL,
  currency                  text NOT NULL,
  "itemCount"               integer NOT NULL,
  source                    text NOT NULL,
  "paymentMethod"           text,
  "marketplaceFee"          numeric(12,2),
  "orderDate"               timestamptz NOT NULL,
  "externalUpdatedAt"       timestamptz,
  "backfillEnrichedVersion" timestamptz,
  "organizationId"          text NOT NULL,
  "createdAt"               timestamptz NOT NULL,
  "updatedAt"               timestamptz NOT NULL,
  UNIQUE ("organizationId", "externalId")
)`;

const CREADA = "2026-09-01T10:00:00.000Z";
const VIEJA = "2026-09-02T10:00:00.000Z";
const NUEVA = "2026-09-03T10:00:00.000Z";

/** Payload como lo manda /orders/{id} de MELI, con sólo lo que lee el upsert. */
function payload(lastUpdated: string, total: number) {
  return {
    id: 777, status: "paid", total_amount: total, currency_id: "ARS",
    date_created: CREADA, last_updated: lastUpdated,
    order_items: [{ quantity: 1, sale_fee: 10 }], payments: [{ payment_method_id: "visa" }],
  };
}

async function fila() {
  const r = await db.pg.query<any>(
    `SELECT status::text AS status, "totalValue"::float8 AS total, "externalUpdatedAt",
            "backfillEnrichedVersion" FROM orders WHERE "externalId" = '777'`,
  );
  return r.rows[0];
}

beforeAll(async () => {
  db.pg = await PGlite.create();
  await db.pg.exec(ESQUEMA);
});
afterAll(async () => { await db.pg.close(); });
beforeEach(async () => {
  await db.pg.exec("TRUNCATE orders");
  // Estado de partida: la versión NUEVA ya está guardada (cancelada, $1500) y
  // con su enriquecimiento confirmado para esa misma versión.
  await db.pg.query(
    `INSERT INTO orders (id, "externalId", status, "totalValue", currency, "itemCount", source,
       "orderDate", "externalUpdatedAt", "backfillEnrichedVersion", "organizationId", "createdAt", "updatedAt")
     VALUES ('db-1', '777', 'CANCELLED', 1500, 'ARS', 1, 'MELI', $1, $2, $2, 'org', now(), now())`,
    [CREADA, NUEVA],
  );
});

describe("persistMlOrder contra Postgres real", () => {
  it("no deja que una notificación más vieja pise estado ni total de la orden guardada", async () => {
    const r = await persistMlOrder("org", payload(VIEJA, 999), "APPROVED");
    expect(r).toEqual({ action: "skipped", dbOrderId: null });
    const guardada = await fila();
    expect(guardada.status).toBe("CANCELLED");
    expect(guardada.total).toBe(1500);
    expect(new Date(guardada.externalUpdatedAt).toISOString()).toBe(NUEVA);
    // Tampoco invalida el enriquecimiento de la versión vigente.
    expect(new Date(guardada.backfillEnrichedVersion).toISOString()).toBe(NUEVA);
  });

  it("sí aplica una versión más nueva (el guard no es un bloqueo total)", async () => {
    const MAS_NUEVA = "2026-09-04T10:00:00.000Z";
    const r = await persistMlOrder("org", payload(MAS_NUEVA, 2000), "DELIVERED");
    expect(r).toEqual({ action: "updated", dbOrderId: "db-1" });
    const guardada = await fila();
    expect(guardada.status).toBe("DELIVERED");
    expect(guardada.total).toBe(2000);
    expect(new Date(guardada.externalUpdatedAt).toISOString()).toBe(MAS_NUEVA);
    // El detalle de la versión anterior ya no vale: hay que reenriquecer.
    expect(guardada.backfillEnrichedVersion).toBeNull();
  });
});
