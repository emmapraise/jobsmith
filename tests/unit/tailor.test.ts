import { describe, expect, it } from "vitest";
import type { ParsedJob } from "@/lib/jobs/schema";
import { applyTailorChange, changeState, revertTailorChange, withPending } from "@/lib/tailor/changes";
import { corpusHas, factCheck, keywordsPresent, numbersIn, resumeCorpus } from "@/lib/tailor/factcheck";
import { materializeChanges, type LlmOp } from "@/lib/tailor/materialize";
import { buildGaps, matchScore, sanitiseCoverage } from "@/lib/tailor/score";
import type { TailorChange } from "@/lib/tailor/types";
import { emptyResume, type ResumeContent } from "@/lib/resume/schema";

const master: ResumeContent = {
  ...emptyResume(),
  contact: { ...emptyResume().contact, fullName: "Ada Okafor", headline: "Backend Engineer" },
  summary: "Backend engineer with 7 years building payment APIs.",
  experience: [
    { id: "e1", company: "Acme", title: "Senior Backend Engineer", location: "Lagos", start: "2021-03", end: "", current: true, bullets: [
      { id: "b1", text: "Built Node.js payment APIs serving 40,000 daily users." },
      { id: "b2", text: "Reduced p95 latency from 900ms to 240ms." },
      { id: "b3", text: "Mentored four junior engineers." },
    ] },
  ],
  skills: [{ id: "s1", name: "Languages", items: ["TypeScript", "Python", "SQL"] }, { id: "s2", name: "Cloud", items: ["AWS", "Docker"] }],
  projects: [{ id: "p1", name: "Ledger", url: "", description: "", technologies: ["PostgreSQL"], bullets: [{ id: "pb1", text: "Designed a PostgreSQL ledger schema." }] }],
};

const job: ParsedJob = {
  title: "Backend Engineer", company: "Globex", location: "London", workMode: "hybrid", seniority: "senior", visaSponsorship: "offered", summary: "",
  keywords: ["Node.js", "Kubernetes", "PostgreSQL", "REST", "Terraform"], responsibilities: [],
  requirements: [
    { id: "r1", text: "Node.js APIs", importance: "must", category: "skill" },
    { id: "r2", text: "Kubernetes in production", importance: "must", category: "skill" },
    { id: "r3", text: "Terraform", importance: "nice", category: "skill" },
  ],
};

const op = (o: Partial<LlmOp>): LlmOp => ({ op: "rewrite_bullet", targetId: null, text: null, orderedIds: [], items: [], reason: "r", requirementIds: ["r1"], ...o });

describe("numbersIn", () => {
  it("normalises 40k, 40,000, 1.5m and percentages", () => {
    expect(numbersIn("40k users, 40,000 requests, 1.5m rows, 30% faster in 2021")).toEqual([40000, 40000, 1500000, 30, 2021]);
  });
});

describe("corpusHas", () => {
  it("is separator and case insensitive, and whole-word for short terms", () => {
    const c = resumeCorpus(master);
    expect(corpusHas(c, "node.js")).toBe(true);
    expect(corpusHas(c, "NodeJS")).toBe(true);
    expect(corpusHas(c, "Kubernetes")).toBe(false);
    expect(corpusHas("Worked at Google", "Go")).toBe(false); // short term must be its own word
    expect(corpusHas("Wrote Go services", "Go")).toBe(true);
    expect(corpusHas("Built JavaScript apps", "Java")).toBe(false); // whole tokens, not substrings
    expect(corpusHas("Wrote C++ services", "C")).toBe(false);
    expect(corpusHas("Mentored four engineers", "mentoring")).toBe(true); // light stemming
    expect(corpusHas("Designed REST APIs", "event-driven services")).toBe(false);
    expect(corpusHas("CI/CD pipelines in GitHub Actions", "CI/CD")).toBe(true);
  });
});

