import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $executeRawUnsafe: m.execute } }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => true }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({ getSellerToken: async () => ({ token: "test", mlUserId: 1 }) }));
import { POST } from "@/app/api/admin/ml-force-refresh/route";
let db: PGlite;
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`CREATE TYPE "OrderStatus" AS ENUM ('APPROVED','CANCELLED');
 CREATE TABLE orders ("organizationId" text, source text, "externalId" text, status "OrderStatus", "packId" text, "updatedAt" timestamptz, "externalUpdatedAt" timestamptz);`);
});
afterAll(async () => db.close());
beforeEach(async () => {
 await db.exec(`TRUNCATE orders; INSERT INTO orders VALUES ('org','MELI','1','APPROVED',null,now(),'2026-09-01T00:00:00Z');`);
 m.execute.mockImplementation(async (sql: string, ...args: unknown[]) => (await db.query(sql, args)).affectedRows);
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ id: 1, status: "cancelled", tags: ["delivered"], last_updated: "2026-09-01T00:00:00Z" }], paging: { total: 1 } }))));
});
afterEach(() => vi.unstubAllGlobals());
const run = () => POST(new NextRequest("http://localhost/api/admin/ml-force-refresh", { method: "POST", body: JSON.stringify({ orgId: "org", from: "2026-09-01", to: "2026-09-01" }) }));
it("repairs classification for the exact stored version", async () => {
 expect(await (await run()).json()).toMatchObject({ ok: true, stats: { totalUpdated: 1 } });
 expect((await db.query("SELECT status FROM orders")).rows).toEqual([{ status: "CANCELLED" }]);
});
it.each(["newer", "older", "other-org", "other-source"])("does not reclassify %s rows", async kind => {
 if (kind === "newer") await db.exec(`UPDATE orders SET "externalUpdatedAt"='2026-09-02T00:00:00Z'`);
 if (kind === "older") await db.exec(`UPDATE orders SET "externalUpdatedAt"='2026-08-01T00:00:00Z'`);
 if (kind === "other-org") await db.exec(`UPDATE orders SET "organizationId"='other'`);
 if (kind === "other-source") await db.exec(`UPDATE orders SET source='VTEX'`);
 expect(await (await run()).json()).toMatchObject({ stats: { totalUpdated: 0, totalSkipped: 1 } });
 expect((await db.query("SELECT status FROM orders")).rows).toEqual([{ status: "APPROVED" }]);
});
