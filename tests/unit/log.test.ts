import { describe, expect, it } from "vitest";
import { safeMeta } from "@/lib/log";

describe("log redaction", () => {
  it("redacts content-like keys and long strings, keeps small safe metadata", () => {
    const m = safeMeta({ resumeText: "secret", email: "a@b.c", kind: "pdf", version: 3, other: "x".repeat(200), ok: true });
    expect(m.resumeText).toBe("[redacted]");
    expect(m.email).toBe("[redacted]");
    expect(m.other).toBe("[redacted:long-string]");
    expect(m).toMatchObject({ kind: "pdf", version: 3, ok: true });
  });
});
