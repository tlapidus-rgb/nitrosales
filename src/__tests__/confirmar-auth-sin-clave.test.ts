import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ══════════════════════════════════════════════════════════════════════════
// meta-auth-confirm / google-auth-confirm: sólo staff, nunca la clave
// ══════════════════════════════════════════════════════════════════════════
// El mail que recibe el staff cuando un cliente pide autorización de Meta o
// Google traía un link con `&key=<ADMIN_API_KEY>`: la clave viajaba por mail y
// la ruta la aceptaba en lugar de la sesión. Con el middleware del hotfix ese
// link daba 403. Ahora el link va sin clave y la ruta exige sesión de staff.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => {
  process.env.ADMIN_API_KEY = "clave-sintetica-de-prueba";
  return { staff: false, consultas: 0, updates: [] as any[], mails: [] as any[] };
});

vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => m.staff }));
vi.mock("@/lib/email/send", () => ({ sendEmail: async (x: any) => { m.mails.push(x); } }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    connection: {
      findFirst: async () => { m.consultas++; return { id: "ckconn000000000000000001", credentials: {} }; },
      update: async (x: any) => { m.updates.push(x); return {}; },
    },
    organization: {
      findUnique: async () => ({ name: "Tienda", users: [{ email: "cliente@tienda.test", name: "Cliente" }] }),
    },
  },
}));

import * as meta from "@/app/api/admin/meta-auth-confirm/route";
import * as google from "@/app/api/admin/google-auth-confirm/route";

const ORG = "ckorg00000000000000000002";

beforeEach(() => {
  m.staff = false;
  m.consultas = 0;
  m.updates = [];
  m.mails = [];
});

describe.each([
  ["meta-auth-confirm", meta],
  ["google-auth-confirm", google],
])("%s", (nombre, ruta) => {
  const get = (q: string) => ruta.GET(new NextRequest(`http://local/api/admin/${nombre}?${q}`));

  it("EL CASO: con la clave y sin sesión de staff no aprueba nada", async () => {
    const res = await get(`orgId=${ORG}&key=clave-sintetica-de-prueba`);
    expect(await res.text()).toContain("No autorizado");
    expect(m.consultas).toBe(0);
    expect(m.updates).toEqual([]);
    expect(m.mails).toEqual([]);
  });

  it("con sesión de staff aprueba y avisa al cliente", async () => {
    m.staff = true;
    const res = await get(`orgId=${ORG}`);
    expect(res.status).toBe(200);
    expect(m.updates).toHaveLength(1);
    expect(m.updates[0].data.credentials.authStatus).toBe("APPROVED");
    expect(m.mails.map((x) => x.to)).toEqual(["cliente@tienda.test"]);
  });
});
