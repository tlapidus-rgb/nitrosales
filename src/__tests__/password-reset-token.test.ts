import { afterEach, describe, expect, it } from "vitest";
import {
  passwordFingerprint,
  signPasswordResetToken,
  verifyPasswordResetToken,
} from "@/lib/password-reset-token";

const SECRET = "test-secret-para-password-reset";

afterEach(() => {
  delete process.env.NEXTAUTH_SECRET;
});

describe("password-reset-token", () => {
  it("firma y verifica un token válido", () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    const fingerprint = passwordFingerprint("hashed-password");
    const token = signPasswordResetToken({
      userId: "user_123",
      email: "Test@Email.com",
      pwFingerprint: fingerprint,
      ttlMs: 60_000,
    });

    const payload = verifyPasswordResetToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("user_123");
    expect(payload?.email).toBe("test@email.com");
    expect(payload?.pwFingerprint).toBe(fingerprint);
  });

  it("rechaza un token expirado o manipulado", () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    const token = signPasswordResetToken({
      userId: "user_123",
      email: "test@email.com",
      pwFingerprint: passwordFingerprint("hashed-password"),
      ttlMs: -1,
    });

    expect(verifyPasswordResetToken(token)).toBeNull();

    const tampered = `${token}x`;
    expect(verifyPasswordResetToken(tampered)).toBeNull();
  });
});