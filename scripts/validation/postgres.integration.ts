import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/lib/db/client", () => ({ prisma: new Proxy({}, { get: (_t,key) => {
 const value = holder.db[key]; return typeof value === "function" ? value.bind(holder.db) : value;
} }) }));
import { reclamarProximoJob, updateJobProgress, completeJob } from "@/lib/backfill/job-manager";
import { claimMlSync, saveMlSync } from "@/lib/connectors/ml-sync-progress";
import { claimReconcile, checkpointReconcile, completeReconcile } from "@/lib/connectors/ml-reconcile-progress";

// Deliberately no DATABASE_URL/environment override: only the disposable local DB.
const base = "postgresql://postgres:synthetic-local-only@127.0.0.1:15439/expansion_test";
const schema = "expansion_validation_"+randomUUID().replaceAll("-","");
const admin = new PrismaClient({ datasources: { db: { url: base } } });
const db = new PrismaClient({ datasources: { db: { url: base+"?schema="+schema+"&connection_limit=8" } } });
async function sqlBatch(sql: string) {
 for (const statement of sql.replace(/--[^\n]*/g,"").split(";").map(x=>x.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
}
beforeAll(async () => {
 if (process.env.EXPANSION_LOCAL_POSTGRES !== "1") throw new Error("Set EXPANSION_LOCAL_POSTGRES=1 to explicitly enable the disposable local database tests");
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); holder.db = db;
 await sqlBatch(`CREATE TABLE organizations (id text PRIMARY KEY);
 INSERT INTO organizations VALUES ('a'),('b');
 CREATE TABLE orders (id text PRIMARY KEY);
 CREATE TABLE backfill_jobs (id text PRIMARY KEY,status text,"startedAt" timestamptz,"updatedAt" timestamptz,
 "createdAt" timestamptz DEFAULT now(),"lastChunkAt" timestamptz,"completedAt" timestamptz,cursor jsonb,
 "processedCount" int DEFAULT 0,"progressPct" int DEFAULT 0,"totalEstimate" int,"lastError" text,"onboardingRequestId" text);
 CREATE TABLE sync_watermarks ("organizationId" text,platform text,"syncLayer" text,"lastSuccessfulSyncAt" timestamptz,
 "lastRunAt" timestamptz,"lastRunStatus" text,metadata jsonb,"updatedAt" timestamptz,
 PRIMARY KEY("organizationId",platform,"syncLayer"));`);
 for (let n=0;n<2;n++) for (const migration of ["backfill_job_lease","backfill_enrichment_version","ml_sync_progress","ml_reconcile_progress","creator_password_attempts"])
   await sqlBatch(readFileSync(`prisma/migrations/${migration}.sql`,"utf8"));
});
afterAll(async () => {
 await db.$disconnect();
 // Only the random schema created above in the fixed disposable database.
 if (process.env.EXPANSION_LOCAL_POSTGRES === "1" && /^expansion_validation_[a-f0-9]{32}$/.test(schema))
   await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
 await admin.$disconnect();
});
beforeEach(async () => {
 await db.$executeRawUnsafe("TRUNCATE backfill_jobs,ml_sync_progress,ml_reconcile_progress,sync_watermarks");
});
it("uses genuinely distinct PostgreSQL backends for concurrent transactions", async () => {
 let release!: () => void; const barrier = new Promise<void>(r => { release=r; }); const pids: number[]=[];
 const worker = () => db.$transaction(async tx => {
  const [row] = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
  pids.push(row.pid); if(pids.length===2)release(); await barrier;
 });
 await Promise.all([worker(),worker()]); expect(new Set(pids).size).toBe(2);
});
it("applies all five migrations twice in real PostgreSQL", async () => {
 const columns = await db.$queryRawUnsafe<Array<{ column_name: string }>>(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND ((table_name='orders' AND column_name='backfillEnrichedVersion') OR (table_name='backfill_jobs' AND column_name='leaseToken'))`,schema);
 expect(columns).toHaveLength(2);
 const [attempts] = await db.$queryRawUnsafe<Array<{ table_name: string | null; index_name: string | null }>>(
   `SELECT to_regclass($1)::text AS table_name, to_regclass($2)::text AS index_name`,
   `${schema}.creator_password_attempts`, `${schema}.creator_password_attempts_expiry_idx`);
 expect(attempts.table_name).not.toBeNull(); expect(attempts.index_name).not.toBeNull();
});
it("serializes six simultaneous admissions at the global limit", async () => {
 await db.$executeRawUnsafe(`INSERT INTO backfill_jobs(id,status) SELECT 'job-'||n,'QUEUED' FROM generate_series(1,6) n`);
 const results = await Promise.all(Array.from({length:6},()=>reclamarProximoJob(360000,1)));
 expect(results.filter(Boolean)).toHaveLength(1);
 const [row] = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM backfill_jobs WHERE status='RUNNING'`);
 expect(Number(row.count)).toBe(1);
});
it("fences recovered backfill owners on independent requests", async () => {
 await db.$executeRawUnsafe(`INSERT INTO backfill_jobs(id,status) VALUES ('job','QUEUED')`);
 const old = await reclamarProximoJob(360000,1);
 await db.$executeRawUnsafe(`UPDATE backfill_jobs SET "updatedAt"=now()-interval '10 minutes'`);
 const next = await reclamarProximoJob(360000,1);
 const [stale,current] = await Promise.all([
  updateJobProgress("job",{cursor:{page:99}},{leaseToken:old.leaseToken}),
  updateJobProgress("job",{cursor:{page:2}},{leaseToken:next.leaseToken}),
 ]);
 expect(stale).toBe(false); expect(current).toBe(true); expect(await completeJob("job",old.leaseToken)).toBe(false);
});
it("allows only one ML sync claim and rejects a reclaimed stale checkpoint", async () => {
 const results = await Promise.all(Array.from({length:6},()=>claimMlSync("a")));
 const owners = results.filter(x=>x!==null); expect(owners).toHaveLength(1);
 await db.$executeRawUnsafe(`UPDATE ml_sync_progress SET "leaseUntil"=now()-interval '1 second'`);
 const next = (await claimMlSync("a"))!;
 const final = { itemsProcessed:1,newCursor:{},isComplete:true };
 expect(await saveMlSync(owners[0]!,final)).toBe(false); expect(await saveMlSync(next,final)).toBe(true);
});
it("isolates reconciliation modes while excluding duplicate active owners", async () => {
 const from = new Date("2026-01-01"),to = new Date("2026-09-01");
 const claims = await Promise.all(Array.from({length:6},()=>claimReconcile("a","incremental",from,to)));
 expect(claims.filter(Boolean)).toHaveLength(1);
 expect(await claimReconcile("a","deep",from,to)).not.toBeNull();
 expect(await claimReconcile("b","incremental",from,to)).not.toBeNull();
});
it("atomically rolls back completion when watermark insertion fails", async () => {
 const c = (await claimReconcile("a","incremental",new Date("2026-01-01"),new Date("2026-09-01")))!;
 await checkpointReconcile(c,[]);
 await db.$executeRawUnsafe(`ALTER TABLE sync_watermarks ADD CONSTRAINT reject_fixture CHECK(platform <> 'MERCADOLIBRE')`);
 try { await expect(completeReconcile(c,{})).rejects.toThrow(); }
 finally { await db.$executeRawUnsafe("ALTER TABLE sync_watermarks DROP CONSTRAINT reject_fixture"); }
 const [row] = await db.$queryRawUnsafe<Array<{ cursor: unknown }>>("SELECT cursor FROM ml_reconcile_progress");
 expect(row.cursor).toEqual([]); expect(await completeReconcile(c,{})).toBe(true);
});
it("keeps a repeatable-read export snapshot while another connection writes", async () => {
 await db.$executeRawUnsafe(`INSERT INTO orders(id) VALUES ('before')`);
 await db.$transaction(async tx => {
  const before = await tx.$queryRawUnsafe("SELECT id FROM orders ORDER BY id");
  await db.$executeRawUnsafe(`INSERT INTO orders(id) VALUES ('during')`);
  expect(await tx.$queryRawUnsafe("SELECT id FROM orders ORDER BY id")).toEqual(before);
 }, { isolationLevel: "RepeatableRead" });
 expect(await db.$queryRawUnsafe("SELECT id FROM orders ORDER BY id")).toHaveLength(2);
});

it("runs the exact deployment runbook twice and verifies all nine checks in real PostgreSQL", async () => {
 const name = "expansion_runbook_"+randomUUID().replaceAll("-", "");
 const isolated = new PrismaClient({ datasources: { db: { url: "postgresql://postgres:synthetic-local-only@127.0.0.1:15439/"+name } } });
 let created = false;
 try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
  for(const statement of ["CREATE TABLE organizations (id text PRIMARY KEY)", "CREATE TABLE orders (id text PRIMARY KEY)", "CREATE TABLE backfill_jobs (id text PRIMARY KEY,status text)"])
   await isolated.$executeRawUnsafe(statement);
  const runbook = readFileSync("docs/revision-2026-09/08-MIGRACIONES-NEON.sql", "utf8");
  const statements = runbook.replace(/--[^\n]*/g, "").split(";").map(x=>x.trim()).filter(Boolean);
  const verification = statements.find(x=>x.startsWith("WITH rol AS"));
  if(!verification)throw new Error("Runbook verification query missing");
  const before = await isolated.$queryRawUnsafe<Array<{ok:boolean}>>(verification);
  expect(before).toHaveLength(9); expect(before.every(x=>!x.ok)).toBe(true);
  for(let run=0;run<2;run++) {
   for(const statement of statements) {
    if(/^(WITH|SELECT)\b/.test(statement)) {
     const rows = await isolated.$queryRawUnsafe<Array<{ok?:boolean}>>(statement);
     if(statement===verification){expect(rows).toHaveLength(9);expect(rows.every(x=>x.ok===true)).toBe(true);}
    } else await isolated.$executeRawUnsafe(statement);
   }
  }
 } finally {
  await isolated.$disconnect();
  if(created && /^expansion_runbook_[a-f0-9]{32}$/.test(name))await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
 }
});
