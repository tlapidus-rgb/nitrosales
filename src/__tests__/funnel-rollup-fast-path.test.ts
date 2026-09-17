import { describe, expect, it } from "vitest";
import { funnelLiveTimeoutMs, shouldUseFunnelRollupOnly } from "@/lib/metrics/pixel-funnel";

describe("funnel rollup fast path", () => {
  it("uses the rollup directly for a fully covered multi-day preset", () => {
    expect(shouldUseFunnelRollupOnly("2026-09-03", "2026-09-17", "2026-06-01", "2026-09-17"))
      .toBe(true);
  });

  it("does not wait for a live merge when only the current day is absent", () => {
    expect(shouldUseFunnelRollupOnly("2026-09-03", "2026-09-17", "2026-06-01", "2026-09-16"))
      .toBe(true);
  });

  it("keeps the live merge for a one-day range", () => {
    expect(shouldUseFunnelRollupOnly("2026-09-17", "2026-09-17", "2026-06-01", "2026-09-17"))
      .toBe(false);
  });

  it("keeps the live merge when the rollup does not cover the requested range", () => {
    expect(shouldUseFunnelRollupOnly("2026-09-03", "2026-09-17", "2026-06-01", "2026-09-15"))
      .toBe(false);
    expect(shouldUseFunnelRollupOnly("2026-09-03", "2026-09-17", "2026-09-04", "2026-09-17"))
      .toBe(false);
  });
});

describe("funnel live merge budget", () => {
  it("bounds multi-day enrichment to 500ms", () => {
    expect(funnelLiveTimeoutMs("2026-09-03", "2026-09-17")).toBe(500);
  });

  it("keeps the freshness budget for one-day ranges", () => {
    expect(funnelLiveTimeoutMs("2026-09-17", "2026-09-17")).toBe(4000);
  });
});
