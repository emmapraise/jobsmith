import "server-only";
import { z } from "zod";
import type { ParsedJob } from "@/lib/jobs/schema";
import { generateStructured, untrusted, UNTRUSTED_NOTICE, type LlmConfig } from "@/lib/llm";
import type { ProfileData } from "@/lib/profile/schema";
import type { ResumeContent } from "@/lib/resume/schema";
import { buildBrief, buildQuestions, finalizeFeedback, uncoveredSkills, type RawQuestion } from "./build";
import { RUBRIC, type Category, type CompanyBrief, type Feedback, type PrepQuestion } from "./schema";

/* ───────────────────────────── question generation ───────────────────────────── */

const rawQ = z.object({
  question: z.string(),
  why: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  keyPoints: z.array(z.string()),
  followUps: z.array(z.string()),
  requirementIds: z.array(z.string()),
});
const rawQWithRefs = rawQ.extend({ resumeRefs: z.array(z.string()) });

const techSchema = z.object({ technical: z.array(rawQ), systemDesign: z.array(rawQ) });
const humanSchema = z.object({ behavioural: z.array(rawQWithRefs), gaps: z.array(rawQWithRefs) });
const briefSchemaLlm = z.object({
  summary: z.string(),
  whatTheyDo: z.array(z.string()),
  techAndTools: z.array(z.string()),
  cultureSignals: z.array(z.string()),
  researchChecklist: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
});

const COMMON = `You prepare ONE candidate for ONE job interview. Ground everything in the job and resume JSON you are given.
- Calibrate difficulty and scope to the job's seniority and the candidate's level.
- keyPoints are short bullets of what a strong answer covers. Use established, widely accepted knowledge; never invent facts about the employer.
- "why" is one sentence on what the interviewer is really probing. requirementIds are ids from the job's requirements that the question relates to ([] if none).
${UNTRUSTED_NOTICE}`;

const TECH_SYSTEM = `${COMMON}

Write:
- technical: exactly 8 questions on the skills, tools and responsibilities the JOB names (use its technologies, not random ones). Mix conceptual understanding, practical "how would you debug/optimise/decide" scenarios and short design-in-code discussions. No trivia and no brain-teasers. Give 1-3 followUps each.
- systemDesign: 3 prompts a real interviewer for this role and level would ask (a junior role gets simpler, smaller-scope prompts). keyPoints = the outline of considerations a good answer walks through (requirements, data model, APIs, scaling, failure modes, trade-offs). followUps probe scale or failure.`;

const HUMAN_SYSTEM = `${COMMON}

Write:
- behavioural: exactly 6 "tell me about a time…" questions on themes THIS posting emphasises (e.g. ownership, collaboration, mentoring, ambiguity, deadlines, failure, conflict). keyPoints = what a strong STAR answer covers for that theme plus a prompt to help the candidate recall a real story. resumeRefs = ids of the candidate's experience or project entries (from the resume JSON) where a real story for this theme most plausibly came from, or [] if unclear. NEVER state or imply facts about the candidate that are not in the resume.
- gaps: one question for each skill in "skillsNotOnResume" (at most 4), and ONLY about that specific skill or tool (not motivation, not general topics): the question an interviewer would ask given the gap, e.g. "Have you run services on Kubernetes? Walk me through it." keyPoints = how to answer HONESTLY: acknowledge the gap without apologising, point to genuinely transferable evidence from the resume (cite it by resumeRefs only if it exists), and describe a concrete plan to close it. Never suggest claiming experience the candidate doesn't have.`;

const BRIEF_SYSTEM = `You write a short brief to help a candidate prepare to talk to an employer. You have NO internet access and no knowledge you can trust about this specific company.
Use ONLY the text inside the <untrusted> tags (the job posting and, if provided, a page from the company). If something isn't stated there, leave it out; never add facts about the company's size, funding, customers, products, culture or news from memory.
- summary: 2-3 sentences on what the company/team does and what this role is for, using only the given text. If the text says little, say so plainly.
- whatTheyDo: up to 5 short points drawn from the text. techAndTools: technologies and tools the text names. cultureSignals: up to 5 values or ways of working the text actually states (paraphrase closely).
- researchChecklist: 6-8 concrete things the candidate should look up themselves before the interview (e.g. the product, recent announcements, the engineering blog, team size and funding stage, how they describe their stack). These are instructions, not facts.
- questionsToAsk: 6 thoughtful questions for the candidate to ask the interviewer, specific to this role and to what the text says (team, expectations in the first months, how success is measured, engineering practices, growth).
${UNTRUSTED_NOTICE}`;

export type PrepInput = {
  job: ParsedJob;
  /** Raw posting text (may be empty for manually tracked jobs that were never parsed). */
  jobText: string;
  /** Optional extra: text of a company "About" page the user pointed us at. */
  companyText?: string;
  resume: ResumeContent;
  profile: ProfileData;
  llm: LlmConfig;
};

