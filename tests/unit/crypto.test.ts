import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("secret encryption", () => {
  it("round-trips, uses a fresh IV each time, and never contains the plaintext", () => {
    const a = encryptSecret("sk-test-1234567890");
    const b = encryptSecret("sk-test-1234567890");
    expect(a).not.toBe(b);
    expect(a).not.toContain("sk-test");
    expect(decryptSecret(a)).toBe("sk-test-1234567890");
  });
  it("returns null for tampered, truncated or garbage input", () => {
    const blob = encryptSecret("secret-value-abc");
    const [v, iv, tag, ct] = blob.split(".");
    expect(decryptSecret([v, iv, tag, ct.slice(0, -2) + "AA"].join("."))).toBeNull();
    expect(decryptSecret([v, iv, tag].join("."))).toBeNull();
    expect(decryptSecret("garbage")).toBeNull();
    expect(decryptSecret("v2." + [iv, tag, ct].join("."))).toBeNull();
  });
});
