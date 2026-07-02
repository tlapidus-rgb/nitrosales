import { createHash, createHmac, timingSafeEqual } from "crypto";

const SCOPE = "password-reset" as const;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error("NEXTAUTH_SECRET no configurado — no se pueden firmar/verificar tokens de reset");
  }
  return secret;
}

export function passwordFingerprint(hashedPassword: string | null | undefined): string {
  return createHash("sha256").update(hashedPassword || "__none__").digest("hex").slice(0, 16);
}

export type PasswordResetTokenPayload = {
  scope: typeof SCOPE;
  userId: string;
  email: string;
  pwFingerprint: string;
  exp: number;
};

export function signPasswordResetToken(input: {
  userId: string;
  email: string;
  pwFingerprint: string;
  ttlMs?: number;
}): string {
  const secret = getSecret();
  const payload: PasswordResetTokenPayload = {
    scope: SCOPE,
    userId: input.userId,
    email: input.email.toLowerCase(),
    pwFingerprint: input.pwFingerprint,
    exp: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url").slice(0, 32);
  return `${data}.${sig}`;
}

export function verifyPasswordResetToken(token: string): PasswordResetTokenPayload | null {
  try {
    const secret = getSecret();
    if (typeof token !== "string") return null;
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;

    const expectedSig = createHmac("sha256", secret).update(data).digest("base64url").slice(0, 32);
    if (sig.length !== expectedSig.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    if (payload.scope !== SCOPE) return null;
    if (!payload.userId || !payload.email || !payload.pwFingerprint || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload as PasswordResetTokenPayload;
  } catch {
    return null;
  }
}