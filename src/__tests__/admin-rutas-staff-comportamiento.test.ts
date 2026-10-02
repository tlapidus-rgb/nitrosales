import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ══════════════════════════════════════════════════════════════════════════
// Rutas de /api/admin que sólo aceptaban `?key=` → ahora sesión de staff
// ══════════════════════════════════════════════════════════════════════════
// Con el hotfix el middleware rechaza (403) un `?key=` fuera de la allowlist, y
// estas rutas no aceptaban sesión: quedaban inutilizables. Ahora autorizan con
// isInternalUser() (staff verificado contra la base) y ya no miran la clave.
// Se prueba una ruta de cada forma que había: la que comparaba con
// NEXTAUTH_SECRET, la que comparaba con KEY (= ADMIN_API_KEY), la que usaba
// isValidAdminKey, la que no tenía ningún chequeo y la que sólo miraba la org
// de la sesión. Sin staff: rechazo y la base no se toca. Con staff: avanza.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => {
  // Valores sintéticos. Se setean ANTES de importar las rutas: si alguna
  // siguiera comparando la clave, con estos valores la clave "correcta" pasaría.
  const antes = { NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET, ADMIN_API_KEY: process.env.ADMIN_API_KEY };
  process.env.NEXTAUTH_SECRET = "secreto-sintetico-de-test";
  process.env.ADMIN_API_KEY = "clave-sintetica-de-test";
  return { staff: false, antes };
});

afterAll(() => {
  for (const [k, v] of Object.entries(m.antes)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => m.staff }));

