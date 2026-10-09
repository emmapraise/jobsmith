import { describe, expect, it } from "vitest";
import type { ParsedJob } from "@/lib/jobs/schema";
import { buildBrief, buildQuestions, clarifyEarly, finalizeFeedback, LIMITS, progressByQuestion, uncoveredSkills, type RawQuestion } from "@/lib/prep/build";
import { emptyProfile } from "@/lib/profile/schema";
import { emptyResume, type ResumeContent } from "@/lib/resume/schema";

const resume: ResumeContent = {
  ...emptyResume(),
  experience: [{ id: "e1", company: "Acme", title: "Dev", location: "", start: "2021-01", end: "", current: true, bullets: [{ id: "b1", text: "Built Node.js payment APIs serving 40,000 daily users." }, { id: "b2", text: "Mentored four junior engineers." }] }],
  projects: [{ id: "p1", name: "Ledger", url: "", description: "", technologies: ["PostgreSQL"], bullets: [] }],
  skills: [{ id: "s1", name: "Languages", items: ["TypeScript", "Python"] }],
};
const job: ParsedJob = {
  title: "Backend Engineer", company: "Globex", location: "London", workMode: "hybrid", seniority: "senior", visaSponsorship: "unknown", summary: "",
  keywords: ["Node.js", "Kubernetes", "Terraform", "PostgreSQL"], responsibilities: [],
  requirements: [
    { id: "r1", text: "Strong Node.js", importance: "must", category: "skill" },
    { id: "r2", text: "Kubernetes in production", importance: "must", category: "skill" },
    { id: "r3", text: "Terraform", importance: "nice", category: "skill" },
  ],
};
const q = (o: Partial<RawQuestion> = {}): RawQuestion => ({ question: "How would you design an idempotent payment API?", why: "w", difficulty: "hard", keyPoints: ["idempotency keys", "retries"], followUps: ["What if the DB is down?"], resumeRefs: [], requirementIds: ["r1"], ...o });

describe("buildQuestions", () => {
  it("assigns stable per-category ids and keeps valid questions", () => {
    const out = buildQuestions({ technical: [q(), q({ question: "Explain how you would tune a slow PostgreSQL query." })], behavioural: [q({ question: "Tell me about a time you mentored someone." })] }, resume, job);
    expect(out.map((x) => x.id)).toEqual(["t1", "t2", "b1"]);
    expect(out.map((x) => x.category)).toEqual(["technical", "technical", "behavioural"]);
  });

  it("drops questions with no guidance, too short, or duplicated (case/punctuation-insensitive)", () => {
    const out = buildQuestions({ technical: [q({ keyPoints: [] }), q({ question: "Why?" }), q(), q({ question: "how would you design an IDEMPOTENT payment API" })] }, resume, job);
    expect(out).toHaveLength(1);
  });

  it("only keeps resume references and requirement ids that really exist (nothing about the candidate is invented)", () => {
    const out = buildQuestions({ behavioural: [q({ resumeRefs: ["e1", "p1", "ghost", "b1"], requirementIds: ["r1", "r99"] })] }, resume, job);
    expect(out[0].resumeRefs).toEqual(["e1", "p1"]); // bullet ids and unknown ids are not valid references
    expect(out[0].requirementIds).toEqual(["r1"]);
  });

  it("caps each category", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => q({ question: `Distinct technical question number ${i} about systems` }));
    const out = buildQuestions({ technical: many(20), system_design: many(10).map((x) => ({ ...x, question: x.question + " design" })) }, resume, job);
    expect(out.filter((x) => x.category === "technical")).toHaveLength(LIMITS.technical);
    expect(out.filter((x) => x.category === "system_design")).toHaveLength(LIMITS.system_design);
  });
});

