import { describe, it, expect } from "vitest";
import { buildSilverOrdersUpsert } from "@/data/silver/silver-orders-transform";
import {
  createTestDb,
  insertOrder,
  changeOrderStatus,
  rows,
  type Db,
} from "./helpers/pg";

// ══════════════════════════════════════════════════════════════════════════
// El PRIMER test del repo que EJECUTA el SQL de un transform.
// ══════════════════════════════════════════════════════════════════════════
// Los 48 tests de la capa Medallion assertean subcadenas del SQL generado.
// Este corre la query contra Postgres real (PGlite) y mira los NÚMEROS.
//
// Fija el bug B1 (auditoría 2026-07-21): la ventana incremental recortaba por
// `orderDate`, pero el evento que hay que ver —una orden que se cancela— no
// mueve `orderDate` (el webhook lo escribe sólo en el bloque `create`). Una
// cancelación posterior a la ventana no volvía a entrar a Silver nunca, y el
// revenue de Gold sólo podía corregirse hacia arriba.
// ══════════════════════════════════════════════════════════════════════════

const ORG = "org1";
const UPSERT = buildSilverOrdersUpsert();

/** Corre el incremental como el cron: org + "desde hace N días". */
async function runIncremental(db: Db, daysBack: number): Promise<void> {
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();
  await db.query(UPSERT, [ORG, since]);
}

async function silverStatus(db: Db, id: string): Promise<string | undefined> {
  const r = await rows<{ status: string }>(db, `SELECT status FROM silver_orders WHERE id = $1`, [id]);
  return r[0]?.status;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("silver_orders — SQL ejecutado de verdad", () => {
  it("una orden reciente entra con sus valores", async () => {
    const db = await createTestDb();
    await insertOrder(db, { id: "o1", orderDate: daysAgo(1), totalValue: 115000 });
    await runIncremental(db, 3);

    const r = await rows<{ status: string; total_value: string; is_valid: boolean }>(
      db,
      `SELECT status, total_value, is_valid FROM silver_orders WHERE id = 'o1'`
    );
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("APPROVED");
    expect(Number(r[0].total_value)).toBe(115000);
    expect(r[0].is_valid).toBe(true);
  });

  // ── LA REGRESIÓN QUE MOTIVÓ TODO ──────────────────────────────────────────
  it("REGRESIÓN B1: una cancelación 10 días después SÍ llega a Silver", async () => {
    const db = await createTestDb();
    // Orden vieja, válida cuando entró.
    await insertOrder(db, { id: "vieja", orderDate: daysAgo(10), totalValue: 50000 });
    await runIncremental(db, 30); // primer pase: la toma
    expect(await silverStatus(db, "vieja")).toBe("APPROVED");

    // El webhook la cancela HOY. orderDate sigue 10 días atrás.
    await changeOrderStatus(db, "vieja", "CANCELLED", new Date().toISOString());

    // Pase incremental normal, ventana de 3 días.
    await runIncremental(db, 3);

    // Con la ventana vieja (orderDate >= now-3d) esto seguiría en APPROVED:
    // la orden quedó fuera del recorte para siempre y el revenue nunca bajaba.
    expect(await silverStatus(db, "vieja")).toBe("CANCELLED");

    const r = await rows<{ is_valid: boolean }>(
      db,
      `SELECT is_valid FROM silver_orders WHERE id = 'vieja'`
    );
    expect(r[0].is_valid).toBe(false);
  });

  it("la ventana NO arrastra órdenes intocadas fuera de rango (sigue siendo incremental)", async () => {
    const db = await createTestDb();
    await insertOrder(db, {
      id: "quieta",
      orderDate: daysAgo(40),
      updatedAt: daysAgo(40), // nadie la tocó
    });
    await runIncremental(db, 3);
    expect(await silverStatus(db, "quieta")).toBeUndefined();
  });

  it("captura órdenes históricas recién insertadas (colateral del backfill-runner)", async () => {
    const db = await createTestDb();
    // El backfill trae historia vieja: orderDate de hace 2 años, insertada AHORA.
    await insertOrder(db, {
      id: "historica",
      orderDate: daysAgo(700),
      updatedAt: new Date().toISOString(),
    });
    await runIncremental(db, 3);
    // Con la ventana por orderDate nunca habría llegado a Silver.
    expect(await silverStatus(db, "historica")).toBe("APPROVED");
  });

  it("el contrato de orden válida se aplica: totalValue = 0 no es válida", async () => {
    const db = await createTestDb();
    await insertOrder(db, { id: "cero", orderDate: daysAgo(1), totalValue: 0 });
    await runIncremental(db, 3);
    const r = await rows<{ is_valid: boolean }>(
      db,
      `SELECT is_valid FROM silver_orders WHERE id = 'cero'`
    );
    expect(r[0].is_valid).toBe(false);
  });

  it("es idempotente: correrlo dos veces no duplica ni cambia el resultado", async () => {
    const db = await createTestDb();
    await insertOrder(db, { id: "idem", orderDate: daysAgo(1), totalValue: 777 });
    await runIncremental(db, 3);
    await runIncremental(db, 3);
    const r = await rows<{ n: string }>(db, `SELECT COUNT(*)::text n FROM silver_orders`);
    expect(Number(r[0].n)).toBe(1);
  });
});
