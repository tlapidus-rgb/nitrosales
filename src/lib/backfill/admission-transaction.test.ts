import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $transaction: mocks.transaction } }));
import { BLOQUEAR_ADMISION_SQL, RECLAMAR_PROXIMO_JOB_SQL, reclamarProximoJob } from "./job-manager";
import { COOLDOWN_JOB_MS, RUNNER_MAX_DURATION_SECONDS } from "./admision";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async fn => fn({ $queryRawUnsafe: mocks.query }));
});
it("acquires the shared transaction lock before executing count/claim", async () => {
  let unlock!: () => void;
  mocks.query.mockImplementationOnce(() => new Promise<void>(resolve => { unlock = resolve; }))
    .mockResolvedValueOnce([{ id: "job" }]);
  const result = reclamarProximoJob(COOLDOWN_JOB_MS, 1);
  expect(mocks.query.mock.calls).toEqual([[BLOQUEAR_ADMISION_SQL]]);
  unlock();
  expect(await result).toEqual({ id: "job" });
  expect(mocks.query.mock.calls[1][0]).toBe(RECLAMAR_PROXIMO_JOB_SQL);
  expect(mocks.transaction.mock.calls[0][1].isolationLevel).toBe("ReadCommitted");
});
it("does not claim anything when admission locking fails", async () => {
  mocks.query.mockRejectedValueOnce(new Error("lock timeout"));
  await expect(reclamarProximoJob(COOLDOWN_JOB_MS)).rejects.toThrow("lock timeout");
  expect(mocks.query).toHaveBeenCalledTimes(1);
});
it("keeps a claim valid beyond the maximum invocation lifetime", () => {
  expect(COOLDOWN_JOB_MS).toBeGreaterThan(RUNNER_MAX_DURATION_SECONDS * 1000);
});
it("rejects invalid limits before opening a transaction", async () => {
  await expect(reclamarProximoJob(COOLDOWN_JOB_MS, 0)).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
