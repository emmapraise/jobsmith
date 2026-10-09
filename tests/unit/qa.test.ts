import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.fn();
vi.mock("@/lib/llm", () => ({
  generateStructured: (...a: unknown[]) => generateStructured(...a),
  untrusted: (_: string, t: string) => t,
  UNTRUSTED_NOTICE: "",
}));

import { generateQuestions, proposeChanges } from "@/lib/resume/qa";
import { emptyResume, type ResumeContent } from "@/lib/resume/schema";
import type { QAQuestion } from "@/lib/db/schema";

const resume: ResumeContent = {
  ...emptyResume(),
  experience: [{ id: "e1", company: "Acme", title: "Dev", location: "", start: "2022-01", end: "", current: true, bullets: [{ id: "b1", text: "Built APIs" }] }],
};
const questions: QAQuestion[] = [
  { id: "q1", question: "Still at Acme?", why: "w", kind: "yes_no" },
  { id: "q2", question: "Any numbers?", why: "w", kind: "text", targetId: "e1" },
];
const c = (o: object) => ({ op: "add_bullet", targetId: "e1", text: "x", groupName: null, items: [], role: null, cert: null, description: "d", reason: "r", ...o });

beforeEach(() => generateStructured.mockReset());

describe("generateQuestions", () => {
  it("caps at 8, drops blanks, assigns ids, and only keeps choices for choice questions", async () => {
    generateStructured.mockResolvedValue({
      questions: [
        { question: "  ", why: "", kind: "text", choices: [], targetId: null },
        ...Array.from({ length: 10 }, (_, i) => ({ question: `Q${i}`, why: "w", kind: i === 0 ? "choice" : "text", choices: i === 0 ? ["a", "b"] : ["zzz"], targetId: null })),
      ],
    });
    const qs = await generateQuestions(resume);
    expect(qs).toHaveLength(8);
    expect(qs[0].choices).toEqual(["a", "b"]);
    expect(qs[1].choices).toBeUndefined();
    expect(new Set(qs.map((q) => q.id)).size).toBe(8);
  });
});

describe("proposeChanges (truthfulness guard)", () => {
  it("does not call the model when nothing was answered", async () => {
    const out = await proposeChanges(resume, questions, [{ questionId: "q1", answer: "", skipped: true }]);
    expect(out).toEqual([]);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("keeps changes that apply and silently drops ones that reference things that don't exist", async () => {
    generateStructured.mockResolvedValue({
      changes: [c({ text: "Led migration" }), c({ targetId: "ghost", text: "Invented" }), c({ op: "replace_bullet", targetId: "nope", text: "x" })],
    });
    const out = await proposeChanges(resume, questions, [{ questionId: "q2", answer: "Led a migration", skipped: false }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ decision: "pending", description: "d", reason: "r" });
  });

  it("sends only answered questions to the model (skipped answers never reach it)", async () => {
    generateStructured.mockResolvedValue({ changes: [] });
    await proposeChanges(resume, questions, [
      { questionId: "q1", answer: "", skipped: true },
      { questionId: "q2", answer: "40k users", skipped: false },
    ]);
    const prompt = generateStructured.mock.calls[0][1].prompt as string;
    expect(prompt).toContain("40k users");
    expect(prompt).not.toContain("Still at Acme?");
  });
});
