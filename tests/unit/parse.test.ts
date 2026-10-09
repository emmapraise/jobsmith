import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ generateStructured: vi.fn(), untrusted: (_: string, t: string) => t, UNTRUSTED_NOTICE: "" }));

import { toResumeContent, type ParsedResume } from "@/lib/resume/parse";
import { resumeContentSchema } from "@/lib/resume/schema";

const parsed: ParsedResume = {
  contact: { fullName: "Ada", headline: "", email: "a@b.co", phone: "", location: "Lagos", links: [{ label: "GitHub", url: "https://github.com/a" }] },
  summary: "  hi  ",
  experience: [{ company: "Acme", title: "Dev", location: "", start: "2022-01", end: "2023-01", current: true, bullets: ["  Built X ", "", "Did Y"] }],
  education: [],
  skills: [{ name: "", items: ["TS", "ts", " Go ", ""] }, { name: "Empty", items: [] }],
  projects: [],
  certifications: [],
  languages: [],
};

describe("toResumeContent", () => {
  it("assigns unique ids, trims, drops empty bullets/skill groups, dedupes skills, and clears end on current roles", () => {
    const r = toResumeContent(parsed);
    expect(resumeContentSchema.safeParse(r).success).toBe(true);
    expect(r.summary).toBe("hi");
    expect(r.experience[0].bullets.map((b) => b.text)).toEqual(["Built X", "Did Y"]);
    expect(r.experience[0].end).toBe("");
    expect(r.skills).toHaveLength(1);
    expect(r.skills[0]).toMatchObject({ name: "Skills", items: ["TS", "Go"] });
    const ids = [r.experience[0].id, ...r.experience[0].bullets.map((b) => b.id), r.contact.links[0].id];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