/** The company brief on its own (so it can be refreshed with a company page without touching the questions). */
export async function generateBrief(i: Pick<PrepInput, "job" | "jobText" | "companyText" | "profile" | "llm">): Promise<CompanyBrief> {
  const raw = await generateStructured(briefSchemaLlm, {
    config: i.llm, system: BRIEF_SYSTEM, maxOutputTokens: 3000, temperature: 0.2,
    prompt: `${untrusted("job-posting", i.jobText || JSON.stringify(i.job))}${i.companyText ? `\n\n${untrusted("company-page", i.companyText.slice(0, 12_000))}` : ""}`,
  });
  return buildBrief(raw, i.job, i.profile, Boolean(i.companyText));
}

export async function generatePrep(i: PrepInput): Promise<{ questions: PrepQuestion[]; brief: CompanyBrief }> {
  const jobJson = JSON.stringify({ ...i.job, profileLevel: i.profile.seniority, yearsExperience: i.profile.yearsExperience });
  const resumeJson = JSON.stringify(i.resume);
  const skillsNotOnResume = uncoveredSkills(i.resume, i.job);

  const [tech, human, brief] = await Promise.all([
    generateStructured(techSchema, {
      config: i.llm, system: TECH_SYSTEM, maxOutputTokens: 7000, temperature: 0.4,
      prompt: `${untrusted("job-json", jobJson)}\n\n${untrusted("resume-json", resumeJson)}`,
    }),
    generateStructured(humanSchema, {
      config: i.llm, system: HUMAN_SYSTEM, maxOutputTokens: 6000, temperature: 0.4,
      prompt: `${untrusted("job-json", jobJson)}\n\n${untrusted("resume-json", resumeJson)}\n\n${untrusted("skillsNotOnResume", JSON.stringify(skillsNotOnResume))}`,
    }),
    generateBrief(i),
  ]);

  const raw: Partial<Record<Category, RawQuestion[]>> = { technical: tech.technical, system_design: tech.systemDesign, behavioural: human.behavioural, gap: human.gaps };
  return {
    questions: buildQuestions(raw, i.resume, i.job),
    brief,
  };
}

/* ───────────────────────────── answer feedback ───────────────────────────── */

const feedbackLlm = z.object({
  scores: z.array(z.object({ dimension: z.string(), score: z.number() })),
  verdict: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  suggestedOutline: z.array(z.string()),
  resumeTips: z.array(z.string()),
});

const FEEDBACK_SYSTEM = `You are a strict but kind interview coach. Evaluate the candidate's answer to the interview question.

Rules:
- Score every dimension in "rubric" from 1 to 5 (1 poor, 3 adequate, 5 excellent). Be honest: most real answers deserve 2-4. Use the dimension keys exactly as given.
- Base everything on what the candidate ACTUALLY wrote. Quote or point to their words. Never invent details about their experience, numbers or outcomes.
- For technical questions, check correctness against established knowledge and say plainly when something is wrong.
- strengths: up to 3. improvements: up to 4, specific and actionable (what to add, cut or reorder).
- suggestedOutline: 4-6 steps giving a STRUCTURE for a stronger answer. Where the candidate must supply a fact, use a placeholder such as "[a number you can stand behind]". Do not write their story for them.
- resumeTips: up to 3 real items from the resume JSON (employers, projects, outcomes) the candidate could weave in. Use only facts present in the resume; [] if none fit.
- If the answer is empty, a refusal, or off-topic, say so and score 1.
- verdict: one sentence.
${UNTRUSTED_NOTICE}`;

export async function evaluateAnswer(args: { question: PrepQuestion; answer: string; resume: ResumeContent; llm: LlmConfig }): Promise<Feedback | null> {
  const { question, answer, resume, llm } = args;
  const rubric = RUBRIC[question.category];
  const out = await generateStructured(feedbackLlm, {
    config: llm,
    system: FEEDBACK_SYSTEM,
    maxOutputTokens: 2500,
    temperature: 0.2,
    prompt: [
      untrusted("rubric", JSON.stringify(rubric)),
      untrusted("question", JSON.stringify({ category: question.category, question: question.question, strongAnswerCovers: question.keyPoints })),
      untrusted("candidate-answer", answer),
      untrusted("resume-json", JSON.stringify(resume)),
    ].join("\n\n"),
  });
  return finalizeFeedback(
    { scores: Object.fromEntries(out.scores.map((s) => [s.dimension, s.score])), verdict: out.verdict, strengths: out.strengths, improvements: out.improvements, suggestedOutline: out.suggestedOutline, resumeTips: out.resumeTips },
    question.category,
    resume,
  );
}
