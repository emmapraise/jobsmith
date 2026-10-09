"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, fail, limitOrFail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth/session";
import { resolveLlm } from "@/lib/llm/user-config";
import { generateQuestions, proposeChanges } from "@/lib/resume/qa";
import {
  abandonQa,
  completeQa,
  createQa,
  decideChange,
  getOpenQa,
  moveToReview,
  saveAnswer,
} from "@/lib/resume/qa-repo";
import { addVersion, getLatestOriginal, getMasterResume, getVersionContent, markReviewed, sameContent } from "@/lib/resume/repo";
import { resumeContentSchema } from "@/lib/resume/schema";
import { storage } from "@/lib/storage";

/* ───────────── Review & correct ───────────── */

export async function saveResumeAction(input: unknown, confirm: boolean): Promise<ActionResult<{ version: number }>> {
  try {
    const user = await requireUser();
    const parsed = resumeContentSchema.safeParse(input);
    if (!parsed.success) return fail("Some fields are invalid. Check the highlighted sections.", "invalid");

    const master = await getMasterResume(user.id);
    if (!master) return fail("Upload a resume first.", "no_resume");

    let version = master.version;
    if (!sameContent(master.content, parsed.data)) {
      const r = await addVersion({ userId: user.id, resumeId: master.id, content: parsed.data, source: "manual_edit", note: "Edited by you" });
      version = r.version;
    }
    if (confirm) await markReviewed(user.id);
    revalidatePath("/", "layout");
    return { ok: true, version };
  } catch (err) {
    return actionError(err);
  }
}

export async function restoreVersionAction(version: number): Promise<ActionResult<{ version: number }>> {
  try {
    const user = await requireUser();
    const old = await getVersionContent(user.id, version);
    const master = await getMasterResume(user.id);
    if (!old || !master) return fail("That version doesn't exist.");
    const r = await addVersion({ userId: user.id, resumeId: master.id, content: old, source: "restore", note: `Restored version ${version}` });
    revalidatePath("/", "layout");
    return { ok: true, version: r.version };
  } catch (err) {
    return actionError(err);
  }
}

/** Short-lived signed URL to the user's original upload. */
export async function originalDownloadUrlAction(): Promise<ActionResult<{ url: string }>> {
  try {
    const user = await requireUser();
    const original = await getLatestOriginal(user.id);
    if (!original) return fail("No original file on record.");
    const url = await storage().getSignedUrl("uploads", original.key, { expiresInSeconds: 120, downloadName: original.name });
    return { ok: true, url };
  } catch (err) {
    return actionError(err);
  }
}

/* ───────────── Guided Q&A ───────────── */

export async function startQaAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const master = await getMasterResume(user.id);
    if (!master) return fail("Upload a resume first.", "no_resume");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;

    const questions = await generateQuestions(master.content, await resolveLlm(user.id));
    if (questions.length === 0) {
      return fail("Your resume looks complete — we have no questions right now. You can still edit it manually.", "no_questions");
    }
    await createQa(user.id, master.id, master.version, questions);
    revalidatePath("/resume/update");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

const answerSchema = z.object({ qaId: z.uuid(), questionId: z.string().min(1), answer: z.string().max(2000), skipped: z.boolean() });

export async function answerQuestionAction(input: z.infer<typeof answerSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const p = answerSchema.safeParse(input);
    if (!p.success) return fail("That answer couldn't be saved.");
    const row = await saveAnswer(user.id, p.data.qaId, { questionId: p.data.questionId, answer: p.data.answer, skipped: p.data.skipped });
    if (!row) return fail("This conversation is no longer open.", "closed");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** After the last question: turn answers into proposed changes (each with a reason) for the user to accept/reject. */
export async function finishQuestionsAction(qaId: string): Promise<ActionResult<{ changes: number }>> {
  try {
    const user = await requireUser();
    const qa = await getOpenQa(user.id);
    if (!qa || qa.id !== qaId) return fail("This conversation is no longer open.", "closed");
    const master = await getMasterResume(user.id);
    if (!master) return fail("Upload a resume first.", "no_resume");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;

    const changes = await proposeChanges(master.content, qa.questions, qa.answers, await resolveLlm(user.id));
    await moveToReview(user.id, qaId, changes);
    revalidatePath("/resume/update");
    return { ok: true, changes: changes.length };
  } catch (err) {
    return actionError(err);
  }
}

export async function decideChangeAction(qaId: string, changeId: string, decision: "accepted" | "rejected" | "pending"): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const row = await decideChange(user.id, qaId, changeId, decision);
    return row ? { ok: true } : fail("This review is no longer open.", "closed");
  } catch (err) {
    return actionError(err);
  }
}

export async function applyQaAction(qaId: string): Promise<ActionResult<{ applied: number }>> {
  try {
    const user = await requireUser();
    const r = await completeQa(user.id, qaId);
    revalidatePath("/", "layout");
    return { ok: true, applied: r.applied };
  } catch (err) {
    return actionError(err);
  }
}

export async function abandonQaAction(qaId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await abandonQa(user.id, qaId);
    revalidatePath("/resume/update");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

