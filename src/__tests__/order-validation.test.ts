import { describe, it, expect } from "vitest";
import {
  isOrderValidForImport,
  isOrderAlreadyImported,
  filterOrdersForImport,
  VtexOrderSummary,
} from "@/lib/order-validation";

// ══════════════════════════════════════════════════════════════
// 3.2 — Idempotency Tests
// 3.3 — Anti-Ghost Filter Tests
// ══════════════════════════════════════════════════════════════

describe("isOrderValidForImport", () => {
  // ── Valid orders ──
  it("accepts a normal order with status and value", () => {
    const result = isOrderValidForImport({
      orderId: "ORD-001",
      status: "handling",
      totalValue: 15000,
    });
    expect(result).toEqual({ valid: true });
  });

  it("accepts an order with any known VTEX status", () => {
    const statuses = [
      "payment-pending",
      "payment-approved",
      "handling",
      "invoiced",
      "canceled",
    ];
    for (const status of statuses) {
      const result = isOrderValidForImport({
        orderId: `ORD-${status}`,
        status,
        totalValue: 5000,
      });
      expect(result).toEqual({ valid: true });
    }
  });

  it("accepts an order with a small positive value", () => {
    const result = isOrderValidForImport({
      orderId: "ORD-SMALL",
      status: "invoiced",
      totalValue: 1, // 1 centavo
    });
    expect(result).toEqual({ valid: true });
  });

  // ── Ghost orders: empty/null/undefined status ──
  it("rejects order with empty string status", () => {
    const result = isOrderValidForImport({
      orderId: "GHOST-1",
      status: "",
      totalValue: 10000,
    });
    expect(result).toEqual({ valid: false, reason: "empty-status" });
  });

  it("rejects order with null status", () => {
    const result = isOrderValidForImport({
      orderId: "GHOST-2",
      status: null,
      totalValue: 10000,
    });
    expect(result).toEqual({ valid: false, reason: "empty-status" });
  });

  it("rejects order with undefined status", () => {
    const result = isOrderValidForImport({
      orderId: "GHOST-3",
      status: undefined,
      totalValue: 10000,
    });
    expect(result).toEqual({ valid: false, reason: "empty-status" });
  });

  it('rejects order with literal string "null"', () => {
    const result = isOrderValidForImport({
      orderId: "GHOST-4",
      status: "null",
      totalValue: 10000,
    });
    expect(result).toEqual({ valid: false, reason: "empty-status" });
  });

  it('rejects order with literal string "undefined"', () => {
    const result = isOrderValidForImport({
      orderId: "GHOST-5",
      status: "undefined",
      totalValue: 10000,
    });
    expect(result).toEqual({ valid: false, reason: "empty-status" });
  });

  it("rejects order with whitespace-only status", () => {
    const result = isOrderValidForImport({
      orderId: "GHOST-6",
      status: "   ",
      totalValue: 10000,
    });
    expect(result).toEqual({ valid: false, reason: "empty-status" });
  });

  // ── Zero-value orders ──
  it("rejects order with zero totalValue", () => {
    const result = isOrderValidForImport({
      orderId: "ZERO-1",
      status: "handling",
      totalValue: 0,
    });
    expect(result).toEqual({ valid: false, reason: "zero-value" });
  });

  it("rejects order with null totalValue", () => {
    const result = isOrderValidForImport({
      orderId: "ZERO-2",
      status: "handling",
      totalValue: null,
    });
    expect(result).toEqual({ valid: false, reason: "zero-value" });
  });

  it("rejects order with undefined totalValue", () => {
    const result = isOrderValidForImport({
      orderId: "ZERO-3",
      status: "handling",
      totalValue: undefined,
    });
    expect(result).toEqual({ valid: false, reason: "zero-value" });
  });

  // ── Priority: status checked before value ──
  it("reports empty-status before zero-value when both are invalid", () => {
    const result = isOrderValidForImport({
      orderId: "BOTH-BAD",
      status: "",
      totalValue: 0,
    });
    expect(result).toEqual({ valid: false, reason: "empty-status" });
  });
});

