import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// El asistente del onboarding sólo continúa conversaciones propias
// ══════════════════════════════════════════════════════════════════════════
// La ruta buscaba la conversación por id, sin mirar de quién era. Con el id de
// una conversación ajena, el modelo recibía los mensajes del otro (y podía
// repetirlos), y el UPDATE los pisaba. El id viene del cliente: no es una
// credencial. SQL real contra PGlite; el modelo, simulado.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => ({ db: null as any, email: "a@cliente.invalid", llamadas: [] as any[] }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => (await m.db.query(sql, args)).rows,
    $executeRawUnsafe: async (sql: string, ...args: unknown[]) => (await m.db.query(sql, args)).affectedRows,
    user: {
      findUnique: async ({ where }: any) =>
        ({ "a@cliente.invalid": { id: "user-a", organizationId: "org-a", name: "A" },
           "b@otro.invalid": { id: "user-b", organizationId: "org-b", name: "B" } } as any)[where.email] ?? null,
    },
  },
}));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: m.email } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (params: any) => {
        m.llamadas.push(params);
        return { content: [{ type: "text", text: "respuesta" }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    };
  },
}));

import { POST } from "@/app/api/onboarding/aurum-assist/route";

beforeAll(async () => {
  m.db = await PGlite.create();
  await m.db.exec(`
    CREATE TABLE onboarding_aurum_conversations (
      id text PRIMARY KEY, "userId" text, "organizationId" text, "onboardingRequestId" text,
      messages jsonb, "lastPhase" text, "createdAt" timestamptz, "updatedAt" timestamptz);
    CREATE TABLE onboarding_requests (id text PRIMARY KEY, "createdOrgId" text);
  `);
});
afterAll(async () => m.db.close());
beforeEach(async () => {
  m.email = "a@cliente.invalid"; m.llamadas = [];
  await m.db.exec(`TRUNCATE onboarding_aurum_conversations;
    INSERT INTO onboarding_aurum_conversations VALUES
      ('propia', 'user-a', 'org-a', null, '[{"role":"user","content":[{"type":"text","text":"mensaje de A"}]}]', null, now(), now()),
      ('ajena',  'user-b', 'org-b', null, '[{"role":"user","content":[{"type":"text","text":"SECRETO DE B"}]}]', null, now(), now());`);
});

const pedir = (conversationId?: string) =>
  POST(new Request("http://local/api/onboarding/aurum-assist", {
    method: "POST", body: JSON.stringify({ message: "hola", conversationId }),
  }));

it("continúa una conversación propia", async () => {
  const res = await pedir("propia");
  expect(res.status).toBe(200);
  expect((await res.json()).conversationId).toBe("propia");
  expect(JSON.stringify(m.llamadas[0].messages)).toContain("mensaje de A");
  const [fila] = (await m.db.query(`SELECT messages FROM onboarding_aurum_conversations WHERE id='propia'`)).rows as any[];
  expect(fila.messages.length).toBe(3);
});

it("EL CASO: con el id de una conversación ajena, no ve sus mensajes ni la toca", async () => {
  const res = await pedir("ajena");
  expect(res.status).toBe(200);
  const { conversationId } = await res.json();
  expect(conversationId).not.toBe("ajena");
  expect(JSON.stringify(m.llamadas[0].messages)).not.toContain("SECRETO DE B");
  const [ajena] = (await m.db.query(`SELECT "userId", messages FROM onboarding_aurum_conversations WHERE id='ajena'`)).rows as any[];
  expect(ajena.userId).toBe("user-b");
  expect(ajena.messages.length).toBe(1);
  const [nueva] = (await m.db.query(`SELECT "userId" FROM onboarding_aurum_conversations WHERE id=$1`, [conversationId])).rows as any[];
  expect(nueva.userId).toBe("user-a");
});

it("sin id, arranca una conversación nueva", async () => {
  const res = await pedir();
  expect(res.status).toBe(200);
  const { conversationId } = await res.json();
  expect(conversationId).toBeTruthy();
  expect((await m.db.query(`SELECT 1 FROM onboarding_aurum_conversations WHERE id=$1 AND "userId"='user-a'`, [conversationId])).rows).toHaveLength(1);
});
