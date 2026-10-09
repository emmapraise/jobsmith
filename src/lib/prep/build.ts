import type { ParsedJob } from "@/lib/jobs/schema";
import type { ProfileData } from "@/lib/profile/schema";
import type { ResumeContent } from "@/lib/resume/schema";
import { factCheck, keywordsPresent, resumeCorpus } from "@/lib/tailor/factcheck";
import { RUBRIC, type Category, type CompanyBrief, type Feedback, type PrepQuestion } from "./schema";

/** Pure post-processing of model output: validation, limits and ids. */

export type RawQuestion = {
  question: string;
  why: string;
  difficulty: "easy" | "medium" | "hard";
  keyPoints: string[];
  followUps: string[];
  resumeRefs?: string[];
  requirementIds?: string[];
};

export const LIMITS: Record<Category, number> = { technical: 8, behavioural: 6, system_design: 3, gap: 4 };
const PREFIX: Record<Category, string> = { technical: "t", behavioural: "b", system_design: "s", gap: "g" };

const clean = (s: string, max = 400) => s.replace(/\s+/g, " ").trim().slice(0, max);
const cleanList = (a: string[], n: number, max = 300) => [...new Set(a.map((x) => clean(x, max)).filter(Boolean))].slice(0, n);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Ids a question may legitimately point at in the candidate's resume. */
export const resumeRefIds = (r: ResumeContent) => new Set([...r.experience.map((e) => e.id), ...r.projects.map((p) => p.id)]);

export function buildQuestions(
  raw: Partial<Record<Category, RawQuestion[]>>,
  resume: ResumeContent,
  job: Pick<ParsedJob, "requirements">,
): PrepQuestion[] {
  const refs = resumeRefIds(resume);
  const reqs = new Set(job.requirements.map((r) => r.id));
  const seen = new Set<string>();
  const out: PrepQuestion[] = [];

  for (const category of Object.keys(LIMITS) as Category[]) {
    let n = 0;
    for (const q of raw[category] ?? []) {
      if (n >= LIMITS[category]) break;
      const question = clean(q.question, 500);
      const key = norm(question);
      const keyPoints = cleanList(q.keyPoints, 7);
      if (!question || question.length < 12 || seen.has(key) || keyPoints.length === 0) continue; // unusable: no guidance means nothing to learn from
      seen.add(key);
      n++;
      out.push({
        id: `${PREFIX[category]}${n}`,
        category,
        question,
        why: clean(q.why, 300),
        difficulty: q.difficulty,
        keyPoints,
        followUps: cleanList(q.followUps, 3),
        // Only ids that exist in the resume: the UI shows these as "draw on this experience", so they must be real.
        resumeRefs: [...new Set((q.resumeRefs ?? []).filter((id) => refs.has(id)))].slice(0, 3),
        requirementIds: [...new Set((q.requirementIds ?? []).filter((id) => reqs.has(id)))].slice(0, 4),
      });
    }
  }
  return out;
}

type RawBrief = { summary: string; whatTheyDo: string[]; techAndTools: string[]; cultureSignals: string[]; researchChecklist: string[]; questionsToAsk: string[] };

export function buildBrief(raw: RawBrief, job: ParsedJob, profile: ProfileData, hadCompanyPage: boolean): CompanyBrief {
  return {
    summary: clean(raw.summary, 700),
    whatTheyDo: cleanList(raw.whatTheyDo, 6),
    techAndTools: cleanList(raw.techAndTools, 14, 60),
    cultureSignals: cleanList(raw.cultureSignals, 6),
    clarifyEarly: clarifyEarly(job, profile),
    researchChecklist: cleanList(raw.researchChecklist, 8),
    questionsToAsk: cleanList(raw.questionsToAsk, 8),
    sources: hadCompanyPage ? ["job_posting", "company_page"] : ["job_posting"],
  };
}

/** Practical things to settle early, derived from the candidate's own profile and what the posting actually says. */
export function clarifyEarly(job: Pick<ParsedJob, "visaSponsorship" | "workMode" | "location">, p: ProfileData): string[] {
  const out: string[] = [];
  if (p.needsVisaSponsorship) {
    out.push(
      job.visaSponsorship === "offered"
        ? "The posting offers visa sponsorship. Confirm it covers your route and your country."
        : job.visaSponsorship === "not_offered"
          ? "The posting says it does NOT offer visa sponsorship. Ask whether that is firm for this role before investing more time."
          : "You need visa sponsorship and the posting doesn't say. Ask early whether they sponsor for this role.",
    );
  }
  if (job.workMode === "unknown") out.push("The posting doesn't state remote, hybrid or on-site. Confirm the working pattern and where you'd be based.");
  else if (p.workModes.length && !p.workModes.includes(job.workMode)) out.push(`This role is ${job.workMode}, which isn't in your preferred work modes (${p.workModes.join(", ")}). Check how flexible it is.`);
  if (p.salaryMin) out.push(`Ask for the salary band early. Your minimum is ${p.salaryMin.toLocaleString("en-GB")} ${p.salaryCurrency ?? ""} per ${p.salaryPeriod ?? "year"}.`.replace(/\s+/g, " "));
  out.push("Ask about the interview stages, who you'll meet, and the expected timeline.");
  return out;
}

/** Skills the job names that the resume doesn't show, most important first (those in must-have requirements). */
export function uncoveredSkills(resume: ResumeContent, job: ParsedJob, max = 5): string[] {
  const missing = keywordsPresent(resume, job.keywords).missing;
  const mustText = job.requirements.filter((r) => r.importance === "must").map((r) => r.text.toLowerCase()).join(" \n ");
  const inMust = (k: string) => mustText.includes(k.toLowerCase());
  return [...missing.filter(inMust), ...missing.filter((k) => !inMust(k))].slice(0, max);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Normalise model feedback: keep only this category's rubric dimensions (clamped 1-5), compute the overall score
 * ourselves, and drop any "resume tip" that mentions a number or term that isn't actually in the resume.
 */
export function finalizeFeedback(raw: Omit<Feedback, "overall">, category: Category, resume: ResumeContent): Feedback | null {
  const scores: Record<string, number> = {};
  for (const { key } of RUBRIC[category]) {
    const v = raw.scores[key];
    if (typeof v === "number" && Number.isFinite(v)) scores[key] = Math.min(5, Math.max(1, Math.round(v * 2) / 2));
  }
  if (Object.keys(scores).length < Math.ceil(RUBRIC[category].length / 2)) return null; // not enough to trust
  const corpus = resumeCorpus(resume);
  return {
    scores,
    overall: Math.round(mean(Object.values(scores)) * 10) / 10,
    verdict: clean(raw.verdict, 300),
    strengths: cleanList(raw.strengths, 3, 300),
    improvements: cleanList(raw.improvements, 4, 350),
    suggestedOutline: cleanList(raw.suggestedOutline, 7, 250),
    resumeTips: cleanList(raw.resumeTips, 3, 300).filter((t) => factCheck(t, corpus, []).ok),
  };
}

export type QuestionProgress = { attempts: number; best: number | null; last: number | null };

export function progressByQuestion(attempts: { questionId: string; feedback: { overall: number } | null }[]): Map<string, QuestionProgress> {
  const m = new Map<string, QuestionProgress>();
  for (const a of attempts) {
    const cur = m.get(a.questionId) ?? { attempts: 0, best: null, last: null };
    cur.attempts++;
    if (a.feedback) {
      cur.last = a.feedback.overall;
      cur.best = Math.max(cur.best ?? 0, a.feedback.overall);
    }
    m.set(a.questionId, cur);
  }
  return m;
}
