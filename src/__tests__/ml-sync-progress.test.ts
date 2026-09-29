import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const m = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute } }));
import { claimMlSync, saveMlSync, orderMlConnections } from "@/lib/connectors/ml-sync-progress";
let db: PGlite;
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec("CREATE TABLE organizations (id text PRIMARY KEY); INSERT INTO organizations VALUES ('a'),('b');");
 const sql = readFileSync("prisma/migrations/ml_sync_progress.sql", "utf8");
 await db.exec(sql); await db.exec(sql);
});
afterAll(async () => db.close());
beforeEach(async () => {
 await db.exec("TRUNCATE ml_sync_progress");
 m.query.mockImplementation(async (sql: string, ...params: unknown[]) => (await db.query(sql, params)).rows);
 m.execute.mockImplementation(async (sql: string, ...params: unknown[]) => (await db.query(sql, params)).affectedRows);
});
it("does not allow a second active claim", async () => {
 expect(await claimMlSync("a")).not.toBeNull(); expect(await claimMlSync("a")).toBeNull();
});
it("resumes a persisted cursor with the original bounds", async () => {
 const first = (await claimMlSync("a"))!;
 expect(await saveMlSync(first, { itemsProcessed: 50, newCursor: { offset: 50 }, isComplete: false })).toBe(true);
 const next = (await claimMlSync("a"))!;
 expect(next.cursor).toEqual({ offset: 50 });
 expect(next.fromDate).toEqual(first.fromDate); expect(next.toDate).toEqual(first.toDate);
 expect(next.leaseToken).not.toEqual(first.leaseToken);
});
it("rejects stale workers after an expired lease is reclaimed", async () => {
 const old = (await claimMlSync("a"))!;
 await db.exec(`UPDATE ml_sync_progress SET "leaseUntil"=now()-interval '1 second'`);
 const next = (await claimMlSync("a"))!;
 expect(await saveMlSync(old, { itemsProcessed: 1, newCursor: {}, isComplete: true })).toBe(false);
 expect(await saveMlSync(next, { itemsProcessed: 1, newCursor: { offset: 50 }, isComplete: false })).toBe(true);
});
it("recovers the initial cursor after process death before checkpoint", async () => {
 const old = (await claimMlSync("a"))!;
 await db.exec(`UPDATE ml_sync_progress SET "leaseUntil"=now()-interval '1 second'`);
 const recovered = (await claimMlSync("a"))!;
 expect(recovered.cursor).toEqual({}); expect(recovered.toDate).toEqual(old.toDate);
});
it("does not turn a failed chunk into completed coverage", async () => {
 const claim = (await claimMlSync("a"))!;
 await saveMlSync(claim, { itemsProcessed: 0, newCursor: { offset: 0 }, isComplete: true, error: "failure" });
 expect((await db.query(`SELECT "completedThrough", cursor FROM ml_sync_progress`)).rows).toEqual([{ completedThrough: null, cursor: { offset: 0 } }]);
});
it("starts subsequent coverage from the completed boundary with overlap", async () => {
 const old = (await claimMlSync("a"))!;
 await saveMlSync(old, { itemsProcessed: 1, newCursor: {}, isComplete: true });
 const next = (await claimMlSync("a"))!;
 expect(next.fromDate.getTime()).toBe(old.toDate.getTime() - 72 * 3600000);
 expect(next.cursor).toEqual({});
});
it("prioritizes untouched organizations over a recently failed heavy organization", async () => {
 await claimMlSync("a");
 const rows = [{ id: "first", organizationId: "a" }, { id: "second", organizationId: "b" }];
 expect((await orderMlConnections(rows)).map(c => c.organizationId)).toEqual(["b", "a"]);
});
it("cannot checkpoint under another organization", async () => {
 const claim = (await claimMlSync("a"))!;
 expect(await saveMlSync({ ...claim, organizationId: "b" }, { itemsProcessed: 1, newCursor: {}, isComplete: true })).toBe(false);
});
