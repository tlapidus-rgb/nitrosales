import { describe, it, expect } from "vitest";
import { buildVtexHeaders, buildVtexBaseUrl } from "@/lib/vtex-credentials";

// ══════════════════════════════════════════════════════════════
// vtex-credentials.ts - Unit Tests
// ══════════════════════════════════════════════════════════════
// Note: getVtexCredentials and getVtexConfig need DB mocking,
// so we test the pure helper functions here.
// Integration tests for credential lookup can be added later.

describe("buildVtexHeaders", () => {
  it("builds correct header object from credentials", () => {
    const creds = {
      accountName: "mundojuguete",
      appKey: "vtexappkey-test-ABC123",
      appToken: "TOKEN_VALUE_HERE",
    };

    const headers = buildVtexHeaders(creds);

    expect(headers["X-VTEX-API-AppKey"]).toBe("vtexappkey-test-ABC123");
    expect(headers["X-VTEX-API-AppToken"]).toBe("TOKEN_VALUE_HERE");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("does not add extra fields", () => {
    const creds = {
      accountName: "teststore",
      appKey: "key",
      appToken: "token",
    };

    const headers = buildVtexHeaders(creds);
    const keys = Object.keys(headers);

    expect(keys).toHaveLength(3);
    expect(keys).toContain("X-VTEX-API-AppKey");
    expect(keys).toContain("X-VTEX-API-AppToken");
    expect(keys).toContain("Content-Type");
  });
});

describe("buildVtexBaseUrl", () => {
  it("builds correct URL from account name", () => {
    expect(buildVtexBaseUrl("mundojuguete")).toBe(
      "https://mundojuguete.vtexcommercestable.com.br"
    );
  });

  it("works with different account names", () => {
    expect(buildVtexBaseUrl("mystore")).toBe(
      "https://mystore.vtexcommercestable.com.br"
    );
  });

  it("handles hyphenated account names", () => {
    expect(buildVtexBaseUrl("my-store-name")).toBe(
      "https://my-store-name.vtexcommercestable.com.br"
    );
  });
});
