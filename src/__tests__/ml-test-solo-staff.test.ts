import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// /api/sync/ml-test mostraba el comienzo del token de MercadoLibre de una org y
// forzaba su renovación, con la clave (que está filtrada). Nadie la llama de
// forma automática: ahora es sólo para staff con sesión verificada.

const m = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = "clave-publica-sintetica";
  process.env.ADMIN_API_KEY = "clave-publica-sintetica";
  return { staff: false, consultas: 0 };
});
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => m.staff }));
vi.mock("@/lib/db/client", () => ({
  prisma: { connection: { findFirst: async () => { m.consultas++; return null; } } },
}));

import { GET } from "@/app/api/sync/ml-test/route";

const pedido = () => new NextRequest("http://local/api/sync/ml-test?key=clave-publica-sintetica&org=ckorgvictima000000000001");

beforeEach(() => {
  m.staff = false;
  m.consultas = 0;
});

it("EL CASO: la clave sola no abre nada ni lee la conexión", async () => {
  expect((await GET(pedido())).status).toBe(401);
  expect(m.consultas).toBe(0);
});

it("con sesión de staff, sigue", async () => {
  m.staff = true;
  await GET(pedido());
  expect(m.consultas).toBe(1);
});
