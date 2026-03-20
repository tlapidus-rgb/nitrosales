import { describe, it, expect } from "vitest";
import { mapVtexStatus, isValidVtexStatus, VTEX_VALID_STATUSES } from "@/lib/vtex-status";

// ══════════════════════════════════════════════════════════════
// Test 3.1: Mapeo de status VTEX
// ══════════════════════════════════════════════════════════════
// Un solo test habría prevenido los Errores #2, #3, #7, #8,
// #10, #11, #12 (7 errores documentados).
// ══════════════════════════════════════════════════════════════

describe("mapVtexStatus", () => {
  // ── Statuses conocidos: mapeo exacto ──

  it("payment-pending → PENDING", () => {
    expect(mapVtexStatus("payment-pending")).toBe("PENDING");
  });

  it("payment-approved → APPROVED", () => {
    expect(mapVtexStatus("payment-approved")).toBe("APPROVED");
  });

  it("ready-for-handling → APPROVED", () => {
    expect(mapVtexStatus("ready-for-handling")).toBe("APPROVED");
  });

  it("handling → APPROVED", () => {
    expect(mapVtexStatus("handling")).toBe("APPROVED");
  });

  it("start-handling → APPROVED", () => {
    expect(mapVtexStatus("start-handling")).toBe("APPROVED");
  });

  it("waiting-for-sellers-confirmation → PENDING", () => {
    expect(mapVtexStatus("waiting-for-sellers-confirmation")).toBe("PENDING");
  });

  it("invoiced → INVOICED", () => {
    expect(mapVtexStatus("invoiced")).toBe("INVOICED");
  });

  it("canceled → CANCELLED", () => {
    expect(mapVtexStatus("canceled")).toBe("CANCELLED");
  });

  it("order-completed → DELIVERED", () => {
    expect(mapVtexStatus("order-completed")).toBe("DELIVERED");
  });

  it("replaced → APPROVED", () => {
    expect(mapVtexStatus("replaced")).toBe("APPROVED");
  });

  // ── Statuses intermedios: NO deben mapearse a CANCELLED ──
  // (Error #2 y #7: includes("cancel") los atrapaba como CANCELLED)

  it("cancellation-requested → PENDING (NO CANCELLED)", () => {
    expect(mapVtexStatus("cancellation-requested")).toBe("PENDING");
    expect(mapVtexStatus("cancellation-requested")).not.toBe("CANCELLED");
  });

  it("window-to-cancel → PENDING (NO CANCELLED)", () => {
    expect(mapVtexStatus("window-to-cancel")).toBe("PENDING");
    expect(mapVtexStatus("window-to-cancel")).not.toBe("CANCELLED");
  });

  // ── Case insensitivity ──

  it("handles uppercase input", () => {
    expect(mapVtexStatus("HANDLING")).toBe("APPROVED");
    expect(mapVtexStatus("INVOICED")).toBe("INVOICED");
    expect(mapVtexStatus("CANCELED")).toBe("CANCELLED");
  });

  it("handles mixed case input", () => {
    expect(mapVtexStatus("Payment-Approved")).toBe("APPROVED");
    expect(mapVtexStatus("Cancellation-Requested")).toBe("PENDING");
  });

  // ── Ghost orders: status vacío/null → null ──
  // (Error #3 y #10: se guardaban como APPROVED por default optimista)

  it("empty string → null (ghost order)", () => {
    expect(mapVtexStatus("")).toBeNull();
  });

  it("null → null (ghost order)", () => {
    expect(mapVtexStatus(null)).toBeNull();
  });

  it("undefined → null (ghost order)", () => {
    expect(mapVtexStatus(undefined)).toBeNull();
  });

  it("whitespace only → null (ghost order)", () => {
    expect(mapVtexStatus("   ")).toBeNull();
    expect(mapVtexStatus("\t")).toBeNull();
  });

  // ── Status desconocido: PENDING conservador ──
  // (NUNCA APPROVED como default — Error #3)

  it("unknown status → PENDING (not APPROVED)", () => {
    expect(mapVtexStatus("some-unknown-status")).toBe("PENDING");
    expect(mapVtexStatus("some-unknown-status")).not.toBe("APPROVED");
  });

  it("typo in status → PENDING", () => {
    expect(mapVtexStatus("canceleed")).toBe("PENDING");
    expect(mapVtexStatus("invoicedd")).toBe("PENDING");
  });

  // ── Whitespace trimming ──

  it("trims whitespace from status", () => {
    expect(mapVtexStatus(" handling ")).toBe("APPROVED");
    expect(mapVtexStatus("  invoiced  ")).toBe("INVOICED");
  });
});

describe("isValidVtexStatus", () => {
  it("returns true for known statuses", () => {
    expect(isValidVtexStatus("handling")).toBe(true);
    expect(isValidVtexStatus("invoiced")).toBe(true);
    expect(isValidVtexStatus("canceled")).toBe(true);
  });

  it("returns true for unknown but non-empty statuses", () => {
    expect(isValidVtexStatus("some-new-status")).toBe(true);
  });

  it("returns false for empty/null/undefined (ghost orders)", () => {
    expect(isValidVtexStatus("")).toBe(false);
    expect(isValidVtexStatus(null)).toBe(false);
    expect(isValidVtexStatus(undefined)).toBe(false);
    expect(isValidVtexStatus("   ")).toBe(false);
  });
});

describe("VTEX_VALID_STATUSES", () => {
  it("contains all 8 filterable statuses", () => {
    expect(VTEX_VALID_STATUSES).toHaveLength(8);
  });

  it("includes key statuses", () => {
    expect(VTEX_VALID_STATUSES).toContain("payment-pending");
    expect(VTEX_VALID_STATUSES).toContain("handling");
    expect(VTEX_VALID_STATUSES).toContain("invoiced");
    expect(VTEX_VALID_STATUSES).toContain("canceled");
    expect(VTEX_VALID_STATUSES).toContain("cancellation-requested");
    expect(VTEX_VALID_STATUSES).toContain("window-to-cancel");
  });

  it("does NOT contain empty string or ghost-inducing values", () => {
    expect(VTEX_VALID_STATUSES).not.toContain("");
    expect(VTEX_VALID_STATUSES).not.toContain(null);
    expect(VTEX_VALID_STATUSES).not.toContain(undefined);
  });
});
