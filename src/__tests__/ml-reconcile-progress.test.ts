import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const m = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute } }));
import { claimReconcile, checkpointReconcile, completeReconcile } from "@/lib/connectors/ml-reconcile-progress";
let db: PGlite;
const from = new Date("2020-01-01"), to = new Date("2026-09-01");
const claim = (org = "a", layer: "incremental" | "deep" = "incremental") => claimReconcile(org,layer,from,to);
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`CREATE TABLE organizations (id text PRIMARY KEY); INSERT INTO organizations VALUES ('a'),('b');
 CREATE TABLE sync_watermarks ("organizationId" text,platform text,"syncLayer" text,"lastSuccessfulSyncAt" timestamptz,
 "lastRunAt" timestamptz,"lastRunStatus" text,metadata jsonb,"updatedAt" timestamptz,
 PRIMARY KEY("organizationId",platform,"syncLayer"));`);
 const sql = readFileSync("prisma/migrations/ml_reconcile_progress.sql","utf8");
 await db.exec(sql); await db.exec(sql);
});
afterAll(async () => db.close());
beforeEach(async () => {
 await db.exec("TRUNCATE ml_reconcile_progress, sync_watermarks");
 m.query.mockImplementation(async (sql: string,...params: unknown[]) => (await db.query(sql,params)).rows);
 m.execute.mockImplementation(async (sql: string,...params: unknown[]) => (await db.query(sql,params)).affectedRows);
});
it("excludes another worker while isolating organization and layer", async () => {
 expect(await claim()).not.toBeNull(); expect(await claim()).toBeNull();
 expect(await claim("b")).not.toBeNull(); expect(await claim("a","deep")).not.toBeNull();
});
it("resumes a page and pending split windows with original time bounds", async () => {
 const first = (await claim())!;
 const windows = [{ from: from.getTime(),to: to.getTime(),offset: 50,total: 91 }];
 expect(await checkpointReconcile(first,windows,true)).toBe(true);
 const next = (await claimReconcile("a","incremental",new Date(),new Date()))!;
 expect(next.cursor).toEqual(windows); expect(next.toDate).toEqual(to);
 expect(next.leaseToken).not.toEqual(first.leaseToken);
});
it("retains progress after process death and rejects stale ownership", async () => {
 const old = (await claim())!;
 const windows = [{ ...old.cursor[0],offset: 50 }];
 await checkpointReconcile(old,windows);
 await db.exec(`UPDATE ml_reconcile_progress SET "leaseUntil"=now()-interval '1 second'`);
 const fresh = (await claim())!;
 expect(fresh.cursor).toEqual(windows);
 expect(await checkpointReconcile(old,[])).toBe(false);
 expect(await completeReconcile(old,{})).toBe(false);
 expect(await checkpointReconcile(fresh,[])).toBe(true);
 expect(await completeReconcile(fresh,{})).toBe(true);
});
it("cannot publish a watermark until all windows have been checkpointed", async () => {
 const c = (await claim())!;
 expect(await completeReconcile(c,{})).toBe(false);
 expect((await db.query("SELECT * FROM sync_watermarks")).rows).toEqual([]);
 await checkpointReconcile(c,[]);
 expect(await completeReconcile(c,{ fetched: 50 })).toBe(true);
 const row = (await db.query<any>("SELECT * FROM sync_watermarks")).rows[0];
 expect(row.lastSuccessfulSyncAt).toEqual(to); expect(row.metadata).toEqual({ fetched: 50 });
 expect(await completeReconcile(c,{})).toBe(false);
});
it("rolls back cursor completion if watermark publication fails", async () => {
 const c = (await claim())!; await checkpointReconcile(c,[]);
 await db.exec(`ALTER TABLE sync_watermarks ADD CONSTRAINT reject_test CHECK (platform <> 'MERCADOLIBRE')`);
 try { await expect(completeReconcile(c,{})).rejects.toThrow(); }
 finally { await db.exec("ALTER TABLE sync_watermarks DROP CONSTRAINT reject_test"); }
 expect((await db.query<any>("SELECT cursor FROM ml_reconcile_progress")).rows[0].cursor).toEqual([]);
 expect(await completeReconcile(c,{})).toBe(true);
});
it("does not regress a newer watermark", async () => {
 const newer = new Date("2026-09-28");
 await db.query(`INSERT INTO sync_watermarks ("organizationId",platform,"syncLayer","lastSuccessfulSyncAt") VALUES ('a','MERCADOLIBRE','incremental',$1)`,[newer]);
 const c = (await claim())!; await checkpointReconcile(c,[]); await completeReconcile(c,{});
 expect((await db.query<any>("SELECT * FROM sync_watermarks")).rows[0].lastSuccessfulSyncAt).toEqual(newer);
});
it("does not allow a different organization or layer to save a claim", async () => {
 const c = (await claim())!;
 expect(await checkpointReconcile({ ...c,organizationId: "b" },[])).toBe(false);
 expect(await checkpointReconcile({ ...c,layer: "deep" },[])).toBe(false);
});
it("starts a fresh scan after completion using the caller's next boundary", async () => {
 const c = (await claim())!; await checkpointReconcile(c,[]); await completeReconcile(c,{});
 const nextFrom = new Date(to.getTime()-300000), nextTo = new Date("2026-09-29");
 const next = (await claimReconcile("a","incremental",nextFrom,nextTo))!;
 expect(next.cursor).toEqual([{ from: nextFrom.getTime(),to: nextTo.getTime(),offset: 0 }]);
 expect(next.toDate).toEqual(nextTo);
});
