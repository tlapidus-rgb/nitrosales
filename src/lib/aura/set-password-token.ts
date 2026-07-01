// ══════════════════════════════════════════════════════════════
// Aura — Token de set-password del afiliado (Opción B onboarding)
// ══════════════════════════════════════════════════════════════
// Token firmado (HMAC-SHA256) que viaja en el link del mail de onboarding.
// El afiliado define su propia clave → nunca viaja en texto plano.
//
// HARDENING (spec del security-review):
//  1. Fail-hard si falta NEXTAUTH_SECRET (NO cae a un fallback forjable).
//  2. scope "set-password" en el payload, chequeado PRIMERO (no se cruza con impersonate).
//  3. timingSafeEqual para comparar la firma (no ===, evita timing side-channel).
//  4. Single-use vía pwFingerprint: fingerprint del dashboardPassword actual; cuando el
//     afiliado setea la clave, el fingerprint cambia y el token queda STALE (sin tabla nueva).
//  5. Authz token↔URL: la verificación del payload da influencerId+organizationId+code; el
//     ENDPOINT debe chequear que matcheen el slug/code/org de la URL (NO se hace acá).
//  6. TTL 72h.
// ══════════════════════════════════════════════════════════════

import { createHmac, createHash, timingSafeEqual } from "crypto";

const SCOPE = "set-password" as const;
const DEFAULT_TTL_MS = 72 * 60 * 60 * 1000; // 72 horas

/** Fail-hard: sin secret, no se firma/verifica nada (un fallback sería forjable). */
function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s || s.trim() === "") {
    throw new Error(
      "NEXTAUTH_SECRET no configurado — no se pueden firmar/verificar tokens de set-password",
    );
  }
  return s;
}

/**
 * Fingerprint del estado actual del dashboardPassword (no secreto; va dentro del payload firmado).
 * "none" si todavía no hay clave. Cuando la clave se setea/cambia, el fingerprint cambia → el
 * token viejo queda inválido (single-use sin estado server extra).
 */
export function passwordFingerprint(dashboardPassword: string | null | undefined): string {
  return createHash("sha256").update(dashboardPassword || "__none__").digest("hex").slice(0, 16);
}

export type SetPasswordTokenPayload = {
  scope: typeof SCOPE;
  influencerId: string;
  organizationId: string;
  code: string;
  pwFingerprint: string;
  exp: number;
};

export function signSetPasswordToken(input: {
  influencerId: string;
  organizationId: string;
  code: string;
  pwFingerprint: string;
  ttlMs?: number;
}): string {
  const secret = getSecret();
  const payload: SetPasswordTokenPayload = {
    scope: SCOPE,
    influencerId: input.influencerId,
    organizationId: input.organizationId,
    code: input.code,
    pwFingerprint: input.pwFingerprint,
    exp: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url").slice(0, 32);
  return `${data}.${sig}`;
}

/** Verifica firma + scope + expiración + estructura. Devuelve el payload o null. */
export function verifySetPasswordToken(token: string): SetPasswordTokenPayload | null {
  try {
    const secret = getSecret();
    if (typeof token !== "string") return null;
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;

    const expectedSig = createHmac("sha256", secret).update(data).digest("base64url").slice(0, 32);
    // length guard antes de timingSafeEqual (que tira si difieren longitudes).
    if (sig.length !== expectedSig.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    // scope PRIMERO: un token de otro scope (impersonate) no sirve acá.
    if (payload.scope !== SCOPE) return null;
    if (
      !payload.influencerId ||
      !payload.organizationId ||
      !payload.code ||
      !payload.pwFingerprint ||
      !payload.exp
    ) {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload as SetPasswordTokenPayload;
  } catch {
    return null;
  }
}
