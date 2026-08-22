import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// F3.2 — loadOrgChannelCases NUNCA rompe el backfill
// ══════════════════════════════════════════════════════════════════════════
// La garantía "aditiva" de F3.2 (se puede pushear ANTES de correr el DDL de
// channel_rule) descansa en el try/catch de loadOrgChannelCases: si la tabla no
// existe, cae a reglas vacías = passthrough (el canal es el source crudo), sin
// tirar. Acá mockeamos `prisma` para simular la tabla ausente (query que rechaza)
// y verificamos (a) que no throwea y (b) que el CASE que devuelve es SQL VÁLIDO
// que efectivamente hace passthrough. También el camino feliz (con filas).
// ══════════════════════════════════════════════════════════════════════════

// vi.hoisted: el factory de vi.mock corre ANTES de los imports, así que la fn
// espía tiene que existir antes. Así podemos controlar prisma.$queryRawUnsafe.
const { queryRawUnsafe } = vi.hoisted(() => ({ queryRawUnsafe: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: { $queryRawUnsafe: queryRawUnsafe },
}));

import { loadOrgChannelCases, channelCasesFromRules } from "@/lib/pixel/channel-rollup";

async function seedDim(db: PGlite) {
  await db.query(
    `CREATE TABLE d (id int PRIMARY KEY, source_raw text, medium_raw text, campaign_raw text)`
  );
  await db.query(`INSERT INTO d VALUES (1,'gocuotas',NULL,NULL)`);
}

describe("loadOrgChannelCases — resiliencia pre-DDL", () => {
  beforeEach(() => queryRawUnsafe.mockReset());

  it("si channel_rule NO existe (query rechaza), NO throwea y devuelve passthrough", async () => {
    queryRawUnsafe.mockRejectedValueOnce(
      new Error('relation "channel_rule" does not exist')
    );

    const cases = await loadOrgChannelCases("org1"); // no debe tirar
    // Passthrough = exactamente lo que da channelCasesFromRules([]).
    expect(cases).toEqual(channelCasesFromRules([]));

    // Y ese CASE es SQL válido que devuelve el source crudo (passthrough real).
    const db = new PGlite();
    await seedDim(db);
    const res = await db.query<{ ch: string }>(
      `SELECT COALESCE(${cases.channelCase}, 'x') ch FROM d`
    );
    expect(res.rows[0].ch).toBe("gocuotas"); // cae al source crudo, no rompe
    await db.close();
  });

  it("camino feliz: con filas de channel_rule resuelve el canal de la regla", async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: "usr-org1-gocuotas",
        organizationId: "org1",
        priority: 5,
        source_match: "exact",
        source_pattern: "gocuotas",
        medium_match: null,
        medium_pattern: null,
        campaign_match: null,
        campaign_pattern: null,
        channel: "GoCuotas",
        sub_from: null,
      },
    ]);

    const cases = await loadOrgChannelCases("org1");
    const db = new PGlite();
    await seedDim(db);
    const res = await db.query<{ ch: string }>(
      `SELECT COALESCE(${cases.channelCase}, 'x') ch FROM d`
    );
    expect(res.rows[0].ch).toBe("GoCuotas"); // la regla cargada resolvió el canal
    await db.close();
  });
});
