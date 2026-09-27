import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $executeRawUnsafe: m.execute } }));
import { RECLAMAR_PROXIMO_JOB_SQL, updateJobProgress, completeJob, failJob, forceCompleteJob, MATAR_JOBS_SIN_PROGRESO_SQL } from "./job-manager";
let db: PGlite;
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`CREATE TABLE backfill_jobs (id text PRIMARY KEY, status text, "startedAt" timestamptz, "updatedAt" timestamptz,
 "createdAt" timestamptz DEFAULT now(), "lastChunkAt" timestamptz, "completedAt" timestamptz, cursor jsonb,
 "processedCount" int DEFAULT 0, "progressPct" int DEFAULT 0, "totalEstimate" int, "lastError" text, "onboardingRequestId" text);`);
 const migration = readFileSync("prisma/migrations/backfill_job_lease.sql", "utf8");
 await db.exec(migration); await db.exec(migration);
});
afterAll(async () => db.close());
beforeEach(async () => {
 await db.exec(`TRUNCATE backfill_jobs; INSERT INTO backfill_jobs (id,status,"onboardingRequestId") VALUES ('job','QUEUED','onboarding');`);
 m.execute.mockImplementation(async (sql: string, ...args: unknown[]) => (await db.query(sql, args)).affectedRows);
});
const claim = async () => (await db.query<any>(RECLAMAR_PROXIMO_JOB_SQL, [new Date(Date.now() - 360000), 1])).rows[0];
const get = async () => (await db.query<any>(`SELECT * FROM backfill_jobs WHERE id='job'`)).rows[0];
it("changes owner on recovery and rejects all old-owner writes", async () => {
 const first = await claim();
 expect(first.leaseToken).toBeTruthy();
 await db.exec(`UPDATE backfill_jobs SET "updatedAt" = now() - interval '10 minutes'`);
 const second = await claim();
 expect(second.leaseToken).not.toBe(first.leaseToken);
 expect(await updateJobProgress("job", { cursor: { page: 1 }, processedCount: 9, lastError: "old" }, { leaseToken: first.leaseToken })).toBe(false);
 expect(await completeJob("job", first.leaseToken)).toBe(false);
 expect(await failJob("job", "late failure", first.leaseToken)).toBe(false);
 expect(await updateJobProgress("job", { cursor: { page: 2 }, processedCount: 20 }, { leaseToken: second.leaseToken })).toBe(true);
 expect(await get()).toMatchObject({ status: "RUNNING", processedCount: 20, cursor: { page: 2 }, lastError: null });
 expect(await completeJob("job", second.leaseToken)).toBe(true);
 expect(await get()).toMatchObject({ status: "COMPLETED", leaseToken: null });
});
it("cannot revive a job failed by the reaper", async () => {
 const owner = await claim();
 await db.exec(`UPDATE backfill_jobs SET "startedAt" = now() - interval '1 hour'`);
 await db.query(MATAR_JOBS_SIN_PROGRESO_SQL, [new Date(Date.now() - 1800000), 30]);
 expect(await updateJobProgress("job", { processedCount: 50 }, { leaseToken: owner.leaseToken })).toBe(false);
 expect(await completeJob("job", owner.leaseToken)).toBe(false);
 expect((await get()).status).toBe("FAILED");
});
it("staff override is tenant-scoped and fences an in-flight worker", async () => {
 const owner = await claim();
 expect(await forceCompleteJob("job", "another-onboarding")).toBe(false);
 expect(await forceCompleteJob("job", "onboarding")).toBe(true);
 expect(await updateJobProgress("job", { processedCount: 50 }, { leaseToken: owner.leaseToken })).toBe(false);
 expect(await forceCompleteJob("job", "onboarding")).toBe(false);
});
it("persists error and cursor together without falsely refreshing progress", async () => {
 const owner = await claim();
 expect(await updateJobProgress("job", { cursor: { page: 2 }, lastError: "timeout" }, { leaseToken: owner.leaseToken, tocarLatido: false })).toBe(true);
 expect(await get()).toMatchObject({ cursor: { page: 2 }, lastError: "timeout", lastChunkAt: null });
 expect(await updateJobProgress("job", { lastError: null }, { leaseToken: owner.leaseToken })).toBe(true);
 expect((await get()).lastChunkAt).not.toBeNull();
});
it("rejects missing ownership without a write", async () => {
 m.execute.mockClear();
 expect(await completeJob("job", "")).toBe(false);
 expect(await failJob("job", "error", "")).toBe(false);
 expect(await updateJobProgress("job", {}, { leaseToken: "" })).toBe(false);
 expect(m.execute).not.toHaveBeenCalled();
});
