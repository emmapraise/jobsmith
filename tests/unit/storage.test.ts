import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertValidKey, originalResumeKey, resumePrefix, userPrefix } from "@/lib/storage/keys";
import { createLocalStorage, verifyLocalSignature } from "@/lib/storage/local";

const uid = `unit-${crypto.randomUUID()}`;
afterAll(() => rm(path.join(process.cwd(), ".data", "storage", "uploads", "users", uid), { recursive: true, force: true }));

describe("keys", () => {
  it("builds keys under users/{userId}/resumes/{resumeId}/", () => {
    expect(userPrefix("u1")).toBe("users/u1/");
    expect(resumePrefix("u1", "r1")).toBe("users/u1/resumes/r1/");
    expect(originalResumeKey("u1", "r1", "v1", "pdf")).toBe("users/u1/resumes/r1/original-v1.pdf");
  });
  it("rejects path traversal and unsafe segments", () => {
    expect(() => userPrefix("../x")).toThrow();
    expect(() => userPrefix("a/b")).toThrow();
    expect(() => resumePrefix("u1", "..")).toThrow();
    expect(() => assertValidKey("users/u1/../../etc/passwd")).toThrow();
    expect(() => assertValidKey("/etc/passwd")).toThrow();
    expect(() => assertValidKey("other/u1/x")).toThrow();
  });
});

describe("local storage driver", () => {
  const s = createLocalStorage();
  const key = `users/${uid}/resumes/r1/original-v1.pdf`;

  it("round-trips, signs URLs that verify, and rejects tampering and expiry", async () => {
    await s.put("uploads", key, new TextEncoder().encode("hello"), { contentType: "application/pdf" });
    expect(await s.exists("uploads", key)).toBe(true);
    expect(new TextDecoder().decode((await s.get("uploads", key))!)).toBe("hello");

    const url = new URL(await s.getSignedUrl("uploads", key, { expiresInSeconds: 60, downloadName: "my cv.pdf" }), "http://x");
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;
    const name = url.searchParams.get("name")!;
    expect(name).toBe("my cv.pdf");
    expect(verifyLocalSignature("uploads", key, exp, name, sig)).toBe(true);
    expect(verifyLocalSignature("uploads", key + "x", exp, name, sig)).toBe(false);
    expect(verifyLocalSignature("exports", key, exp, name, sig)).toBe(false);
    expect(verifyLocalSignature("uploads", key, exp + 1, name, sig)).toBe(false);
    expect(verifyLocalSignature("uploads", key, Math.floor(Date.now() / 1000) - 1, name, sig)).toBe(false);
  });

  it("caps URL lifetime at one hour", async () => {
    const url = new URL(await s.getSignedUrl("uploads", key, { expiresInSeconds: 999_999 }), "http://x");
    expect(Number(url.searchParams.get("exp")) - Date.now() / 1000).toBeLessThanOrEqual(3601);
  });

  it("deletes everything under a prefix and counts it", async () => {
    await s.put("uploads", `users/${uid}/resumes/r2/a.pdf`, new Uint8Array([1]), { contentType: "application/pdf" });
    expect(await s.deletePrefix("uploads", `users/${uid}/`)).toBeGreaterThanOrEqual(2);
    expect(await s.exists("uploads", key)).toBe(false);
    expect(await s.deletePrefix("uploads", `users/${uid}/`)).toBe(0);
  });
});

import { createR2Storage } from "@/lib/storage/r2";
import { StorageNotConfiguredError } from "@/lib/storage/types";

describe("R2 storage without credentials", () => {
  it("fails with a clear error only when storage is used, not at boot", () => {
    expect(() => createR2Storage()).toThrow(StorageNotConfiguredError);
  });
});
