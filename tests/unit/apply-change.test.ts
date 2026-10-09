import { describe, expect, it } from "vitest";
import { applyChange, applyChanges, ChangeError, type Change } from "@/lib/resume/apply-change";
import { emptyResume, type ResumeContent } from "@/lib/resume/schema";

const base = (): ResumeContent => ({
  ...emptyResume(),
  contact: { ...emptyResume().contact, fullName: "Ada", headline: "Engineer" },
  experience: [
    { id: "e1", company: "Acme", title: "Dev", location: "", start: "2022-01", end: "", current: true, bullets: [{ id: "b1", text: "Built APIs" }] },
  ],
  skills: [{ id: "s1", name: "Languages", items: ["TypeScript"] }],
  projects: [{ id: "p1", name: "Side", url: "", description: "", technologies: [], bullets: [] }],
});

const change = (over: Partial<Change>): Change => ({
  op: "set_summary", targetId: null, text: null, groupName: null, items: [], role: null, cert: null, description: "d", reason: "r", ...over,
});

describe("applyChange", () => {
  it("never mutates the input", () => {
    const r = base();
    const snapshot = JSON.stringify(r);
    applyChange(r, change({ op: "add_bullet", targetId: "e1", text: "Led migration" }));
    expect(JSON.stringify(r)).toBe(snapshot);
  });

  it("adds a bullet to an experience or a project, with a new id", () => {
    const a = applyChange(base(), change({ op: "add_bullet", targetId: "e1", text: " Led migration " }));
    expect(a.experience[0].bullets.map((b) => b.text)).toEqual(["Built APIs", "Led migration"]);
    expect(new Set(a.experience[0].bullets.map((b) => b.id)).size).toBe(2);
    const b = applyChange(base(), change({ op: "add_bullet", targetId: "p1", text: "Shipped" }));
    expect(b.projects[0].bullets).toHaveLength(1);
  });

  it("replaces a bullet by id", () => {
    const a = applyChange(base(), change({ op: "replace_bullet", targetId: "b1", text: "Built APIs used by 40k users" }));
    expect(a.experience[0].bullets[0].text).toBe("Built APIs used by 40k users");
    expect(a.experience[0].bullets[0].id).toBe("b1");
  });

  it("adds skills to an existing group (case-insensitive dedupe) or creates a group", () => {
    const a = applyChange(base(), change({ op: "add_skills", groupName: "languages", items: ["typescript", "Go"] }));
    expect(a.skills[0].items).toEqual(["TypeScript", "Go"]);
    const b = applyChange(base(), change({ op: "add_skills", groupName: "Cloud", items: ["AWS"] }));
    expect(b.skills.map((g) => g.name)).toEqual(["Languages", "Cloud"]);
    expect(() => applyChange(base(), change({ op: "add_skills", groupName: "Languages", items: ["TypeScript"] }))).toThrow(ChangeError);
  });

  it("sets summary and headline", () => {
    expect(applyChange(base(), change({ op: "set_summary", text: "Hi" })).summary).toBe("Hi");
    expect(applyChange(base(), change({ op: "set_headline", text: "Staff Eng" })).contact.headline).toBe("Staff Eng");
  });

  it("ends and un-ends a role", () => {
    const ended = applyChange(base(), change({ op: "set_role_end", targetId: "e1", text: "2025-03" }));
    expect(ended.experience[0]).toMatchObject({ end: "2025-03", current: false });
    const back = applyChange(ended, change({ op: "mark_role_current", targetId: "e1" }));
    expect(back.experience[0]).toMatchObject({ end: "", current: true });
    expect(() => applyChange(base(), change({ op: "set_role_end", targetId: "e1", text: "March 2025" }))).toThrow(ChangeError);
  });

  it("adds an experience (newest first) and a certification", () => {
    const a = applyChange(base(), change({
      op: "add_experience", text: "Own the platform",
      role: { company: "NewCo", title: "Lead", location: "London", start: "2025-04", end: "", current: true },
    }));
    expect(a.experience[0]).toMatchObject({ company: "NewCo", current: true });
    expect(a.experience[0].bullets).toHaveLength(1);
    const c = applyChange(base(), change({ op: "add_certification", cert: { name: "AWS SAA", issuer: "AWS", date: "2024" } }));
    expect(c.certifications[0].name).toBe("AWS SAA");
  });

  it("throws ChangeError for missing targets or missing fields — it never invents", () => {
    expect(() => applyChange(base(), change({ op: "add_bullet", targetId: "nope", text: "x" }))).toThrow(ChangeError);
    expect(() => applyChange(base(), change({ op: "add_bullet", targetId: "e1", text: "  " }))).toThrow(ChangeError);
    expect(() => applyChange(base(), change({ op: "replace_bullet", targetId: "nope", text: "x" }))).toThrow(ChangeError);
    expect(() => applyChange(base(), change({ op: "add_experience", role: null }))).toThrow(ChangeError);
    expect(() => applyChange(base(), change({ op: "add_certification", cert: { name: "", issuer: "", date: "" } }))).toThrow(ChangeError);
  });
});

describe("applyChanges", () => {
  it("applies what it can and counts skipped changes", () => {
    const { resume, skipped } = applyChanges(base(), [
      change({ op: "set_summary", text: "A" }),
      change({ op: "add_bullet", targetId: "gone", text: "x" }),
      change({ op: "set_headline", text: "H" }),
    ]);
    expect(skipped).toBe(1);
    expect(resume.summary).toBe("A");
    expect(resume.contact.headline).toBe("H");
  });
});
