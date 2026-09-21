import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const m = vi.hoisted(() => ({
  provider: vi.fn(), transaction: vi.fn(), query: vi.fn(), create: vi.fn(), update: vi.fn(),
  session: vi.fn(), org: vi.fn(), user: vi.fn(), memory: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: m.provider }; } }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth-guard", () => ({ getOrganization: m.org }));
vi.mock("@/lib/alerts/get-user-id", () => ({ getSessionUserId: m.user }));
vi.mock("@/lib/intelligence/tools", () => ({ INTELLIGENCE_TOOLS: [] }));
vi.mock("@/lib/intelligence/handlers", () => ({ executeToolCall: vi.fn() }));
vi.mock("@/lib/alerts/aurum-tools", () => ({
  ALERT_TOOLS: [], ALERT_TOOLS_PROMPT: "", isAlertToolName: () => false,
}));
vi.mock("@/lib/alerts/aurum-handlers", () => ({ executeAlertTool: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: {
  $transaction: m.transaction, $queryRawUnsafe: m.query,
  aurumUsageLog: { create: m.create, update: m.update },
  botMemory: { findMany: m.memory },
} }));
import { POST } from "@/app/api/chat/route";
import { LOCK_AURUM_SQL, MODELO_PENDIENTE, MODELO_USO_INCIERTO, admitirAurum } from "@/lib/aurum/admision";
import { costoDeAurum } from "@/lib/costos/consumo-por-cliente";

let db: PGlite;
let queue: Promise<unknown> = Promise.resolve();
const answer = { content: [{ type: "text", text: "Respuesta simulada" }],
  usage: { input_tokens: 100, output_tokens: 20 }, stop_reason: "end_turn" };
function req(mode = "DEEP") {
  return new Request("https://test.invalid/api/chat", {
    method: "POST", body: JSON.stringify({ message: "Hola", mode }),
    headers: { "Content-Type": "application/json" },
  });
}
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync("prisma/migrations/aurum_usage_log.sql", "utf8"));
});
afterAll(async () => { await db.close(); });
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  await queue;
  vi.resetAllMocks();
  await db.exec("TRUNCATE aurum_usage_logs");
  m.session.mockResolvedValue({ user: { email: "test@example.invalid" } });
  m.org.mockResolvedValue({ id: "org", name: "Test" });
  m.user.mockResolvedValue("user");
  m.memory.mockResolvedValue([]);
  m.provider.mockResolvedValue(answer);
  m.query.mockImplementation(async (sql, ...args) => {
    // PGlite cannot model independent sessions. Transaction scheduling is
    // simulated here; real PostgreSQL concurrency remains a deployment gate.
    if (sql === LOCK_AURUM_SQL) return [];
    return (await db.query(sql, args)).rows;
  });
  m.create.mockImplementation(async ({ data: d }) => {
    await db.query('INSERT INTO aurum_usage_logs (id, "organizationId", mode, model, "latencyMs", success, "stopReason", "createdAt") VALUES ($1,$2,$3,$4,0,false,$5,$6)',
      [d.id, d.organizationId, d.mode, d.model, d.stopReason, d.createdAt]);
    return d;
  });
  m.update.mockImplementation(async ({ where, data: d }) => {
    await db.query('UPDATE aurum_usage_logs SET model=$2, "inputTokens"=$3, "outputTokens"=$4, success=$5, "stopReason"=$6 WHERE id=$1',
      [where.id, d.model, d.inputTokens, d.outputTokens, d.success, d.stopReason]);
    return d;
  });
  m.transaction.mockImplementation(fn => {
    const run = queue.then(async () => {
      await db.exec("BEGIN");
      try {
        const result = await fn({ $queryRawUnsafe: m.query, aurumUsageLog: { create: m.create } });
        await db.exec("COMMIT");
        return result;
      } catch (e) { await db.exec("ROLLBACK"); throw e; }
    });
    queue = run.catch(() => {});
    return run;
  });
});

it("reserves a burst before provider completion and rejects excess without logging it twice", async () => {
  vi.stubEnv("AURUM_CONSULTAS_POR_MINUTO", "2");
  let finish!: (v: typeof answer) => void;
  m.provider.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const requests = Array.from({ length: 6 }, () => POST(req()));
  await vi.waitFor(() => expect(m.provider).toHaveBeenCalledTimes(2));
  expect(m.update).not.toHaveBeenCalled();
  expect(m.create).toHaveBeenCalledTimes(2);
  expect(m.provider.mock.calls.map(([args]) => args.model)).toEqual([
    "claude-opus-4-5", "claude-haiku-4-5-20251001",
  ]);
  finish(answer);
  const responses = await Promise.all(requests);
  expect(responses.map(r => r.status)).toEqual([200, 200, 429, 429, 429, 429]);
  expect(m.update).toHaveBeenCalledTimes(2);
  expect((await db.query("SELECT * FROM aurum_usage_logs")).rows).toHaveLength(2);
  const second = await responses[1].json();
  expect(second.cuota).toMatchObject({ degradado: true, medicionDisponible: false });
  expect(second.cuota.aviso).toBeTruthy();
});

