import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM for small secrets stored in the database (users' own API keys).
 * Key = SHA-256 of APP_ENCRYPTION_KEY (falls back to AUTH_SECRET). Rotating that secret makes stored
 * values undecryptable; users then simply re-enter their keys.
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
const key = () => createHash("sha256").update(env().APP_ENCRYPTION_KEY ?? env().AUTH_SECRET).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

/** Returns null if the value is malformed, tampered with, or encrypted under a different key. */
export function decryptSecret(blob: string): string | null {
  try {
    const [v, iv, tag, ct] = blob.split(".");
    if (v !== "v1" || !iv || !tag || !ct) return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
