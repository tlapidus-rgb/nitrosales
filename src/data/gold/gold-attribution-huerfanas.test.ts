import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildGoldAttributionChannelUpsert,
  buildGoldAttributionChannelDeleteOrphans,
} from "./gold-attribution-channel-transform";
import { buildTouchpointChannelCase } from "@/lib/pixel/touchpoint-channel-sql";

// ══════════════════════════════════════════════════════════════════════════
// R-C25 — el revenue de Gold sólo se corregía HACIA ARRIBA
// ══════════════════════════════════════════════════════════════════════════
// De los seis rollups Gold, los dos de atribución eran los únicos que hacían
// `INSERT ... ON CONFLICT DO UPDATE` puro, sin borrar las filas que el upsert ya
// no emite. Los otros cuatro usan `buildDeleteOrphans` (affected-days.ts), y
// `pixel_daily_channel` hace DELETE-then-insert con un comentario que explica
// exactamente este problema.
//
// No era teórico: al 2026-09-06, PIXEL_USE_GOLD, PIXEL_USE_CHANNELS y
// PIXEL_USE_GOLD_CHANNEL estaban los tres en `true` en producción — el panel
// LEÍA estas tablas.
//
// Los dos casos que rompían, reproducidos abajo contra Postgres de verdad:
//   1. Una venta se CANCELA → su bucket ya no se emite → la fila vieja sobrevive
//      con la plata vieja, para siempre.
//   2. Se EDITA una regla de canal → el bucket cambia de nombre → quedan las DOS
//      filas y el revenue de esos días se DUPLICA.
//
// El último bloque cubre lo que hizo que este arreglo NO fuera copiar y pegar:
// la ventana incremental usaba el instante con HORA, así que el día del borde se
// recomputaba parcialmente. Agregar el DELETE sobre eso habría borrado revenue
// REAL. Por eso la ventana ahora se trunca al inicio del día argentino.
// ══════════════════════════════════════════════════════════════════════════

const PASSTHROUGH = buildTouchpointChannelCase([], "tp");

async function nuevaDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.query(`CREATE TABLE orders (
    id text PRIMARY KEY, "organizationId" text, "orderDate" timestamptz,
    "totalValue" numeric, status text, "trafficSource" text, "externalId" text,
    source text, channel text
  )`);
  await db.query(`CREATE TABLE pixel_attributions (
    id text PRIMARY KEY, "orderId" text, "organizationId" text,
    "attributedValue" numeric, "touchpointCount" int, touchpoints jsonb,
    model text, "createdAt" timestamptz
  )`);
  const limpio = readFileSync(
    join(__dirname, "gold-attribution-channel.schema.sql"),
    "utf8"
  ).replace(/--.*$/gm, "");
  for (const stmt of limpio.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
  return db;
}

/** Inserta una orden con su atribución de un solo touchpoint. */
async function venta(
  db: PGlite,
  id: string,
  fechaIso: string,
  valor: number,
  source: string,
  status = "DELIVERED"
) {
  await db.query(
    `INSERT INTO orders (id,"organizationId","orderDate","totalValue",status,"externalId")
     VALUES ($1,'org1',$2::timestamptz,$3,$4,$5)`,
    [id, fechaIso, valor, status, `ext-${id}`]
  );
  await db.query(
    `INSERT INTO pixel_attributions VALUES ($1,$2,'org1',$3,1,$4::jsonb,'NITRO',$5::timestamptz)`,
    [`a-${id}`, id, valor, JSON.stringify([{ source, medium: "cpc" }]), fechaIso]
  );
}

async function correrRollup(db: PGlite, since: string, channelCase = PASSTHROUGH) {
  const [{ now }] = (await db.query<any>(`SELECT now() AS now`)).rows;
  await db.query(buildGoldAttributionChannelUpsert(channelCase), ["org1", since]);
  const del = await db.query(buildGoldAttributionChannelDeleteOrphans(), [
    "org1",
    since,
    now,
  ]);
  return { huerfanasBorradas: del.affectedRows ?? 0 };
}

async function filas(db: PGlite): Promise<Array<{ channel: string; rev: number }>> {
  const r = await db.query<any>(
    `SELECT channel, last_click_revenue::float AS rev
       FROM gold_attribution_channel ORDER BY channel`
  );
  return r.rows;
}

/** Un instante de "hace 2 días", con hora, como el que arma el cron. */
const haceDosDias = () => new Date(Date.now() - 2 * 86_400_000).toISOString();

