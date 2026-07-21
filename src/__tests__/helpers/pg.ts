// ══════════════════════════════════════════════════════════════════════════
// Harness de Postgres REAL para tests (PGlite)
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE (auditoría 2026-07-21):
//   La suite tenía 236 tests verdes y NINGUNO ejecutaba una línea de SQL. Los 48
//   de la capa Medallion son assertions de string sobre el SQL generado: чverifican
//   que el texto CONTENGA ciertas subcadenas, no que la query devuelva los números
//   correctos. Por eso un bug real —los rollups perdieron el `totalValue > 0` del
//   contrato— pasó por debajo de 24 assertions sin que ninguna preguntara "¿y qué
//   devuelve esto?".
//
//   El 2026-07-21 se shippearon TRES bugs en cadena en el mismo cron (query
//   pesada, `pending` mal calculado, loop sin presupuesto). Los tres los encontró
//   la ejecución manual contra prod. Ninguno lo habría encontrado esta suite.
//
// POR QUÉ PGlite Y NO DOCKER:
//   Es Postgres de verdad compilado a WASM: soporta DISTINCT ON, AT TIME ZONE con
//   la base de zonas horarias, FILTER, CTEs y jsonb — todo lo que usan los
//   transforms. Corre dentro de vitest sin daemon ni contenedor, así que el test
//   no depende de que alguien tenga Docker levantado (verificado: en esta máquina
//   el CLI está pero el daemon no corre).
//
// LO QUE ESTE HARNESS NO CUBRE:
//   La extensión `hll` no está disponible, así que los rollups del pixel
//   (pixel_daily_*) no se pueden testear acá. Cubre la rama orders:
//   Bronze → silver_orders → gold_*.
// ══════════════════════════════════════════════════════════════════════════

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

/**
 * Subconjunto de `orders` y sus tablas satélite que tocan los transforms.
 * Es un fixture, no un espejo de schema.prisma: solo las columnas que el SQL
 * bajo prueba realmente lee. `status` va como text (en prod es un enum, y el
 * transform ya castea con `::text`, así que el comportamiento es el mismo).
 */
const BRONZE_DDL = `
CREATE TABLE orders (
  id                 text PRIMARY KEY,
  "organizationId"   text NOT NULL,
  "externalId"       text NOT NULL,
  "orderDate"        timestamptz NOT NULL,
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL,
  "totalValue"       numeric(12,2) NOT NULL,
  currency           text NOT NULL DEFAULT 'ARS',
  "itemCount"        integer NOT NULL DEFAULT 1,
  "packId"           text,
  source             text NOT NULL DEFAULT 'VTEX',
  channel            text,
  "trafficSource"    text,
  "deviceType"       text,
  "customerId"       text,
  "shippingCost"     numeric(12,2),
  "discountValue"    numeric(12,2),
  "marketplaceFee"   numeric(12,2),
  "realShippingCost" numeric(12,2),
  "deliveryType"     text,
  "shippingCarrier"  text,
  "paymentMethod"    text
);

CREATE TABLE pixel_attributions (
  id           text PRIMARY KEY,
  "orderId"    text,
  "visitorId"  text,
  touchpoints  jsonb,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pixel_visitors (
  id             text PRIMARY KEY,
  "deviceTypes"  text[] DEFAULT '{}'
);
`;

export type Db = PGlite;

/** Base nueva por test: schema real de Silver + fixture de Bronze. */
export async function createTestDb(): Promise<Db> {
  const db = await PGlite.create();
  await db.exec(BRONZE_DDL);
  // El schema REAL del repo, no una copia. Si el transform y el schema divergen,
  // el test lo detecta acá en vez de en prod.
  await db.exec(readFileSync(join(ROOT, "src/data/silver/silver-orders.schema.sql"), "utf8"));
  return db;
}

export interface OrderFixture {
  id: string;
  org?: string;
  orderDate: string;
  /** Cuándo se tocó la fila por última vez. Clave para la ventana incremental. */
  updatedAt?: string;
  status?: string;
  totalValue?: number;
  source?: string;
}

export async function insertOrder(db: Db, o: OrderFixture): Promise<void> {
  await db.query(
    `INSERT INTO orders (id, "organizationId", "externalId", "orderDate", "updatedAt",
       status, "totalValue", currency, "itemCount", source)
     VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,'ARS',1,$8)`,
    [
      o.id,
      o.org ?? "org1",
      `ext-${o.id}`,
      o.orderDate,
      o.updatedAt ?? o.orderDate,
      o.status ?? "APPROVED",
      o.totalValue ?? 1000,
      o.source ?? "VTEX",
    ]
  );
}

/** Cambia el estado como lo hace el webhook: toca `updatedAt`, NUNCA `orderDate`. */
export async function changeOrderStatus(
  db: Db,
  id: string,
  status: string,
  updatedAt: string
): Promise<void> {
  await db.query(
    `UPDATE orders SET status = $2, "updatedAt" = $3::timestamptz WHERE id = $1`,
    [id, status, updatedAt]
  );
}

export async function rows<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}