describe("isOrderAlreadyImported (idempotency)", () => {
  const existingIds = new Set(["ORD-001", "ORD-002", "ORD-003"]);

  it("returns true for an order already in the set", () => {
    expect(isOrderAlreadyImported("ORD-001", existingIds)).toBe(true);
  });

  it("returns false for a new order not in the set", () => {
    expect(isOrderAlreadyImported("ORD-999", existingIds)).toBe(false);
  });

  it("handles numeric orderId by converting to string", () => {
    const numericIds = new Set(["12345"]);
    expect(isOrderAlreadyImported("12345", numericIds)).toBe(true);
  });

  it("returns false for empty set", () => {
    expect(isOrderAlreadyImported("ORD-001", new Set())).toBe(false);
  });
});

describe("filterOrdersForImport (combined idempotency + validation)", () => {
  const existingIds = new Set(["ORD-EXISTS-1", "ORD-EXISTS-2"]);

  const batch: VtexOrderSummary[] = [
    // Should be imported: valid and new
    { orderId: "ORD-NEW-1", status: "handling", totalValue: 15000 },
    { orderId: "ORD-NEW-2", status: "invoiced", totalValue: 8000 },
    // Should be skipped: already exists
    { orderId: "ORD-EXISTS-1", status: "handling", totalValue: 20000 },
    // Should be skipped: ghost (empty status)
    { orderId: "ORD-GHOST", status: "", totalValue: 10000 },
    // Should be skipped: zero value
    { orderId: "ORD-ZERO", status: "handling", totalValue: 0 },
    // Should be skipped: null status
    { orderId: "ORD-NULL", status: null, totalValue: 5000 },
    // Should be imported: valid and new
    { orderId: "ORD-NEW-3", status: "canceled", totalValue: 3000 },
  ];

  it("correctly separates valid orders from skipped ones", () => {
    const result = filterOrdersForImport(batch, existingIds);
    expect(result.toImport).toHaveLength(3);
    expect(result.skipped).toHaveLength(4);
  });

  it("imports only valid new orders", () => {
    const result = filterOrdersForImport(batch, existingIds);
    const importedIds = result.toImport.map((o) => o.orderId);
    expect(importedIds).toEqual(["ORD-NEW-1", "ORD-NEW-2", "ORD-NEW-3"]);
  });

  it("reports correct skip reasons", () => {
    const result = filterOrdersForImport(batch, existingIds);
    const reasons = Object.fromEntries(
      result.skipped.map((s) => [s.orderId, s.reason])
    );
    expect(reasons["ORD-EXISTS-1"]).toBe("already-exists");
    expect(reasons["ORD-GHOST"]).toBe("empty-status");
    expect(reasons["ORD-ZERO"]).toBe("zero-value");
    expect(reasons["ORD-NULL"]).toBe("empty-status");
  });

  it("idempotency: running twice with same existing set gives same result", () => {
    const result1 = filterOrdersForImport(batch, existingIds);
    const result2 = filterOrdersForImport(batch, existingIds);
    expect(result1.toImport).toEqual(result2.toImport);
    expect(result1.skipped).toEqual(result2.skipped);
  });

  it("idempotency: after importing, orders are in existing set and get skipped", () => {
    const result1 = filterOrdersForImport(batch, existingIds);
    // Simulate: after import, add imported orders to existingIds
    const updatedIds = new Set(existingIds);
    for (const order of result1.toImport) {
      updatedIds.add(String(order.orderId));
    }
    // Second run: all previously imported orders should now be skipped
    const result2 = filterOrdersForImport(batch, updatedIds);
    expect(result2.toImport).toHaveLength(0);
    expect(result2.skipped).toHaveLength(7);
  });

  it("handles empty batch", () => {
    const result = filterOrdersForImport([], existingIds);
    expect(result.toImport).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("handles empty existing set (all new orders)", () => {
    const validBatch: VtexOrderSummary[] = [
      { orderId: "A", status: "handling", totalValue: 1000 },
      { orderId: "B", status: "invoiced", totalValue: 2000 },
    ];
    const result = filterOrdersForImport(validBatch, new Set());
    expect(result.toImport).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });
});
