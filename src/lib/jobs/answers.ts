import "server-only";
import { z } from "zod";
import { generateStructured, untrusted, UNTRUSTED_NOTICE, type LlmConfig } from "@/lib/llm";
import type { ProfileData } from "@/lib/profile/schema";
import type { ResumeContent } from "@/lib/resume/schema";
import { factCheck, resumeCorpus } from "@/lib/tailor/factcheck";
import type { ParsedJob } from "./schema";

const SYSTEM = `You draft answers to a job application's questions for ONE candidate, in the first person, as they would write them.
- Use ONLY facts in the resume JSON and profile JSON. Never invent employers, projects, numbers, tools, dates, visa status, salary or notice period.
- If a question needs a fact you don't have (notice period, exact salary, references, a story the resume doesn't support), write a short answer that uses what you do have and put a [bracketed placeholder] where the candidate must fill the rest in.
- Motivation questions ("why this company/role"): connect the candidate's real experience to what the JOB POSTING says. Say nothing about the company that the posting doesn't state.
- Work authorisation / sponsorship / salary: answer only from the profile, plainly and honestly.
- Plain, specific, human. 60-150 words unless the question asks for more. No clichés ("passionate", "team player"), no headings, no markdown.
- Return exactly one answer per question, in the same order.
${UNTRUSTED_NOTICE}`;

const outSchema = z.object({ answers: z.array(z.string()) });

export type Answer = { question: string; answer: string };

/** Drafts answers, then checks each against the resume: an answer that adds a number, tool or name the candidate hasn't shown is withheld. */
export async function draftAnswers(questions: string[], resume: ResumeContent, profile: ProfileData, job: ParsedJob, config: LlmConfig): Promise<Answer[]> {
  const out = await generateStructured(outSchema, {
    config,
    system: SYSTEM,
    prompt: `Questions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nJob: ${job.title} at ${job.company} (${job.location})\n\n${untrusted("job-summary", `${job.summary}\n${job.responsibilities.join("\n")}`)}\n\nResume JSON:\n${JSON.stringify(resume)}\n\nProfile JSON:\n${JSON.stringify(profile)}`,
    maxOutputTokens: 3000,
    temperature: 0.4,
  });
  // The company, role and the candidate's own profile are legitimate sources for names and numbers.
  const corpus = [resumeCorpus(resume), job.title, job.company, job.location, JSON.stringify(profile)].join("\n");
  return questions.map((question, i) => {
    const a = (out.answers[i] ?? "").trim();
    if (!a || !factCheck(a, corpus, []).ok) return { question, answer: "" }; // shortcut: withheld, not repaired; add a repair pass if this fires often
    return { question, answer: a };
  });
}