describe("clarifyEarly (from the candidate's own profile + what the posting says)", () => {
  const p = { ...emptyProfile(), needsVisaSponsorship: true, workModes: ["remote" as const], salaryMin: 70000, salaryCurrency: "GBP", salaryPeriod: "year" as const };
  it("flags sponsorship according to what the posting says", () => {
    expect(clarifyEarly({ ...job, visaSponsorship: "unknown" }, p)[0]).toMatch(/doesn't say/);
    expect(clarifyEarly({ ...job, visaSponsorship: "not_offered" }, p)[0]).toMatch(/does NOT offer/);
    expect(clarifyEarly({ ...job, visaSponsorship: "offered" }, p)[0]).toMatch(/offers visa sponsorship/);
    expect(clarifyEarly({ ...job, visaSponsorship: "unknown" }, { ...p, needsVisaSponsorship: false }).join(" ")).not.toMatch(/visa/i);
  });
  it("flags work-mode mismatch and unknown, includes salary and always the process question", () => {
    const out = clarifyEarly({ ...job, workMode: "onsite" }, p).join("\n");
    expect(out).toMatch(/onsite.*isn't in your preferred/);
    expect(out).toMatch(/70,000 GBP per year/);
    expect(out).toMatch(/interview stages/);
    expect(clarifyEarly({ ...job, workMode: "unknown" }, p).join("\n")).toMatch(/doesn't state remote, hybrid or on-site/);
  });
});

describe("uncoveredSkills", () => {
  it("lists job keywords the resume doesn't show, must-have ones first", () => {
    expect(uncoveredSkills(resume, job)).toEqual(["Kubernetes", "Terraform"]);
  });
});

describe("buildBrief", () => {
  it("marks its sources honestly and trims/dedupes", () => {
    const raw = { summary: "  A  role. ", whatTheyDo: ["x", "x", ""], techAndTools: ["Node.js"], cultureSignals: [], researchChecklist: ["Look up the product"], questionsToAsk: ["How is success measured?"] };
    expect(buildBrief(raw, job, emptyProfile(), false).sources).toEqual(["job_posting"]);
    const b = buildBrief(raw, job, emptyProfile(), true);
    expect(b.sources).toEqual(["job_posting", "company_page"]);
    expect(b.summary).toBe("A role.");
    expect(b.whatTheyDo).toEqual(["x"]);
  });
});

describe("finalizeFeedback", () => {
  const base = { verdict: "ok", strengths: ["a"], improvements: ["b"], suggestedOutline: ["step"], resumeTips: [] as string[] };
  it("keeps only this category's rubric keys, clamps, and computes the overall itself", () => {
    const f = finalizeFeedback({ ...base, scores: { situation: 4, action: 5, result: 3, reflection: 9, concise: 0, bogus: 5 } }, "behavioural", resume)!;
    expect(f.scores).toEqual({ situation: 4, action: 5, result: 3, reflection: 5, concise: 1 });
    expect(f.overall).toBe(3.6);
  });
  it("rejects feedback with too few usable dimensions", () => {
    expect(finalizeFeedback({ ...base, scores: { situation: 4 } }, "behavioural", resume)).toBeNull();
  });
  it("drops resume tips that mention numbers or terms the resume doesn't contain", () => {
    const f = finalizeFeedback({ ...base, scores: { situation: 3, action: 3, result: 3 }, resumeTips: ["Mention the Node.js payment APIs serving 40,000 daily users.", "Mention how you cut costs by 60%.", "Mention your Kubernetes migration."] }, "behavioural", resume)!;
    expect(f.resumeTips).toEqual(["Mention the Node.js payment APIs serving 40,000 daily users."]);
  });
});

describe("progressByQuestion", () => {
  it("counts attempts, best and last scores", () => {
    const m = progressByQuestion([
      { questionId: "t1", feedback: { overall: 2 } }, { questionId: "t1", feedback: { overall: 4 } }, { questionId: "t1", feedback: { overall: 3 } }, { questionId: "b1", feedback: null },
    ]);
    expect(m.get("t1")).toEqual({ attempts: 3, best: 4, last: 3 });
    expect(m.get("b1")).toEqual({ attempts: 1, best: null, last: null });
  });
});
