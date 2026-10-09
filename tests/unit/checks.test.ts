import { describe, expect, it } from "vitest";
import { estimateYearsExperience, reviewFlags } from "@/lib/resume/checks";
import { emptyResume, type ResumeContent } from "@/lib/resume/schema";

const role = (o: Partial<ResumeContent["experience"][number]>) => ({
  id: crypto.randomUUID(), company: "Co", title: "Dev", location: "", start: "2020-01", end: "2021-01", current: false, bullets: [{ id: "b", text: "x" }], ...o,
});

describe("reviewFlags", () => {
  it("flags an empty resume", () => {
    const msgs = reviewFlags(emptyResume()).map((f) => f.message);
    expect(msgs).toContain("We couldn't find your name.");
    expect(msgs).toContain("No email address found.");
    expect(msgs).toContain("No work experience was found.");
  });

  it("flags missing dates, reversed dates, invalid email, and missing end on non-current roles", () => {
    const r: ResumeContent = {
      ...emptyResume(),
      contact: { ...emptyResume().contact, fullName: "A", email: "nope", location: "UK" },
      experience: [role({ start: "" }), role({ start: "2022-05", end: "2021-01" }), role({ end: "", current: false })],
      skills: [{ id: "s", name: "x", items: ["a"] }],
    };
    const msgs = reviewFlags(r).map((f) => f.message).join("\n");
    expect(msgs).toMatch(/invalid/);
    expect(msgs).toMatch(/no start date/);
    expect(msgs).toMatch(/ends before it starts/);
    expect(msgs).toMatch(/no end date/);
  });

  it("is clean for a complete resume", () => {
    const r: ResumeContent = {
      ...emptyResume(),
      contact: { ...emptyResume().contact, fullName: "A", email: "a@b.co", location: "UK" },
      experience: [role({})],
      skills: [{ id: "s", name: "x", items: ["a"] }],
    };
    expect(reviewFlags(r)).toEqual([]);
  });
});

describe("estimateYearsExperience", () => {
  const at = new Date("2026-01-15");
  it("sums spans and merges overlaps", () => {
    const r: ResumeContent = { ...emptyResume(), experience: [role({ start: "2018-01", end: "2020-01" }), role({ start: "2019-01", end: "2021-01" })] };
    expect(estimateYearsExperience(r, at)).toBe(3); // 2018-01 → 2021-01 (merged), end of month math
  });
  it("counts current roles up to now and returns null with no usable dates", () => {
    const r: ResumeContent = { ...emptyResume(), experience: [role({ start: "2024-01", end: "", current: true })] };
    expect(estimateYearsExperience(r, at)).toBe(2);
    expect(estimateYearsExperience({ ...emptyResume(), experience: [role({ start: "" })] }, at)).toBeNull();
  });
});
