// Preview-only diagnostics. Never log SQL, arguments, rows, URLs or organization IDs.
export function createPixelTrace(enabled = process.env.VERCEL_ENV === "preview") {
  const id = enabled ? crypto.randomUUID() : "";
  const started = performance.now();
  const pending = new Map<string, number>();
  const emit = (event: string, fields: Record<string, unknown> = {}) => {
    if (!enabled) return;
    console.info("[pixel-perf]", JSON.stringify({ id, event, elapsedMs: Math.round(performance.now() - started), ...fields }));
  };
  return {
    snapshot(event: string) {
      emit(event, { pending: [...pending].map(([stage, at]) => ({ stage, ms: Math.round(performance.now() - at) })) });
    },
    async run<T>(stage: string, work: () => T | PromiseLike<T>): Promise<T> {
      if (!enabled) return await work();
      const at = performance.now();
      pending.set(stage, at);
      emit("start", { stage });
      let outcome = "ok";
      try {
        return await work();
      } catch (error) {
        outcome = "error";
        throw error;
      } finally {
        pending.delete(stage);
        emit("end", { stage, outcome, ms: Math.round(performance.now() - at) });
      }
    },
  };
}