describe("factCheck (the truthfulness backstop)", () => {
  const corpus = resumeCorpus(master);
  const kw = job.keywords;
  it("accepts a faithful rewording that keeps the numbers", () => {
    expect(factCheck("Developed Node.js payment APIs for 40k daily users.", corpus, kw).ok).toBe(true);
  });
  it("rejects an invented number", () => {
    const r = factCheck("Built Node.js payment APIs serving 400,000 daily users.", corpus, kw);
    expect(r.ok).toBe(false);
  });
  it("rejects a job keyword the resume does not evidence, even in lowercase", () => {
    expect(factCheck("Deployed services on kubernetes.", corpus, kw).ok).toBe(false);
    expect(factCheck("Managed terraform modules.", corpus, kw).ok).toBe(false);
  });
  it("rejects invented proper nouns and tech terms not in the job keywords", () => {
    expect(factCheck("Built payment APIs at Stripe.", corpus, kw).ok).toBe(false);
    expect(factCheck("Built APIs with GraphQL.", corpus, kw).ok).toBe(false);
  });
  it("rejects embellishing words lifted from multi-word job keywords", () => {
    const kws = [...kw, "high-throughput APIs", "performance tuning", "event-driven services"];
    expect(factCheck("Built high-throughput Node.js payment APIs for 40k daily users.", corpus, kws).ok).toBe(false);
    expect(factCheck("Built Node.js payment APIs for 40k daily users.", corpus, kws).ok).toBe(true);
    expect(factCheck("Led event-driven design.", corpus, kws).ok).toBe(false);
  });
  it("allows keywords that ARE evidenced", () => {
    expect(factCheck("Designed PostgreSQL schemas for a ledger.", corpus, kw).ok).toBe(true);
  });
});

describe("materializeChanges", () => {
  it("keeps valid ops and drops invented / invalid ones", () => {
    const { changes, dropped } = materializeChanges(master, job, [
      op({ targetId: "b1", text: "Developed Node.js payment APIs for 40k daily users." }),
      op({ targetId: "b2", text: "Reduced p95 latency from 900ms to 240ms on Kubernetes." }), // invented keyword
      op({ targetId: "nope", text: "x" }),
      op({ op: "reorder_bullets", targetId: "e1", orderedIds: ["b2", "b1", "b3"] }),
      op({ op: "reorder_bullets", targetId: "p1", orderedIds: ["zzz"] }), // not a permutation
      op({ op: "reorder_skills", targetId: "s1", items: ["python", "typescript", "sql"] }),
      op({ op: "add_skills", targetId: "s2", items: ["Kubernetes", "PostgreSQL"] }), // only PostgreSQL is evidenced
      op({ op: "set_summary", text: "Backend engineer with 7 years building payment APIs and 12 years of Go." }), // invented 12
      op({ op: "set_headline", text: "Senior Backend Engineer" }),
    ]);
    expect(changes.map((c) => c.kind)).toEqual(["bullet_text", "bullets_order", "skills_order", "skills_add", "headline"]);
    const add = changes.find((c) => c.kind === "skills_add");
    expect(add && add.kind === "skills_add" && add.items).toEqual(["PostgreSQL"]);
    const order = changes.find((c) => c.kind === "skills_order");
    expect(order && order.kind === "skills_order" && order.after).toEqual(["Python", "TypeScript", "SQL"]); // user's own spelling kept
    expect(dropped.map((d) => d.why).join("|")).toMatch(/unsupported/);
    expect(dropped.length).toBe(4); // add_skills is kept (only the evidenced skill)
    expect(changes.every((c) => c.decision === "pending")).toBe(true);
  });

  it("allows only one change per target and caps the total", () => {
    const { changes } = materializeChanges(master, job, [
      op({ targetId: "b1", text: "Developed Node.js payment APIs for 40k daily users." }),
      op({ targetId: "b1", text: "Engineered Node.js payment APIs for 40k daily users." }),
    ]);
    expect(changes).toHaveLength(1);
  });
});

