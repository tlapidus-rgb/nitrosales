import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), org: vi.fn(), creator: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: {
  $queryRawUnsafe: mocks.query, $executeRawUnsafe: mocks.execute,
  organization: { findUnique: mocks.org, findFirst: mocks.org },
  influencer: { findUnique: mocks.creator, findFirst: mocks.creator },
  influencerBriefing: { findMany: mocks.list },
  contentSubmission: { findMany: mocks.list },
  productSeeding: { findMany: mocks.list },
} }));
import { creatorAttemptKeys, creatorPasswordFromRequest, creatorPasswordMatches, limitCreatorPassword } from "@/lib/creator-password";
import { POST as verify } from "@/app/api/public/influencers/[slug]/[code]/verify/route";
import { GET as content, POST as submit } from "@/app/api/public/influencers/[slug]/[code]/content/route";
import { GET as dashboard } from "@/app/api/public/influencers/[slug]/[code]/route";

let db: PGlite;
const params = { slug: "shop", code: "creator" };
let nextIp = 1;
function request(method = "GET", password = "wrong", ip = `192.0.2.${nextIp++}`) {
  return new NextRequest(`https://test.invalid/api?password=${encodeURIComponent(password)}`, {
    method, headers: { "x-forwarded-for": ip, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify({ password }) } : {}),
  });
}
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync("prisma/migrations/creator_password_attempts.sql", "utf8"));
});
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  vi.resetAllMocks();
  await db.exec("TRUNCATE creator_password_attempts");
  mocks.query.mockImplementation(async (sql, ...args) => (await db.query(sql, args)).rows);
  mocks.execute.mockImplementation(async (sql, ...args) => (await db.query(sql, args)).affectedRows);
  mocks.org.mockResolvedValue({ id: "org", name: "Shop" });
  mocks.list.mockResolvedValue([]);
  mocks.creator.mockResolvedValue({ id: "creator", status: "ACTIVE", isPublicDashboardEnabled: true,
    dashboardPassword: createHash("sha256").update("correct").digest("hex") });
});

it("shares five attempts across all four handlers despite IP rotation", async () => {
  for (let i = 0; i < 3; i++) expect((await verify(request("POST"), { params })).status).toBe(200);
  expect((await content(request(), { params })).status).toBe(401);
  expect((await submit(request("POST"), { params })).status).toBe(401);
  const response = await dashboard(request(), { params });
  expect(response.status).toBe(429);
  expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(mocks.creator).toHaveBeenCalledTimes(5);
});

it("enforces the independent IP budget across different accounts", async () => {
  for (let i = 0; i < 30; i++) {
    expect((await limitCreatorPassword(request("GET", "wrong", "203.0.113.1"), "shop", String(i))).blocked).toBeNull();
  }
  expect((await limitCreatorPassword(request("GET", "wrong", "203.0.113.1"), "shop", "other")).blocked?.status).toBe(429);
});

it("serves authenticated content via header without public caching or consuming failures", async () => {
  const req = new NextRequest("https://test.invalid/api/content", {
    headers: { "x-creator-password": encodeURIComponent("correct") },
  });
  for (let i = 0; i < 8; i++) {
    const response = await content(req, { params });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ briefings: [], submissions: [], seedings: [] });
  }
});

it.each([{ status: "INACTIVE" }, { isPublicDashboardEnabled: false }])("does not verify disabled creators: %j", async state => {
  mocks.creator.mockResolvedValue({ ...await mocks.creator(), ...state });
  expect((await verify(request("POST", "correct"), { params })).status).toBe(404);
});

it("refunds successful navigation without erasing prior failures", async () => {
  for (let i = 0; i < 4; i++) await verify(request("POST"), { params });
  for (let i = 0; i < 12; i++) {
    const res = await verify(request("POST", "correct"), { params });
    expect(await res.json()).toEqual({ valid: true });
  }
  expect((await verify(request("POST"), { params })).status).toBe(200);
  expect((await verify(request("POST", "correct"), { params })).status).toBe(429);
});

it("expires blocked windows without letting late refunds affect new attempts", async () => {
  const req = request();
  const old = await limitCreatorPassword(req, "shop", "creator");
  await db.exec("UPDATE creator_password_attempts SET expires_at = now() - interval '1 second'");
  const fresh = await limitCreatorPassword(req, "shop", "creator");
  expect(fresh.blocked).toBeNull();
  await old.success();
  const rows = await db.query<{ attempts: number }>("SELECT attempts FROM creator_password_attempts");
  expect(rows.rows.map(r => r.attempts)).toEqual([1, 1]);
  await fresh.success();
  await fresh.success();
  expect((await db.query<{ attempts: number }>("SELECT attempts FROM creator_password_attempts")).rows.map(r => r.attempts)).toEqual([0, 0]);
});

it.each([verify, submit, content, dashboard])("fails closed before credential lookup when persistence is unavailable", async handler => {
  mocks.query.mockRejectedValueOnce(new Error("unavailable"));
  const method = handler === verify || handler === submit ? "POST" : "GET";
  expect((await handler(request(method), { params })).status).toBe(503);
  expect(mocks.org).not.toHaveBeenCalled();
});

it("rejects invalid password values without throwing", () => {
  for (const input of [null, undefined, {}, 123, "", "a".repeat(1025)]) {
    expect(creatorPasswordMatches(input, "hash")).toBe(false);
  }
  expect(creatorPasswordMatches("correct", createHash("sha256").update("correct").digest("hex"))).toBe(true);
});

it("decodes Unicode passwords from the header and rejects malformed encoding", () => {
  const password = "clave-ñ-🔑-%";
  const req = new NextRequest("https://test.invalid/api?password=ignored", {
    headers: { "x-creator-password": encodeURIComponent(password) },
  });
  expect(creatorPasswordFromRequest(req)).toBe(password);
  req.headers.set("x-creator-password", "%zz");
  expect(creatorPasswordFromRequest(req)).toBe("");
  req.headers.delete("x-creator-password");
  expect(creatorPasswordFromRequest(req)).toBe("ignored");
});

it("uses separate hashed identities and ignores proxy suffix changes", () => {
  const a = creatorAttemptKeys(request("GET", "x", "203.0.113.1, 10.0.0.1"), "shop", "a");
  const b = creatorAttemptKeys(request("GET", "x", "203.0.113.1, 10.0.0.2"), "shop", "b");
  expect(a[0].key).not.toBe(b[0].key);
  expect(a[1].key).toBe(b[1].key);
  expect(a[0].key).toMatch(/^[a-f0-9]{64}$/);
});
