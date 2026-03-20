// ══════════════════════════════════════════════════════════════
// Credential Encryption - AES-256-GCM
// ══════════════════════════════════════════════════════════════
// Encrypts/decrypts Connection credentials stored in the DB.
// Uses AES-256-GCM (authenticated encryption) via Node.js crypto.
//
// Requires env var: ENCRYPTION_KEY (32 bytes, hex-encoded = 64 chars)
// Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16; // GCM auth tag

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY env var must be 64 hex chars (32 bytes). " +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a JSON-serializable object.
 * Returns a string in format: iv:ciphertext:tag (all hex-encoded)
 */
export function encryptCredentials(data: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

/**
 * Decrypt a string produced by encryptCredentials().
 * Returns the original object.
 */
export function decryptCredentials(
  encryptedString: string
): Record<string, string> {
  const key = getEncryptionKey();
  const parts = encryptedString.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format (expected iv:ciphertext:tag)");
  }

  const [ivHex, ciphertext, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

/**
 * Check if a value looks like an encrypted string (iv:ciphertext:tag format).
 */
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length === 3 && parts[0].length === IV_LENGTH * 2;
}

/**
 * Check if ENCRYPTION_KEY is configured.
 * Returns false if not set (encryption will be skipped gracefully).
 */
export function isEncryptionConfigured(): boolean {
  const hex = process.env.ENCRYPTION_KEY;
  return !!hex && hex.length === 64;
}