describe("R-C25 — caso 1: una venta cancelada dejaba la plata vieja viva", () => {
  it("la fila del bucket que ya no existe se borra", async () => {
    const db = await nuevaDb();
    const ayer = new Date(Date.now() - 86_400_000).toISOString();

    // Única venta del bucket (día, tiktok).
    await venta(db, "o1", ayer, 1_200_000, "tiktok");
    await correrRollup(db, haceDosDias());
    expect(await filas(db)).toEqual([{ channel: "tiktok", rev: 1_200_000 }]);

    // El cliente la cancela. Bronze se actualiza…
    await db.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = 'o1'`);

    // …y el rollup vuelve a correr. El upsert ya no emite ese bucket.
    const { huerfanasBorradas } = await correrRollup(db, haceDosDias());

    expect(huerfanasBorradas).toBe(1);
    // ANTES quedaba la fila con 1.200.000 para siempre.
    expect(await filas(db)).toEqual([]);
    await db.close();
  });

  it("una cancelación PARCIAL corrige el monto hacia abajo", async () => {
    const db = await nuevaDb();
    const ayer = new Date(Date.now() - 86_400_000).toISOString();

    await venta(db, "o1", ayer, 1_000_000, "tiktok");
    await venta(db, "o2", ayer, 500_000, "tiktok");
    await correrRollup(db, haceDosDias());
    expect((await filas(db))[0].rev).toBe(1_500_000);

    await db.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = 'o2'`);
    await correrRollup(db, haceDosDias());

    // Este caso el upsert solo YA lo arreglaba (el bucket se re-emite). Se deja
    // el test para que el DELETE nuevo no rompa el camino que andaba bien.
    expect((await filas(db))[0].rev).toBe(1_000_000);
    await db.close();
  });
});

describe("R-C25 — caso 2: editar una regla de canal DUPLICABA el revenue", () => {
  it("el canal viejo no queda conviviendo con el nuevo", async () => {
    const db = await nuevaDb();
    const ayer = new Date(Date.now() - 86_400_000).toISOString();
    await venta(db, "o1", ayer, 800_000, "tiktok");

    const reglaVieja = buildTouchpointChannelCase(
      [
        {
          id: "r1",
          organizationId: "org1",
          priority: 10,
          source: { match: "exact", pattern: "tiktok" },
          channel: "TikTok Ads",
        },
      ],
      "tp"
    );
    await correrRollup(db, haceDosDias(), reglaVieja);
    expect(await filas(db)).toEqual([{ channel: "TikTok Ads", rev: 800_000 }]);

    // Tomy renombra la regla en /pixel/canales.
    const reglaNueva = buildTouchpointChannelCase(
      [
        {
          id: "r1",
          organizationId: "org1",
          priority: 10,
          source: { match: "exact", pattern: "tiktok" },
          channel: "TikTok Paid",
        },
      ],
      "tp"
    );
    const { huerfanasBorradas } = await correrRollup(db, haceDosDias(), reglaNueva);

    // ANTES quedaban las dos filas y el panel mostraba 1.600.000.
    expect(huerfanasBorradas).toBe(1);
    expect(await filas(db)).toEqual([{ channel: "TikTok Paid", rev: 800_000 }]);
    await db.close();
  });
});

describe("por qué la ventana se trunca al día argentino", () => {
  it("NO borra revenue real de una venta anterior a la hora de corte", async () => {
    // Este es el test que impide el arreglo ingenuo. `since` es "hace N días A
    // ESTA HORA". Una venta del MISMO día pero más temprano queda fuera de la
    // ventana si el filtro usa la hora cruda: el upsert no la re-emite y el
    // DELETE la borraría — perdiendo plata que existe.
    const db = await nuevaDb();

    const ahora = Date.now();
    const desde = new Date(ahora - 2 * 86_400_000).toISOString();
    // Mismo día que `desde`, pero 6 horas ANTES de esa hora.
    const masTemprano = new Date(ahora - 2 * 86_400_000 - 6 * 3_600_000).toISOString();

    await venta(db, "o1", masTemprano, 900_000, "google");
    await correrRollup(db, new Date(ahora - 5 * 86_400_000).toISOString());
    expect((await filas(db)).length).toBe(1);

    // Con el truncado al día AR esa venta vuelve a entrar y la fila se re-emite.
    const { huerfanasBorradas } = await correrRollup(db, desde);

    expect(huerfanasBorradas).toBe(0);
    expect(await filas(db)).toEqual([{ channel: "google", rev: 900_000 }]);
    await db.close();
  });

  it("no toca días anteriores a la ventana", async () => {
    const db = await nuevaDb();
    const hace10Dias = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await venta(db, "o-viejo", hace10Dias, 300_000, "email");
    await correrRollup(db, new Date(Date.now() - 30 * 86_400_000).toISOString());
    expect((await filas(db)).length).toBe(1);

    // Ventana corta: el día viejo ni se recomputa ni se borra.
    const { huerfanasBorradas } = await correrRollup(db, haceDosDias());
    expect(huerfanasBorradas).toBe(0);
    expect(await filas(db)).toEqual([{ channel: "email", rev: 300_000 }]);
    await db.close();
  });
});
