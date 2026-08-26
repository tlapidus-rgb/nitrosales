import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { touchpointSourceCase } from "@/lib/pixel/touchpoint-source-sql";
import { buildTouchpointChannelCase } from "@/lib/pixel/touchpoint-channel-sql";
import { SEED_CHANNEL_RULES } from "@/lib/pixel/channel-rules";

// ══════════════════════════════════════════════════════════════════════════
// Paridad de REVENUE: agrupar por CANAL == agrupar por source (mismo total)
// ══════════════════════════════════════════════════════════════════════════
// El cambio del serve (flag PIXEL_USE_CHANNELS) solo re-agrupa la MISMA plata ya
// atribuida: de "por source" a "por canal". Este test prueba, sobre touchpoints
// sintéticos, que el total de revenue es IDÉNTICO en las dos agrupaciones — o sea
// no se pierde ni se duplica plata. También ejercita que el CASE de canal es SQL
// válido sobre JSONB de touchpoints.
// ══════════════════════════════════════════════════════════════════════════

describe("serve channel wiring — paridad de revenue total (source vs canal)", () => {
  it("el total de revenue no cambia al re-agrupar por canal", async () => {
    const db = new PGlite();
    // Cada fila = un touchpoint con su revenue atribuido (como en el serve tras
    // desanidar pa.touchpoints). Variedad: pago, orgánico, pasarela, app móvil,
    // desconocido, vacío/null.
    await db.query(`CREATE TABLE tp_rev (id int PRIMARY KEY, tp jsonb, revenue float8)`);
    const filas = [
      { tp: { source: "adwords", medium: "cpc" }, revenue: 1000.5 },
      { tp: { source: "fb", medium: "paid" }, revenue: 250.25 },
      { tp: { source: "meta", medium: "paid" }, revenue: 99.99 },
      { tp: { source: "google", medium: "organic" }, revenue: 500 },
      { tp: { source: "gocuotas" }, revenue: 42 },
      { tp: { source: "instagram", medium: "social" }, revenue: 17.5 }, // app móvil
      { tp: { source: "cross", medium: "x" }, revenue: 8.1 }, // passthrough
      { tp: { source: "" }, revenue: 3.3 }, // → direct
      { tp: { source: null }, revenue: 1.1 }, // → direct
    ];
    for (let i = 0; i < filas.length; i++) {
      await db.query(`INSERT INTO tp_rev VALUES ($1, $2::jsonb, $3)`, [
        i,
        JSON.stringify(filas[i].tp),
        filas[i].revenue,
      ]);
    }
    const total = filas.reduce((a, f) => a + f.revenue, 0);

    const sourceCase = touchpointSourceCase("tp"); // agrupación actual (source)
    const channelCase = buildTouchpointChannelCase(SEED_CHANNEL_RULES, "tp"); // nueva (canal)

    // Suma de los subtotales por grupo, en cada agrupación.
    const bySource = await db.query<{ t: number }>(
      `SELECT SUM(s)::float8 t FROM (SELECT (${sourceCase}) g, SUM(revenue) s FROM tp_rev GROUP BY 1) x`
    );
    const byChannel = await db.query<{ t: number }>(
      `SELECT SUM(s)::float8 t FROM (SELECT (${channelCase}) g, SUM(revenue) s FROM tp_rev GROUP BY 1) x`
    );

    // Ninguna agrupación pierde plata: ambas == el total.
    expect(Number(bySource.rows[0].t)).toBeCloseTo(total, 6);
    expect(Number(byChannel.rows[0].t)).toBeCloseTo(total, 6);
    expect(Number(byChannel.rows[0].t)).toBeCloseTo(Number(bySource.rows[0].t), 6);
    await db.close();
  });

  it("ningún touchpoint queda sin canal (el CASE nunca devuelve NULL)", async () => {
    const db = new PGlite();
    await db.query(`CREATE TABLE tp_rev (id int PRIMARY KEY, tp jsonb)`);
    await db.query(
      `INSERT INTO tp_rev VALUES (1,'{"source":"cualquier_cosa_rara"}'::jsonb),(2,'{}'::jsonb),(3,'{"source":null}'::jsonb)`
    );
    const channelCase = buildTouchpointChannelCase(SEED_CHANNEL_RULES, "tp");
    const res = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int n FROM tp_rev WHERE (${channelCase}) IS NULL`
    );
    expect(res.rows[0].n).toBe(0); // todo touchpoint cae en un canal (peor caso: passthrough)
    await db.close();
  });
});
