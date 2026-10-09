import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.fn();
vi.mock("@/lib/llm", () => ({ generateStructured: (...a: unknown[]) => generateStructured(...a), untrusted: (_: string, t: string) => t, UNTRUSTED_NOTICE: "" }));

import { verifyChanges } from "@/lib/tailor/verify";
import { emptyResume } from "@/lib/resume/schema";
import type { TailorChange } from "@/lib/tailor/types";

const cfg = { provider: "openai" as const, model: "gpt-4.1", apiKey: "k" };
const text = (id: string): TailorChange => ({ id, kind: "bullet_text", bulletId: "b", before: "Designed ETL pipelines.", after: "Designed and maintained ETL pipelines.", reason: "", requirementIds: [], decision: "pending" });
const order: TailorChange = { id: "o", kind: "bullets_order", parentId: "e", before: ["a", "b"], after: ["b", "a"], reason: "", requirementIds: [], decision: "pending" };

beforeEach(() => generateStructured.mockReset());

describe("verifyChanges (soft-embellishment reviewer)", () => {
  it("keeps approved text changes, drops flagged and unreviewed ones (fail closed), never sends reorders", async () => {
    generateStructured.mockResolvedValue({ results: [{ id: "ok", supported: true, unsupportedClaims: [] }, { id: "bad", supported: false, unsupportedClaims: ["maintained"] }] });
    const { kept, dropped } = await verifyChanges(emptyResume(), [text("ok"), text("bad"), text("missing"), order], cfg);
    expect(kept.map((c) => c.id)).toEqual(["ok", "o"]);
    expect(dropped.map((d) => d.why)).toEqual(["unverified: maintained", "unverified: not confirmed by reviewer"]);
    const sent = generateStructured.mock.calls[0][1].prompt as string;
    expect(sent).not.toContain('"o"');
  });
  it("skips the model entirely when there is nothing textual to verify", async () => {
    const { kept } = await verifyChanges(emptyResume(), [order], cfg);
    expect(kept).toEqual([order]);
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
