import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), org: vi.fn(), admit: vi.fn(), provider: vi.fn(), update: vi.fn(), tool: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth-guard", () => ({ getOrganization: m.org }));
vi.mock("@/lib/alerts/get-user-id", () => ({ getSessionUserId: async () => "user-test" }));
vi.mock("@/lib/aurum/admision", () => ({ admitirAurum: m.admit, MODELO_USO_INCIERTO: "__aurum_usage_unknown__" }));
vi.mock("@/lib/db/client", () => ({ prisma: { aurumUsageLog: { update: m.update } } }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: m.provider }; } }));
vi.mock("@/lib/alerts/aurum-tools", () => ({ ALERT_TOOLS: [], ALERT_TOOLS_PROMPT: "", isAlertToolName: () => true }));
vi.mock("@/lib/alerts/aurum-handlers", () => ({ executeAlertTool: m.tool }));
import { POST } from "@/app/api/aurum/section-insight/route";
const req = (body: unknown = { section: "test", contextData: { revenue: 10 } }) => new Request("https://test.invalid", { method: "POST", body: JSON.stringify(body) });
const response = () => ({ content: [{ type: "text", text: "test reply" }], usage: { input_tokens: 10, output_tokens: 4 }, stop_reason: "end_turn" });
beforeEach(() => {
 vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {});
 m.session.mockResolvedValue({ user: {} }); m.org.mockResolvedValue({ id: "org-test" });
 m.admit.mockResolvedValue({ id: "reservation-test", cuota: { permitido: true, modoEfectivo: "FLASH", motivo: null, cercaDelTope: false, medicionDisponible: true } });
 m.provider.mockResolvedValue(response()); m.update.mockResolvedValue({}); m.tool.mockResolvedValue("OK created");
});
afterEach(() => vi.restoreAllMocks());
it("reserves the shared organization allowance before the provider and settles the same row", async () => {
 const res = await POST(req()); expect(res.status).toBe(200);
 expect(m.admit).toHaveBeenCalledWith("org-test", "FLASH");
 expect(m.admit.mock.invocationCallOrder[0]).toBeLessThan(m.provider.mock.invocationCallOrder[0]);
 expect(m.update).toHaveBeenCalledWith({ where: { id: "reservation-test" }, data: expect.objectContaining({ inputTokens: 10, outputTokens: 4, totalTokens: 14, mode: "FLASH", model: "claude-haiku-4-5-20251001", success: true }) });
});
it("unauthenticated requests never reserve or spend", async () => {
 m.session.mockResolvedValue(null); expect((await POST(req())).status).toBe(401);
 expect(m.admit).not.toHaveBeenCalled(); expect(m.provider).not.toHaveBeenCalled();
});
it("invalid requests never reserve", async () => {
 expect((await POST(req({ section: "", contextData: {} }))).status).toBe(400);
 expect(m.admit).not.toHaveBeenCalled();
});
it("a failed admission returns 503 without calling the provider", async () => {
 m.admit.mockRejectedValue(new Error("db down")); expect((await POST(req())).status).toBe(503);
 expect(m.provider).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it("rate limits return 429 without spending or updating usage", async () => {
 m.admit.mockResolvedValue({ id: null, cuota: { permitido: false, motivo: "limit" } });
 expect((await POST(req())).status).toBe(429); expect(m.provider).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it.each([undefined, { input_tokens: -1, output_tokens: 4 }])("missing or invalid usage remains unknown", async usage => {
 m.provider.mockResolvedValue({ ...response(), usage }); await POST(req());
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ model: "__aurum_usage_unknown__" }) }));
});
it("a provider failure leaves uncertain spending rather than a free request", async () => {
 m.provider.mockRejectedValue(new Error("provider timeout")); expect((await POST(req())).status).toBe(500);
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ model: "__aurum_usage_unknown__", success: false }) }));
});
it("multiple rounds sum usage and preserve organization scope in tools", async () => {
 m.provider.mockResolvedValueOnce({ ...response(), content: [{ type: "tool_use", id: "tool-1", name: "create_alert_rule", input: {} }], stop_reason: "tool_use" });
 expect((await POST(req())).status).toBe(200);
 expect(m.admit).toHaveBeenCalledTimes(1);
 expect(m.tool).toHaveBeenCalledWith("create_alert_rule", {}, { orgId: "org-test", userId: "user-test" });
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalTokens: 28, toolRounds: 2, toolsUsed: ["create_alert_rule"] }) }));
});
it("settlement is awaited before returning", async () => {
 let release!: () => void;
 let started!: () => void;
 const settling = new Promise<void>(resolve => { started = resolve; });
 m.update.mockImplementation(() => { started(); return new Promise<void>(resolve => { release = resolve; }); });
 let finished = false;
 const pending = POST(req()).then(res => { finished = true; return res; });
 await settling; expect(finished).toBe(false); release(); expect((await pending).status).toBe(200);
});
it("a failed settlement preserves the response without replacing the pending reservation", async () => {
 m.update.mockRejectedValue(new Error("db down")); expect((await POST(req())).status).toBe(200);
 expect(m.admit).toHaveBeenCalledTimes(1); expect(m.update).toHaveBeenCalledTimes(1);
});