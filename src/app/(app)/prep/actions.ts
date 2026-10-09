"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { actionError, fail, limitOrFail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth/session";
import { db, tables } from "@/lib/db";
import { ingestPastedText, ingestUrl, IngestError } from "@/lib/jobs/ingest";
import { NotAJobError, parseJob } from "@/lib/jobs/parse";
import { resolveLlm } from "@/lib/llm/user-config";
import { getProfile } from "@/lib/profile/repo";
import { evaluateAnswer, generateBrief, generatePrep } from "@/lib/prep/engine";
import { getJobForPrep, resolvePrepResume } from "@/lib/prep/context";
import { addAttempt, clearAttempts, deletePrep, getPrep, upsertPrep } from "@/lib/prep/repo";
import { MAX_ANSWER_CHARS, type Attempt, type Feedback, type PrepData } from "@/lib/prep/schema";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

/** Reads the optional company page (a link, fetched safely, or pasted text). */
async function readCompanyPage(i: { companyUrl?: string; companyText?: string }): Promise<{ ok: true; text?: string; url: string | null } | { ok: false; fail: ReturnType<typeof fail> }> {
  try {
    if (i.companyText?.trim()) {
      const text = i.companyText.replace(/\s+/g, " ").trim();
      if (text.length < 80) return { ok: false, fail: fail("That's too short to use. Paste a paragraph or more from the company's About page.", "company_page") };
      return { ok: true, text: text.slice(0, 20_000), url: null };
    }
    if (i.companyUrl?.trim()) {
      const c = await ingestUrl(i.companyUrl.trim());
      return { ok: true, text: c.text, url: c.url };
    }
    return { ok: true, url: null };
  } catch (e) {
    if (e instanceof IngestError) return { ok: false, fail: fail(`We couldn't read that company page: ${e.message}`, "company_page") };
    throw e;
  }
}

const createSchema = z.object({
  jobId: uuid,
  /** Needed only when the job has never been analysed (a manually tracked job). */
  description: z.string().max(60_000).optional(),
  /** Optional: a company "About" page to enrich the brief. Fetched with the same safety rules as job links. */
  companyUrl: z.string().max(2000).optional(),
  companyText: z.string().max(40_000).optional(),
});

/** Builds (or rebuilds) the prep for a job: questions, practice material and a company brief. Takes ~20-40s. */
export async function createPrepAction(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const p = createSchema.safeParse(input);
    if (!p.success) return fail("Something is missing from that request.", "invalid");
    const job = await getJobForPrep(user.id, p.data.jobId);
    if (!job) return fail("Job not found.");
    const resume = await resolvePrepResume(user.id, job.id);
    if (!resume) return fail("Upload your master resume first.", "no_resume");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;
    const llm = await resolveLlm(user.id);

    // 1. The job: use what we already analysed; otherwise read it from pasted text, then the saved link.
    let parsed = job.parsed;
    let jobText = job.description;
    if (!parsed) {
      try {
        const ingested = p.data.description?.trim() ? ingestPastedText(p.data.description) : job.description.length >= 200 ? { text: job.description, hints: {}, url: job.url } : job.url ? await ingestUrl(job.url) : null;
        if (!ingested) return fail("Paste the job description so we can prepare questions for this role.", "need_description");
        jobText = ingested.text;
        parsed = await parseJob(ingested.text, llm, ingested.hints);
      } catch (e) {
        if (e instanceof IngestError) return fail(e.message, "need_description");
        if (e instanceof NotAJobError) return fail(e.message, "need_description");
        throw e;
      }
      await db().update(tables.jobs).set({ parsed, description: jobText.slice(0, 60_000), title: job.title || parsed.title, company: job.company || parsed.company }).where(eq(tables.jobs.id, job.id));
    }

    // 2. Optional company page.
    const company = await readCompanyPage(p.data);
    if (!company.ok) return company.fail;
    const companyText = company.text;
    const companyUrl = company.url;

    const { data: profile } = await getProfile(user.id);
    const { questions, brief } = await generatePrep({ job: parsed, jobText, companyText, resume: resume.content, profile, llm });
    if (questions.length < 5) return fail("The AI returned too few usable questions. Please try again.", "ai_failed");

    const data: PrepData = { version: 1, questions, brief, attempts: [], generatedAt: new Date().toISOString(), basis: { resume: resume.label, companyUrl } };
    const id = await upsertPrep(user.id, job.id, resume.applicationId, data);
    revalidatePath("/prep");
    return { ok: true, id };
  } catch (err) {
    return actionError(err);
  }
}

