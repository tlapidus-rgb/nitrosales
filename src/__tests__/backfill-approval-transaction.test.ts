import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), connections: vi.fn(), email: vi.fn(), wait: vi.fn(), failMl: false }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query, $transaction: m.transaction, connection: { findMany: m.connections } } }));
vi.mock("@/lib/admin-key", () => ({ ADMIN_API_KEY: "test" }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => true }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.email }));
vi.mock("@/lib/onboarding/emails", () => ({ backfillStartedEmailActive: async () => ({ subject: "test", html: "test" }) }));
vi.mock("@vercel/functions", () => ({ waitUntil: m.wait }));
import { POST } from "@/app/api/admin/onboardings/[id]/approve-backfill/route";
let db: PGlite;
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`CREATE TYPE "OnboardingStatus" AS ENUM ('NEEDS_INFO','BACKFILLING');
 CREATE TABLE organizations (id text PRIMARY KEY);
 CREATE TABLE onboarding_requests (id text PRIMARY KEY, "createdOrgId" text, status "OnboardingStatus", "historyVtexMonths" int, "historyMlMonths" int, "progressStage" text, "updatedAt" timestamptz);
 CREATE TABLE connections (id text PRIMARY KEY, platform text, status text, credentials jsonb);
 CREATE TABLE backfill_jobs (id text PRIMARY KEY, "organizationId" text, platform text, status text, "monthsRequested" int, "fromDate" timestamptz, "toDate" timestamptz, "onboardingRequestId" text);`);
});
afterAll(async () => db.close());
beforeEach(async () => {
 vi.clearAllMocks(); m.failMl = false; vi.spyOn(console, "error").mockImplementation(() => {});
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 })); m.email.mockResolvedValue({ ok: true });
 await db.exec(`TRUNCATE organizations,onboarding_requests,connections,backfill_jobs;
 INSERT INTO organizations VALUES ('org'); INSERT INTO onboarding_requests (id,"createdOrgId",status,"historyVtexMonths","historyMlMonths") VALUES ('onboarding','org','NEEDS_INFO',12,12);
 INSERT INTO connections VALUES ('vtex','VTEX','PENDING','{}'), ('ml','MERCADOLIBRE','PENDING','{"accessToken":"fake","mlUserId":"123"}');`);
 m.query.mockImplementation(async (sql: string, ...args: unknown[]) => (await db.query(sql, args)).rows);
 m.connections.mockImplementation(async () => (await db.query("SELECT * FROM connections")).rows);
 m.transaction.mockImplementation(async callback => db.transaction(async tx => callback({
  $queryRawUnsafe: async (sql: string, ...args: unknown[]) => (await tx.query(sql, args)).rows,
  $executeRawUnsafe: async (sql: string, ...args: unknown[]) => {
   if (m.failMl && sql.includes("INSERT INTO") && args[2] === "MERCADOLIBRE") throw new Error("simulated second insert failure");
   return (await tx.query(sql, args)).affectedRows;
  },
  connection: { update: async ({ where, data }: any) => tx.query("UPDATE connections SET status=$2 WHERE id=$1", [where.id, data.status]) },
 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const run = (platforms?: string[]) => POST(new NextRequest("https://test.invalid/api", { method: "POST", body: JSON.stringify({ platforms }) }), { params: Promise.resolve({ id: "onboarding" }) });
it("rolls back connections and the first job if the second insert fails", async () => {
 m.failMl = true; expect((await run()).status).toBe(500);
 expect((await db.query("SELECT * FROM backfill_jobs")).rows).toEqual([]);
 expect((await db.query<any>("SELECT status FROM connections")).rows.every(r => r.status === "PENDING")).toBe(true);
 expect((await db.query<any>("SELECT status FROM onboarding_requests")).rows[0].status).toBe("NEEDS_INFO");
 expect(m.email).not.toHaveBeenCalled(); expect(m.wait).not.toHaveBeenCalled();
});
it("commits only selected connections/jobs and rejects a repeated approval", async () => {
 expect((await run(["VTEX"])).status).toBe(200);
 expect((await db.query<any>("SELECT platform FROM backfill_jobs")).rows).toEqual([{ platform: "VTEX" }]);
 expect((await db.query<any>("SELECT status FROM connections WHERE id='ml'")).rows[0].status).toBe("PENDING");
 expect((await run(["VTEX"])).status).toBe(409);
 expect(m.email).toHaveBeenCalledTimes(1);
});
it("does not create MercadoLibre jobs without OAuth tokens", async () => {
 await db.exec("UPDATE connections SET credentials='{}' WHERE id='ml'");
 expect((await run(["MERCADOLIBRE"])).status).toBe(409);
 expect(m.transaction).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
});
it.each([{ platforms: [] }, { platforms: ["UNKNOWN"] }, { platforms: [""] }])("does not expand an invalid explicit selection to all connections: %j", async ({ platforms }) => {
 expect((await run(platforms)).status).toBe(400);
 expect(m.transaction).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
});
