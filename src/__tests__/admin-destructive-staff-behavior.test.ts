import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  staff: vi.fn(),
  session: vi.fn(),
  sessionUserId: vi.fn(),
  organizationFind: vi.fn(),
  usersFind: vi.fn(),
  userFind: vi.fn(),
  userFirst: vi.fn(),
  auditCreate: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: m.staff }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/alerts/get-user-id", () => ({ getSessionUserId: m.sessionUserId }));
vi.mock("@/lib/db/client", () => ({ prisma: {
  organization: { findUnique: m.organizationFind },
  user: { findMany: m.usersFind, findUnique: m.userFind, findFirst: m.userFirst },
  loginEvent: { create: m.auditCreate },
  $executeRawUnsafe: m.execute,
  $queryRawUnsafe: m.query,
} }));

import { POST as wipeAccount } from "@/app/api/admin/orgs/[orgId]/wipe-account/route";
import { GET as getSuspension, DELETE as deleteSuspension } from "@/app/api/admin/orgs/[orgId]/suspension/route";
import { POST as impersonate } from "@/app/api/admin/impersonate/route";

const orgId = "corgsintetica0000000000001";
const params = { params: { orgId } };
const request = (path: string, method: string, body?: unknown) => new NextRequest(`http://local/api/admin/${path}`, {
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});
const calls = [
  ["wipe-account POST", () => wipeAccount(request(`orgs/${orgId}/wipe-account`, "POST", { confirm: `WIPE-${orgId}` }), params)],
  ["suspension GET", () => getSuspension(request(`orgs/${orgId}/suspension`, "GET"), params)],
  ["suspension DELETE", () => deleteSuspension(request(`orgs/${orgId}/suspension`, "DELETE"), params)],
  ["impersonate POST", () => impersonate(request("impersonate", "POST", { targetUserId: "synthetic-target" }))],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  m.staff.mockResolvedValue(false);
  m.organizationFind.mockResolvedValue(null);
  m.userFind.mockResolvedValue(null);
  m.session.mockResolvedValue({ user: { id: "synthetic-client", email: "cliente@test.invalid" } });
});

describe("rutas administrativas requieren staff antes de cualquier acceso a datos", () => {
  it.each(calls)("%s rechaza sin staff y no consulta ni modifica la base", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(m.staff).toHaveBeenCalledOnce();
    for (const access of [m.organizationFind, m.usersFind, m.userFind, m.userFirst, m.auditCreate, m.execute, m.query]) {
      expect(access).not.toHaveBeenCalled();
    }
    expect(m.session).not.toHaveBeenCalled();
    expect(m.sessionUserId).not.toHaveBeenCalled();
  });

  it.each(calls)("%s con staff llega a la consulta del destino", async (name, call) => {
    m.staff.mockResolvedValue(true);
    expect((await call()).status).toBe(404);
    if (name === "impersonate POST") expect(m.userFind).toHaveBeenCalledOnce();
    else expect(m.organizationFind).toHaveBeenCalledOnce();
    expect(m.execute).not.toHaveBeenCalled();
    expect(m.query).not.toHaveBeenCalled();
  });
});
