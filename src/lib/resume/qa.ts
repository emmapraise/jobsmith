import "server-only";
import { z } from "zod";
import { generateStructured, untrusted, UNTRUSTED_NOTICE } from "@/lib/llm";
import type { QAAnswer, QAProposedChange, QAQuestion } from "@/lib/db/schema";
import { applyChange, changeSchema, ChangeError } from "./apply-change";
import type { ResumeContent } from "./schema";

const MAX_QUESTIONS = 8;

const questionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      why: z.string(),
      kind: z.enum(["text", "yes_no", "choice"]),
      choices: z.array(z.string()),
      targetId: z.string().nullable(),
    }),
  ),
});

const QUESTION_SYSTEM = `You are a careful career coach helping a software/AI/tech professional bring their master resume up to date.
Ask SHORT questions, answerable in one or two sentences, that would make the resume more accurate and stronger.

Prioritise (most valuable first):
1. Currency: is the most recent role still current? Has anything happened since the latest dated entry (new job, promotion, new project, new certification, new tools)?
2. Gaps: unexplained gaps between roles; roles with no dates or bullets.
3. Impact: key bullets that describe duties without outcomes. Ask for a real number or outcome ONLY if the user would know it (users, latency, revenue, cost, team size). Never ask them to estimate or make up figures.
4. Ambiguity: unclear tech stack, scope or seniority in a role.

Rules:
- At most ${MAX_QUESTIONS} questions. Fewer is better if the resume is already strong. Never repeat a question.
- Each question must be self-contained and name the role/project it is about.
- "why" is one short sentence telling the user why you are asking.
- kind: "yes_no" for confirmations, "choice" only when there are 2-4 clear options (put them in choices), otherwise "text". choices must be [] unless kind is "choice".
- targetId: the id of the experience or project the question is about, else null. Use ids exactly as given.
- Never ask for sensitive personal data (age, date of birth, marital status, religion, ID numbers, photo).
${UNTRUSTED_NOTICE}`;

export async function generateQuestions(resume: ResumeContent, today = new Date()): Promise<QAQuestion[]> {
  const out = await generateStructured(questionsSchema, {
    system: QUESTION_SYSTEM,
    prompt: `Today is ${today.toISOString().slice(0, 10)}.\n\n${untrusted("resume-json", JSON.stringify(resume))}`,
    maxOutputTokens: 3000,
    temperature: 0.3,
  });
  return out.questions
    .filter((q) => q.question.trim())
    .slice(0, MAX_QUESTIONS)
    .map((q) => ({
      id: crypto.randomUUID(),
      question: q.question.trim(),
      why: q.why.trim(),
      kind: q.kind,
      choices: q.kind === "choice" && q.choices.length >= 2 ? q.choices.slice(0, 4) : undefined,
      targetId: q.targetId,
    }));
}

const changesSchema = z.object({ changes: z.array(changeSchema) });

const CHANGE_SYSTEM = `You update a structured resume using ONLY facts the user stated in their answers.

Truthfulness rules (non-negotiable):
- Every change must be directly supported by an answer. Quote or paraphrase the user's own facts; never add numbers, tools, dates, titles, employers or claims they did not state.
- If an answer is vague, skip it (propose nothing) rather than guessing.
- Skipped or empty answers produce no changes.
- Keep new bullet text concise, past tense (or present for current roles), starting with a strong verb, in the user's own facts.
- Do not rewrite existing content unless an answer corrects it.

Operations: add_bullet, replace_bullet, add_skills, set_summary, set_headline, set_role_end (text = YYYY-MM), mark_role_current, add_experience (fill 'role'; 'text' may hold one first bullet), add_certification (fill 'cert').
For fields an operation doesn't use, return null (or [] for items).
targetId must be an id that exists in the resume JSON, exactly as given.
'description' is a short label (e.g. "Add bullet to Senior Engineer at Acme"). 'reason' is one short sentence naming the answer it came from.
Propose the smallest set of changes that captures the new information.
${UNTRUSTED_NOTICE}`;

export async function proposeChanges(
  resume: ResumeContent,
  questions: QAQuestion[],
  answers: QAAnswer[],
): Promise<QAProposedChange[]> {
  const answered = answers.filter((a) => !a.skipped && a.answer.trim());
  if (answered.length === 0) return [];

  const qa = answered.map((a) => ({
    question: questions.find((q) => q.id === a.questionId)?.question ?? "",
    targetId: questions.find((q) => q.id === a.questionId)?.targetId ?? null,
    answer: a.answer.trim(),
  }));

  const out = await generateStructured(changesSchema, {
    system: CHANGE_SYSTEM,
    prompt: `${untrusted("resume-json", JSON.stringify(resume))}\n\n${untrusted("user-answers", JSON.stringify(qa))}`,
    maxOutputTokens: 4000,
    temperature: 0.1,
  });

  // Dry-run each change in sequence; drop any that can't be applied cleanly so the user never sees a broken one.
  const kept: QAProposedChange[] = [];
  let working = resume;
  for (const c of out.changes) {
    try {
      working = applyChange(working, c);
      kept.push({ id: crypto.randomUUID(), description: c.description, reason: c.reason, patch: c, decision: "pending" });
    } catch (err) {
      if (!(err instanceof ChangeError)) throw err;
    }
  }
  return kept;
}
