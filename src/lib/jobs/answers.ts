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
- Some questions come with the candidate's OWN NOTES or draft answer. Then reword and polish THEIR text for this question and job: keep their facts and voice, fix structure, tighten, and bring in relevant real evidence from the resume only where it strengthens their point. Don't drop what they said. Don't add activities, results or details they didn't state; evidence from the resume may be added only if it is clearly about the same work.
- Return exactly one answer per question, in the same order.
${UNTRUSTED_NOTICE}`;

const outSchema = z.object({ answers: z.array(z.string()) });

export type Answer = { question: string; answer: string };

/** Drafts answers (or rewords the candidate's own notes), then checks each against the resume: an answer that adds a number, tool or name the candidate hasn't shown is withheld. */
export async function draftAnswers(items: { question: string; notes: string }[], resume: ResumeContent, profile: ProfileData, job: ParsedJob, config: LlmConfig): Promise<Answer[]> {
  const out = await generateStructured(outSchema, {
    config,
    system: SYSTEM,
    prompt: `Questions:\n${items.map((x, i) => `${i + 1}. ${x.question}${x.notes ? `\n   CANDIDATE'S NOTES: ${x.notes}` : ""}`).join("\n")}\n\nJob: ${job.title} at ${job.company} (${job.location})\n\n${untrusted("job-summary", `${job.summary}\n${job.responsibilities.join("\n")}`)}\n\nResume JSON:\n${JSON.stringify(resume)}\n\nProfile JSON:\n${JSON.stringify(profile)}`,
    maxOutputTokens: 3000,
    temperature: 0.4,
  });
  // The company, role and the candidate's own profile are legitimate sources for names and numbers.
  const corpus = [resumeCorpus(resume), ...items.map((x) => x.notes), job.title, job.company, job.location, JSON.stringify(profile)].join("\n");
  const draft = async (i: number): Promise<Answer> => {
    const { question } = items[i];
    let a = (out.answers[i] ?? "").trim();
    for (let attempt = 0; attempt < 2 && a; attempt++) {
      const check = factCheck(a, corpus, []);
      if (check.ok) return { question, answer: a };
      if (attempt === 1) break;
      // One repair pass: the draft used details that aren't in the resume, profile or notes.
      const fix = await generateStructured(z.object({ answer: z.string() }), {
        config, system: SYSTEM, temperature: 0.2, maxOutputTokens: 800,
        prompt: `Rewrite this answer to "${question}" without these details, which the candidate has not shown: ${check.violations.join(", ")}. Keep it first person and honest; use a [placeholder] if something is missing.\n\nAnswer:\n${a}\n\nResume JSON:\n${JSON.stringify(resume)}`,
      });
      a = fix.answer.trim();
    }
    return { question, answer: "" }; // withheld: the user writes it themselves
  };
  return Promise.all(items.map((_, i) => draft(i)));
}