const db = vi.hoisted(() => ({
  $executeRawUnsafe: vi.fn(async () => 0),
  $queryRawUnsafe: vi.fn(async () => [] as unknown[]),
  organization: { findFirst: vi.fn() },
  influencer: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const org = vi.hoisted(() => ({ getOrganization: vi.fn() }));
vi.mock("@/lib/auth-guard", () => org);
const mail = vi.hoisted(() => ({ sendOnboardingEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/aura/create-creator", () => mail);
vi.mock("@/lib/vtex-credentials", () => ({ getVtexConfig: vi.fn() }));

import { GET as migrateAuraColumns } from "@/app/api/admin/migrate-aura-columns/route";
import { GET as migrateManualSpend } from "@/app/api/admin/migrate-manual-spend/route";
import { POST as channelRulesSetup } from "@/app/api/admin/channel-rules-setup/route";
import { POST as migrateAuraDedup } from "@/app/api/admin/migrate-aura-dedup-indexes/route";
import { POST as auraResendOnboarding } from "@/app/api/admin/aura-resend-onboarding/route";
import { GET as broadcasterDryRun, POST as broadcasterPost } from "@/app/api/admin/vtex-configure-broadcaster/route";

const BASE = "https://app.nitrosales.ai";
const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: { host: "app.nitrosales.ai", "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

function baseSinTocar() {
  expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  expect(db.organization.findFirst).not.toHaveBeenCalled();
  expect(db.influencer.findMany).not.toHaveBeenCalled();
}

beforeEach(() => {
  m.staff = false;
  vi.clearAllMocks();
  org.getOrganization.mockResolvedValue({ id: "corgsintetica0000000000001", name: "Tienda", slug: "tienda" });
});

describe("la que comparaba con NEXTAUTH_SECRET (migrate-aura-columns)", () => {
  it("EL CASO: con la clave 'correcta' y sin staff → 401, la base no se toca", async () => {
    const res = await migrateAuraColumns(req("/api/admin/migrate-aura-columns?key=secreto-sintetico-de-test"));
    expect(res.status).toBe(401);
    baseSinTocar();
  });

  it("con staff, sin clave → corre la migración", async () => {
    m.staff = true;
    const res = await migrateAuraColumns(req("/api/admin/migrate-aura-columns"));
    expect(res.status).toBe(200);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
});

describe("la que comparaba con KEY = ADMIN_API_KEY (migrate-manual-spend)", () => {
  it("EL CASO: con la clave 'correcta' y sin staff → 403, la base no se toca", async () => {
    const res = await migrateManualSpend(req("/api/admin/migrate-manual-spend?key=clave-sintetica-de-test"));
    expect(res.status).toBe(403);
    baseSinTocar();
  });

  it("con staff, sin clave → crea la tabla", async () => {
    m.staff = true;
    const res = await migrateManualSpend(req("/api/admin/migrate-manual-spend"));
    expect(res.status).toBe(200);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(3);
  });
});

describe("la que usaba isValidAdminKey (channel-rules-setup)", () => {
  it("EL CASO: con la clave 'correcta' y sin staff → 403, la base no se toca", async () => {
    const res = await channelRulesSetup(req("/api/admin/channel-rules-setup?key=clave-sintetica-de-test", "POST"));
    expect(res.status).toBe(403);
    baseSinTocar();
  });

  it("con staff → crea la tabla y siembra", async () => {
    m.staff = true;
    const res = await channelRulesSetup(req("/api/admin/channel-rules-setup", "POST"));
    expect(res.status).toBe(200);
    expect(db.$executeRawUnsafe).toHaveBeenCalled();
  });
});

describe("la que no tenía ningún chequeo (migrate-aura-dedup-indexes)", () => {
  it("sin staff → 401, la base no se toca", async () => {
    const res = await migrateAuraDedup(req("/api/admin/migrate-aura-dedup-indexes", "POST"));
    expect(res.status).toBe(401);
    baseSinTocar();
  });

  it("con staff → crea los índices", async () => {
    m.staff = true;
    db.$queryRawUnsafe.mockResolvedValueOnce([{ indexname: "payouts_dedup_deal_period" }]);
    const res = await migrateAuraDedup(req("/api/admin/migrate-aura-dedup-indexes", "POST"));
    expect(res.status).toBe(200);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect((await res.json()).created).toEqual(["payouts_dedup_deal_period"]);
  });
});

describe("la que sólo miraba la org de la sesión (aura-resend-onboarding)", () => {
  it("sesión de cliente con org, sin staff → 403: no lista creadores ni manda mails", async () => {
    const res = await auraResendOnboarding(req("/api/admin/aura-resend-onboarding", "POST", { dryRun: false }));
    expect(res.status).toBe(403);
    baseSinTocar();
    expect(org.getOrganization).not.toHaveBeenCalled();
    expect(mail.sendOnboardingEmail).not.toHaveBeenCalled();
  });

  it("con staff → avanza (dry-run por defecto)", async () => {
    m.staff = true;
    const res = await auraResendOnboarding(req("/api/admin/aura-resend-onboarding", "POST", {}));
    expect(res.status).toBe(200);
    expect(db.influencer.findMany).toHaveBeenCalledTimes(1);
    expect(mail.sendOnboardingEmail).not.toHaveBeenCalled();
  });
});

describe("vtex-configure-broadcaster: cambia la autorización, NO la URL del hook", () => {
  const ORG = { id: "corgsintetica0000000000002", name: "Tienda", slug: "tienda" };

  it("sin staff → 403 (GET y POST), la base no se toca", async () => {
    expect((await broadcasterDryRun(req("/api/admin/vtex-configure-broadcaster?orgSlug=tienda&key=clave-sintetica-de-test"))).status).toBe(403);
    expect((await broadcasterPost(req("/api/admin/vtex-configure-broadcaster?orgSlug=tienda", "POST"))).status).toBe(403);
    baseSinTocar();
  });

  it("con staff, el dry-run arma la misma URL de hook de siempre (con la clave del webhook)", async () => {
    m.staff = true;
    db.organization.findFirst.mockResolvedValueOnce(ORG);
    const res = await broadcasterDryRun(req("/api/admin/vtex-configure-broadcaster?orgSlug=tienda"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // El receptor (webhooks/vtex/orders, CORE) valida esa clave: no se toca.
    expect(body.payload.hook.url).toBe(
      `https://app.nitrosales.ai/api/webhooks/vtex/orders?key=secreto-sintetico-de-test&org=${ORG.id}`,
    );
  });
});