describe("apply / revert / state", () => {
  const { changes } = materializeChanges(master, job, [
    op({ targetId: "b1", text: "Developed Node.js payment APIs for 40k daily users." }),
    op({ op: "reorder_bullets", targetId: "e1", orderedIds: ["b2", "b1", "b3"] }),
    op({ op: "reorder_skills", targetId: "s1", items: ["Python", "TypeScript", "SQL"] }),
    op({ op: "add_skills", targetId: "s2", items: ["PostgreSQL"] }),
    op({ op: "set_headline", text: "Senior Backend Engineer" }),
  ]);

  it("applies then reverts every kind back to the exact original", () => {
    let cur = master;
    for (const c of changes) {
      expect(changeState(cur, c)).toBe("unapplied");
      cur = applyTailorChange(cur, c);
      expect(changeState(cur, c)).toBe("applied");
    }
    expect(cur.experience[0].bullets.map((b) => b.id)).toEqual(["b2", "b1", "b3"]);
    expect(cur.experience[0].bullets.find((b) => b.id === "b1")?.text).toContain("Developed");
    expect(cur.skills[1].items).toContain("PostgreSQL");
    for (const c of [...changes].reverse()) cur = revertTailorChange(cur, c);
    expect(cur).toEqual(master);
  });

  it("never mutates the input and refuses stale or double application", () => {
    const snapshot = JSON.stringify(master);
    const c = changes[0];
    const applied = applyTailorChange(master, c);
    expect(JSON.stringify(master)).toBe(snapshot);
    expect(() => applyTailorChange(applied, c)).toThrow();
    const edited = structuredClone(applied);
    edited.experience[0].bullets[0].text = "User rewrote this themselves";
    expect(changeState(edited, c)).toBe("stale");
    expect(() => revertTailorChange(edited, c)).toThrow();
  });

  it("withPending shows all pending suggestions applied, skipping stale ones", () => {
    const preview = withPending(master, changes);
    expect(preview.experience[0].bullets[0].id).toBe("b2");
    const decided: TailorChange[] = changes.map((c, i) => (i === 0 ? { ...c, decision: "rejected" } : c));
    expect(withPending(master, decided).experience[0].bullets.find((b) => b.id === "b1")?.text).toBe(master.experience[0].bullets[0].text);
  });
});

describe("score and gaps", () => {
  it("weights must-haves 3x and counts partial as half; unassessed counts as a gap", () => {
    // r1 matched (3) + r2 gap (0) + r3 partial (0.5) = 3.5 / 7 = 50
    expect(matchScore(job.requirements, [
      { requirementId: "r1", status: "matched", evidence: "Node.js APIs at Acme" },
      { requirementId: "r2", status: "gap", evidence: "" },
      { requirementId: "r3", status: "partial", evidence: "x" },
    ])).toBe(50);
    expect(matchScore(job.requirements, [])).toBe(0);
    expect(matchScore([], [])).toBeNull();
  });

  it("downgrades 'matched' without evidence, drops unknown ids, fills missing as gaps", () => {
    const c = sanitiseCoverage(job.requirements, [
      { requirementId: "r1", status: "matched", evidence: "" },
      { requirementId: "zz", status: "matched", evidence: "x" },
    ]);
    expect(c.find((x) => x.requirementId === "r1")?.status).toBe("partial");
    expect(c.find((x) => x.requirementId === "zz")).toBeUndefined();
    expect(c.find((x) => x.requirementId === "r2")?.status).toBe("gap");
  });

  it("turns uncovered requirements into questions with a deterministic fallback", () => {
    const cov = sanitiseCoverage(job.requirements, [{ requirementId: "r1", status: "matched", evidence: "Acme" }]);
    const gaps = buildGaps(job.requirements, cov, new Map([["r2", "Have you run Kubernetes in production?"]]));
    expect(gaps.map((g) => g.requirementId)).toEqual(["r2", "r3"]);
    expect(gaps[0].question).toBe("Have you run Kubernetes in production?");
    expect(gaps[1].question).toMatch(/Terraform/);
    expect(gaps.every((g) => g.answer === null && !g.resolved)).toBe(true);
  });
});

describe("keywordsPresent", () => {
  it("splits job keywords into present and missing", () => {
    const k = keywordsPresent(master, job.keywords);
    expect(k.present.sort()).toEqual(["Node.js", "PostgreSQL"].sort());
    expect(k.missing.sort()).toEqual(["Kubernetes", "REST", "Terraform"].sort());
  });
});

import { assertStructureUnchanged, StructureError } from "@/lib/tailor/guard";

