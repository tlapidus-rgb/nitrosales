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
    // La clave pública ya no abre rate-summary: va la credencial interna en un
    // header (src/lib/credencial-interna.ts; comportamiento en metricas-sin-clave-publica).
    expect(warmCache).toContain('credencialInterna("warm-cache")');
  });

  it("the endpoint accepts only the internal warm-cache credential and otherwise uses session auth", () => {
    expect(rateSummary).toContain('traeCredencialInterna(request, "warm-cache")');
    expect(rateSummary).not.toContain('searchParams.get("key")');
    expect(rateSummary).toContain("isWarmCall ? warmOrgId! : await getOrganizationId()");
  });

  it("a warm request recomputes stale data instead of preserving it", () => {
    expect(rateSummary).toContain("cached?.data && !(isWarmCall && cached.isStale)");
  });
});
