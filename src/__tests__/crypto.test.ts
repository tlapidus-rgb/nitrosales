import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// ══════════════════════════════════════════════════════════════
// crypto.ts - Unit Tests
// ══════════════════════════════════════════════════════════════

// Set a test encryption key before importing the module
const TEST_KEY =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

describe("crypto", () => {
  let encryptCredentials: typeof import("@/lib/crypto").encryptCredentials;
  let decryptCredentials: typeof import("@/lib/crypto").decryptCredentials;
  let isEncrypted: typeof import("@/lib/crypto").isEncrypted;
  let isEncryptionConfigured: typeof import("@/lib/crypto").isEncryptionConfigured;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    // Dynamic import after setting env var
    const mod = await import("@/lib/crypto");
    encryptCredentials = mod.encryptCredentials;
    decryptCredentials = mod.decryptCredentials;
    isEncrypted = mod.isEncrypted;
    isEncryptionConfigured = mod.isEncryptionConfigured;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("encrypts and decrypts credentials round-trip", () => {
    const original = {
      accountName: "mundojuguete",
      appKey: "vtexappkey-test-ABC123",
      appToken: "SOME_LONG_TOKEN_VALUE",
    };

    const encrypted = encryptCredentials(original);
    expect(typeof encrypted).toBe("string");
    expect(encrypted).not.toContain("mundojuguete");
    expect(encrypted).not.toContain("ABC123");

    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(original);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const data = { appKey: "test", appToken: "token", accountName: "store" };
    const enc1 = encryptCredentials(data);
    const enc2 = encryptCredentials(data);
    expect(enc1).not.toBe(enc2); // Different IVs = different output
  });

  it("detects encrypted format correctly", () => {
    const data = { appKey: "test", appToken: "token", accountName: "store" };
    const encrypted = encryptCredentials(data);

    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted("not-encrypted")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
    expect(isEncrypted({ key: "value" })).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });

  it("fails to decrypt with wrong key", () => {
    const data = { appKey: "test", appToken: "token", accountName: "store" };
    const encrypted = encryptCredentials(data);

    // Change the key
    process.env.ENCRYPTION_KEY =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    expect(() => decryptCredentials(encrypted)).toThrow();

    // Restore
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it("fails to decrypt tampered ciphertext", () => {
    const data = { appKey: "test", appToken: "token", accountName: "store" };
    const encrypted = encryptCredentials(data);

    // Tamper with ciphertext
    const parts = encrypted.split(":");
    parts[1] = "ff" + parts[1].slice(2);
    const tampered = parts.join(":");

    expect(() => decryptCredentials(tampered)).toThrow();
  });

  it("reports encryption as configured", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  it("reports encryption as not configured when key is missing", () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    process.env.ENCRYPTION_KEY = saved;
  });
});