describe("assertStructureUnchanged (manual edits can't add facts)", () => {
  const edit = (fn: (r: ResumeContent) => void) => {
    const r = structuredClone(master);
    fn(r);
    return r;
  };
  const rejects = (r: ResumeContent) => expect(() => assertStructureUnchanged(master, r)).toThrow(StructureError);

  it("allows rewording, removing and reordering bullets, and editing summary/headline/skill order", () => {
    expect(() => assertStructureUnchanged(master, edit((r) => {
      r.summary = "Totally rewritten summary";
      r.contact.headline = "Platform Engineer";
      r.experience[0].bullets[0].text = "Reworded bullet";
      r.experience[0].bullets.splice(2, 1);
      r.experience[0].bullets.reverse();
      r.skills[0].items = ["SQL", "Python"];
    }))).not.toThrow();
  });
  it("rejects changed employer, title, dates, or location", () => {
    rejects(edit((r) => { r.experience[0].company = "Google"; }));
    rejects(edit((r) => { r.experience[0].title = "CTO"; }));
    rejects(edit((r) => { r.experience[0].start = "2015-01"; }));
    rejects(edit((r) => { r.experience[0].current = false; }));
  });
  it("rejects added or removed roles, projects, education, certifications, languages", () => {
    rejects(edit((r) => { r.experience.pop(); }));
    rejects(edit((r) => { r.projects.pop(); }));
    rejects(edit((r) => { r.education.push({ id: "x", institution: "MIT", degree: "PhD", field: "", location: "", start: "", end: "", details: [] }); }));
    rejects(edit((r) => { r.certifications.push({ id: "x", name: "CISSP", issuer: "ISC2", date: "2024" }); }));
    rejects(edit((r) => { r.languages.push({ id: "x", name: "German", level: "Fluent" }); }));
  });
  it("rejects brand-new bullets, duplicated bullets and new skills", () => {
    rejects(edit((r) => { r.experience[0].bullets.push({ id: "new", text: "Led a team of 50" }); }));
    rejects(edit((r) => { r.experience[0].bullets.push({ ...r.experience[0].bullets[0] }); }));
    rejects(edit((r) => { r.skills[0].items.push("Kubernetes"); }));
    // …but a skill the master already evidences elsewhere (bullets/projects) is fine, as an accepted suggestion may add it
    expect(() => assertStructureUnchanged(master, edit((r) => { r.skills[0].items.push("Node.js"); }))).not.toThrow();
    rejects(edit((r) => { r.skills.push({ id: "s9", name: "New", items: [] }); }));
  });
  it("rejects contact detail changes", () => {
    rejects(edit((r) => { r.contact.email = "other@example.com"; }));
    rejects(edit((r) => { r.contact.fullName = "Someone Else"; }));
  });
});

import { diffWords, similarity } from "@/lib/tailor/diff";

describe("diffWords", () => {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).join(" ");
  it("keeps every before-word in same+del and every after-word in same+add, in order", () => {
    const before = "Built Node.js payment APIs serving 40,000 daily users.";
    const after = "Developed Node.js payment APIs for 40,000 daily users.";
    const d = diffWords(before, after);
    expect(words(d.filter((p) => p.type !== "add").map((p) => p.text).join(""))).toBe(before);
    expect(words(d.filter((p) => p.type !== "del").map((p) => p.text).join(""))).toBe(after);
    expect(d.find((p) => p.type === "del")?.text).toContain("Built");
    expect(d.find((p) => p.type === "add")?.text).toContain("Developed");
  });
  it("groups each run of changes as one deletion then one addition (no interleaving)", () => {
    const d = diffWords("Reduced p95 latency of settlement service from 900ms", "Optimised settlement service p95 latency from 900ms");
    for (let i = 1; i < d.length; i++) expect(!(d[i].type === d[i - 1].type)).toBe(true); // runs are merged
    const types = d.map((p) => p.type).join(",");
    expect(types).not.toMatch(/add,del,add|del,add,del,add/);
  });
  it("handles empty sides and reports similarity", () => {
    expect(diffWords("", "new")).toEqual([{ text: "new", type: "add" }]);
    expect(diffWords("old", "")).toEqual([{ text: "old", type: "del" }]);
    expect(diffWords("same", "same")).toEqual([{ text: "same", type: "same" }]);
    expect(similarity(diffWords("a b c d", "a b c d"))).toBe(1);
    expect(similarity(diffWords("a b c d", "w x y z"))).toBe(0);
    expect(similarity(diffWords("Built APIs for users", "Built APIs for customers"))).toBeGreaterThan(0.5);
  });
});
