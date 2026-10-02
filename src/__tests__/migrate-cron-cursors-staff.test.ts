import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => {
  const previousAdminKey = process.env.ADMIN_API_KEY;
  const validAdminKey = "synthetic-cursors-test-key";
  process.env.ADMIN_API_KEY = validAdminKey;
  return { staff: false, execute: vi.fn(), query: vi.fn(), previousAdminKey, validAdminKey };
});
afterAll(() => {
  if (m.previousAdminKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = m.previousAdminKey;
});
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => m.staff }));
vi.mock("@/lib/db/client", () => ({ prisma: { $executeRawUnsafe: m.execute, $queryRawUnsafe: m.query } }));
import { GET, POST } from "@/app/api/admin/migrate-cron-cursors/route";
beforeEach(() => { m.staff = false; m.execute.mockReset().mockResolvedValue(0); m.query.mockReset().mockResolvedValue([]); });
describe.each([["GET", GET], ["POST", POST]] as const)("cursores %s", (method, handler) => {
  it("sin staff rechaza incluso una clave por URL y no toca SQL", async () => {
    const response = await handler(new NextRequest(`http://local/api/admin/migrate-cron-cursors?key=${m.validAdminKey}`, { method }));
    expect(response.status).toBe(403);
    expect(m.execute).not.toHaveBeenCalled();
    expect(m.query).not.toHaveBeenCalled();
  });
  it("con staff funciona sin clave", async () => {
    m.staff = true;
    const response = await handler(new NextRequest("http://local/api/admin/migrate-cron-cursors", { method }));
    expect(response.status).toBe(200);
    expect(m.query).toHaveBeenCalledOnce();
    if (method === "POST") expect(m.execute).toHaveBeenCalledTimes(5);
    else expect(m.execute).not.toHaveBeenCalled();
  });
});
