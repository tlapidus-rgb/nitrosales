import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const warmCache = readFileSync(
  join(process.cwd(), "src/app/api/cron/warm-cache/route.ts"),
  "utf8"
);
const rateSummary = readFileSync(
  join(process.cwd(), "src/app/api/metrics/pixel/rate-summary/route.ts"),
  "utf8"
);

describe("rate-summary warm-cache contract", () => {
  it("the cron warms the endpoint using the shared internal credentials", () => {
    expect(warmCache).toContain('"/api/metrics/pixel/rate-summary"');
    expect(warmCache).toContain("orgId=${encodeURIComponent(");
    expect(warmCache).toContain("&key=${WARM_CACHE_KEY}");
  });

  it("the endpoint accepts only the exact admin key and otherwise uses session auth", () => {
    expect(rateSummary).toContain('searchParams.get("key") === ADMIN_API_KEY');
    expect(rateSummary).toContain("isWarmCall ? warmOrgId! : await getOrganizationId()");
  });

  it("a warm request recomputes stale data instead of preserving it", () => {
    expect(rateSummary).toContain("cached?.data && !(isWarmCall && cached.isStale)");
  });
});