it("waits for the admission lock before reading counts", async () => {
  let unlock!: () => void;
  m.query.mockImplementationOnce(() => new Promise<void>(resolve => { unlock = resolve; }));
  const pending = admitirAurum("org", "DEEP");
  await vi.waitFor(() => expect(m.query).toHaveBeenCalledTimes(1));
  expect(m.query.mock.calls[0]).toEqual([LOCK_AURUM_SQL, "org"]);
  expect(m.create).not.toHaveBeenCalled();
  unlock();
  await pending;
  expect(m.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "ReadCommitted" });
});

it("fails closed if admission persistence fails", async () => {
  m.create.mockRejectedValueOnce(new Error("write unavailable"));
  expect((await POST(req())).status).toBe(503);
  expect(m.provider).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
  expect((await db.query("SELECT * FROM aurum_usage_logs")).rows).toHaveLength(0);
});

it("keeps uncertain provider usage visible instead of inventing a zero", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.provider.mockRejectedValueOnce(new Error("provider timeout"));
  expect((await POST(req())).status).toBe(500);
  const row = (await db.query<{ model: string }>("SELECT model FROM aurum_usage_logs")).rows[0];
  expect(row.model).toBe(MODELO_USO_INCIERTO);
  const next = await POST(req());
  expect((await next.json()).mode).toBe("FLASH");
  vi.restoreAllMocks();
});

it("leaves a pending reservation visible when finalization fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.update.mockRejectedValueOnce(new Error("write unavailable"));
  expect((await POST(req())).status).toBe(200);
  expect((await db.query<{ model: string }>("SELECT model FROM aurum_usage_logs")).rows[0].model).toBe(MODELO_PENDIENTE);
  const next = await POST(req());
  expect((await next.json()).cuota.medicionDisponible).toBe(false);
  vi.restoreAllMocks();
});

it("waits for finalization before returning the response", async () => {
  let finish!: () => void;
  m.update.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let returned = false;
  const pending = POST(req()).then(r => { returned = true; return r; });
  await vi.waitFor(() => expect(m.update).toHaveBeenCalledTimes(1));
  expect(returned).toBe(false);
  finish();
  expect((await pending).status).toBe(200);
});

it("does not reserve unauthenticated requests", async () => {
  m.session.mockResolvedValueOnce(null);
  expect((await POST(req())).status).toBe(401);
  expect(m.transaction).not.toHaveBeenCalled();
});

it("keeps missing usage unknown even when the provider returns a reply", async () => {
  m.provider.mockResolvedValueOnce({ ...answer, usage: undefined });
  expect((await POST(req())).status).toBe(200);
  expect((await db.query<{ model: string }>("SELECT model FROM aurum_usage_logs")).rows[0].model).toBe(MODELO_USO_INCIERTO);
});

it("restores the requested mode after successful settlement", async () => {
  expect((await (await POST(req())).json()).mode).toBe("DEEP");
  const response = await (await POST(req())).json();
  expect(response.mode).toBe("DEEP");
  expect(response.cuota.medicionDisponible).toBe(true);
});

it("keeps per-organization budgets separate and expires the rolling minute", async () => {
  const limits = { topeUsdMensual: 100, consultasPorMinuto: 1 };
  expect((await admitirAurum("first", "DEEP", limits)).id).not.toBeNull();
  expect((await admitirAurum("first", "DEEP", limits)).id).toBeNull();
  expect((await admitirAurum("second", "DEEP", limits)).id).not.toBeNull();
  await db.exec('UPDATE aurum_usage_logs SET "createdAt" = now() - interval \'61 seconds\'');
  expect((await admitirAurum("first", "DEEP", limits)).id).not.toBeNull();
});

it("treats an unpriced completed model as unknown rather than zero", async () => {
  await admitirAurum("org", "DEEP");
  await db.exec("UPDATE aurum_usage_logs SET model = 'future-model', success = true");
  const response = await (await POST(req())).json();
  expect(response.mode).toBe("FLASH");
  expect(response.cuota.medicionDisponible).toBe(false);
});

it("does not call the provider when the admission lock fails", async () => {
  m.query.mockRejectedValueOnce(new Error("lock timeout"));
  expect((await POST(req())).status).toBe(503);
  expect(m.create).not.toHaveBeenCalled();
  expect(m.provider).not.toHaveBeenCalled();
});

it("does not let configurable prices turn pending usage into a free model", () => {
  const result = costoDeAurum([{ organizationId: "org", mode: "DEEP",
    model: MODELO_PENDIENTE, inputTokens: 0, outputTokens: 0 }],
    { NODE_ENV: "test", PRECIOS_MODELOS_JSON: JSON.stringify({ [MODELO_PENDIENTE]: { entrada: 0, salida: 0 } }) });
  expect(result.modelosSinPrecio).toHaveLength(1);
});
