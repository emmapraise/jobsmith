import "server-only";
import { z } from "zod";
import type { ParsedJob } from "@/lib/jobs/schema";
import { generateStructured, untrusted, UNTRUSTED_NOTICE, type LlmConfig } from "@/lib/llm";
import { log } from "@/lib/log";
import type { ResumeContent } from "@/lib/resume/schema";
import { keywordsPresent } from "./factcheck";
import { changeTargets } from "./changes";
import { llmOpSchema, materializeChanges, type Dropped } from "./materialize";
import { verifyChanges } from "./verify";
import { buildGaps, matchScore, sanitiseCoverage } from "./score";
import { coverageSchema, type Analysis, type Gap, type TailorChange } from "./types";

const outputSchema = z.object({
  changes: z.array(llmOpSchema),
  coverage: z.array(coverageSchema),
  gapQuestions: z.array(z.object({ requirementId: z.string(), question: z.string() })),
});

const SYSTEM = `You tailor ONE candidate's resume to ONE job posting. You never write a new resume; you propose small edits to the existing one.

TRUTHFULNESS (non-negotiable)
- Use only facts already in the resume JSON. Never add a number, tool, technology, employer, title, date, qualification, team size or outcome that is not already there.
- Do not copy a keyword from the job into the resume unless the resume already evidences it. If the job wants something the resume doesn't show, that is a GAP: do NOT write it into any edit; instead set its coverage to "gap" and give a question.
- Rewrites must keep the same meaning and every number unchanged. You are only choosing better words and emphasis, using the job's vocabulary for things the candidate genuinely did (e.g. "built REST APIs" may become "developed RESTful APIs" if that matches the job and the original says APIs).

WHAT YOU MAY PROPOSE (op values)
- rewrite_bullet: targetId = bullet id, text = the rewritten bullet. Only for bullets relevant to the job. Keep it concise.
- reorder_bullets: targetId = experience/project id, orderedIds = ALL bullet ids of that role, most relevant to the job first.
- reorder_skills: targetId = skill group id, items = ALL existing items of that group, most relevant first.
- add_skills: targetId = skill group id, items = skills that appear elsewhere in the resume (bullets/projects) but are missing from the skills list.
- set_summary: text = a 2-3 sentence summary built only from resume facts, aimed at this role. Skip if the resume has no basis.
- set_headline: text = a short professional title the candidate's real titles support. Skip if unclear.
Fields an op doesn't use: null for text/targetId, [] for lists. Propose at most 12 changes, highest impact first. Each has a one-sentence "reason" that names what in the job it addresses (plain language), and requirementIds it supports (ids like "r3").
Do not propose deleting anything.

COVERAGE
For EVERY requirement id, return status: "matched" (clear evidence in the resume; put a short pointer to it in evidence), "partial" (related but not the same), or "gap" (no evidence; evidence ""). Be honest and strict; do not inflate.

GAP QUESTIONS
For each requirement with status "partial" or "gap", give one short, friendly question asking whether the candidate has that experience (requirementId + question).
${UNTRUSTED_NOTICE}`;

const retrySchema = z.object({ changes: z.array(llmOpSchema) });

const RETRY_NOTE = `

SECOND ATTEMPT
Some of your earlier edits were REJECTED by the truthfulness checks (listed below with the reason). Propose faithful REPLACEMENTS for those targets that avoid the rejected words and claims: reuse only the words already in the original text and the resume, choose different phrasing, or leave the bullet alone. If no faithful rewording exists, propose nothing for it. Return only the new edits.`;

export type TailoringResult = {
  changes: TailorChange[];
  gaps: Gap[];
  analysis: Analysis;
  score: number | null;
  dropped: Dropped[];
};

export async function generateTailoring(master: ResumeContent, job: ParsedJob, config: LlmConfig): Promise<TailoringResult> {
  const out = await generateStructured(outputSchema, {
    config,
    system: SYSTEM,
    prompt: `${untrusted("resume-json", JSON.stringify(master))}\n\n${untrusted("job-json", JSON.stringify(job))}`,
    maxOutputTokens: 7000,
    temperature: 0.2,
    timeoutMs: 120_000,
  });

  const first = materializeChanges(master, job, out.changes);
  // Independent second pass over every reworded text (fails closed).
  const verified = await verifyChanges(master, first.changes, config);
  let changes = verified.kept;
  let dropped = [...first.dropped, ...verified.dropped];

  // One bounded repair pass: tell the model what was rejected and why, then run the SAME checks on the replacements.
  const rejectedText = dropped.filter((d) => d.text && d.target !== undefined && /unsupported|unverified/.test(d.why));
  if (changes.filter((c) => c.kind === "bullet_text" || c.kind === "summary" || c.kind === "headline").length < 3 && rejectedText.length > 0) {
    const feedback = rejectedText.slice(0, 8).map((d) => ({ op: d.op, targetId: d.target ?? null, rejectedText: d.text, reason: d.why }));
    const retry = await generateStructured(retrySchema, {
      config,
      system: SYSTEM + RETRY_NOTE,
      prompt: `${untrusted("resume-json", JSON.stringify(master))}\n\n${untrusted("job-json", JSON.stringify(job))}\n\n${untrusted("rejected-edits", JSON.stringify(feedback))}`,
      maxOutputTokens: 3000,
      temperature: 0.3,
      timeoutMs: 90_000,
    });
    const touched = new Set(changes.flatMap(changeTargets));
    const second = materializeChanges(master, job, retry.changes, { touched });
    const second2 = await verifyChanges(master, second.changes, config);
    changes = [...changes, ...second2.kept];
    dropped = [...dropped, ...second.dropped.map((d) => ({ ...d, why: `retry: ${d.why}` })), ...second2.dropped.map((d) => ({ ...d, why: `retry: ${d.why}` }))];
  }
  if (dropped.length) log.info("tailor.dropped", { count: dropped.length, proposed: out.changes.length, kept: changes.length });

  const coverage = sanitiseCoverage(job.requirements, out.coverage);
  const questions = new Map(out.gapQuestions.map((g) => [g.requirementId, g.question]));
  const gaps = buildGaps(job.requirements, coverage, questions);
  const kw = keywordsPresent(master, job.keywords);

  return {
    changes,
    gaps,
    analysis: { coverage, keywords: { total: job.keywords.length, master: kw.present, missing: kw.missing } },
    score: matchScore(job.requirements, coverage),
    dropped,
  };
}
