import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const m = vi.hoisted(() => ({ tx: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $transaction: m.tx } }));
import { purgeCreatorPasswordAttempts } from "./creator-password-cleanup";
let db: PGlite;
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(readFileSync("prisma/migrations/creator_password_attempts.sql", "utf8"));
});
afterAll(async () => db.close());
beforeEach(async () => {
 vi.resetAllMocks(); await db.exec("TRUNCATE creator_password_attempts");
 m.tx.mockImplementation(async fn => db.transaction(async tx => fn({
  $executeRawUnsafe: async (sql: string, ...args: unknown[]) => (await tx.query(sql, args)).affectedRows,
 })));
});
it("deletes only a bounded batch and preserves active/recent windows", async () => {
 await db.exec(`INSERT INTO creator_password_attempts VALUES
 ('old-a', 5, now() - interval '3 days'), ('old-b', 5, now() - interval '2 days'),
 ('recent', 5, now() - interval '2 hours'), ('active', 5, now() + interval '1 minute')`);
 expect(await purgeCreatorPasswordAttempts(1)).toBe(1);
 expect((await db.query<{key: string}>("SELECT key FROM creator_password_attempts ORDER BY key")).rows.map(r => r.key)).toEqual(["active", "old-b", "recent"]);
 expect(await purgeCreatorPasswordAttempts(100)).toBe(1);
 expect(await purgeCreatorPasswordAttempts()).toBe(0);
 expect((await db.query<{attempts: number}>("SELECT attempts FROM creator_password_attempts WHERE key='active'")).rows[0].attempts).toBe(5);
});
it("preserves a key refreshed before cleanup", async () => {
 await db.exec("INSERT INTO creator_password_attempts VALUES ('renewed', 5, now() - interval '2 days'); UPDATE creator_password_attempts SET expires_at=now()+interval '1 minute' WHERE key='renewed'");
 expect(await purgeCreatorPasswordAttempts()).toBe(0);
});
it.each([0, -1, 1.5, 1001, NaN])("rejects invalid batch %s without touching DB", async size => {
 await expect(purgeCreatorPasswordAttempts(size)).rejects.toThrow(RangeError);
 expect(m.tx).not.toHaveBeenCalled();
});
it("reports a DB failure instead of claiming zero deleted rows", async () => {
 const log = vi.spyOn(console, "error").mockImplementation(() => {});
 m.tx.mockRejectedValue(new Error("table missing"));
 expect(await purgeCreatorPasswordAttempts()).toBe(-1);
 log.mockRestore();
});