const practiceSchema = z.object({ prepId: uuid, questionId: z.string().min(1).max(20), answer: z.string().max(MAX_ANSWER_CHARS + 500), seconds: z.number().int().min(0).max(7200).nullable() });

export async function submitAnswerAction(input: z.input<typeof practiceSchema>): Promise<ActionResult<{ attempt: Attempt }>> {
  try {
    const user = await requireUser();
    const p = practiceSchema.safeParse(input);
    if (!p.success) return fail("That answer couldn't be read.", "invalid");
    const answer = p.data.answer.trim().slice(0, MAX_ANSWER_CHARS);
    if (answer.length < 15) return fail("Write a little more first: at least a couple of sentences.", "too_short");

    const prep = await getPrep(user.id, p.data.prepId);
    const question = prep?.data.questions.find((q) => q.id === p.data.questionId);
    if (!prep || !question) return fail("That question no longer exists.");
    const resume = await resolvePrepResume(user.id, prep.jobId);
    if (!resume) return fail("Upload your master resume first.", "no_resume");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;

    const feedback: Feedback | null = await evaluateAnswer({ question, answer, resume: resume.content, llm: await resolveLlm(user.id) });
    if (!feedback) return fail("We couldn't score that answer reliably. Please try submitting it again.", "ai_failed");

    const attempt: Attempt = { id: crypto.randomUUID(), questionId: question.id, answer, at: new Date().toISOString(), seconds: p.data.seconds, feedback };
    if (!(await addAttempt(user.id, prep.id, attempt))) return fail("Couldn't save your attempt.");
    return { ok: true, attempt };
  } catch (err) {
    return actionError(err);
  }
}

export async function resetPracticeAction(prepId: string, questionId?: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!uuid.safeParse(prepId).success) return fail("Not found.");
    if (!(await clearAttempts(user.id, prepId, questionId))) return fail("Not found.");
    revalidatePath(`/prep/${prepId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function deletePrepAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!uuid.safeParse(id).success) return fail("Not found.");
    await deletePrep(user.id, id);
    revalidatePath("/prep");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

const briefSchema = z.object({ prepId: uuid, companyUrl: z.string().max(2000).optional(), companyText: z.string().max(40_000).optional() });

/** Refresh ONLY the company brief with a company page. Questions and practice history are untouched. */
export async function updateBriefAction(input: z.input<typeof briefSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const p = briefSchema.safeParse(input);
    if (!p.success) return fail("Something is missing from that request.", "invalid");
    const prep = await getPrep(user.id, p.data.prepId);
    if (!prep) return fail("Not found.");
    const job = await getJobForPrep(user.id, prep.jobId);
    if (!job?.parsed) return fail("This job hasn't been analysed yet.", "need_description");
    const company = await readCompanyPage(p.data);
    if (!company.ok) return company.fail;
    if (!company.text) return fail("Add a link to the company's About page, or paste some text from it.", "company_page");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;
    const { data: profile } = await getProfile(user.id);
    const brief = await generateBrief({ job: job.parsed, jobText: job.description, companyText: company.text, profile, llm: await resolveLlm(user.id) });
    await upsertPrep(user.id, prep.jobId, prep.applicationId, { ...prep.data, brief, basis: { ...prep.data.basis, companyUrl: company.url } });
    revalidatePath(`/prep/${prep.id}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
