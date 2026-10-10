"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, fail, limitOrFail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth/session";
import { exportToUrl, type ExportFormat } from "@/lib/export/service";
import { ingestPastedText, ingestUrl, IngestError, type IngestedJob } from "@/lib/jobs/ingest";
import { draftAnswers } from "@/lib/jobs/answers";
import { NotAJobError, parseJob } from "@/lib/jobs/parse";
import { resolveLlm } from "@/lib/llm/user-config";
import { getProfile } from "@/lib/profile/repo";
import { applyChanges, changeSchema } from "@/lib/resume/apply-change";
import { proposeChanges } from "@/lib/resume/qa";
import { addVersion, getMasterResume, getVersionContent } from "@/lib/resume/repo";
import { resumeContentSchema } from "@/lib/resume/schema";
import { applyTailorChange, changeState, revertTailorChange } from "@/lib/tailor/changes";
import { generateTailoring } from "@/lib/tailor/engine";
import { assertStructureUnchanged, StructureError } from "@/lib/tailor/guard";
import { addTailoredVersion, createTailored, deleteTailored, freezeCurrent, getTailored, mutateWorking, saveJobAnswers, setVariant } from "@/lib/tailor/repo";
import type { Decision, TailorChange } from "@/lib/tailor/types";

/** Regional default: US-only searches → US resume; everything else (UK, Europe, remote) → UK/EU CV. */
async function defaultVariant(userId: string): Promise<"uk_eu" | "us"> {
  const { data } = await getProfile(userId);
  const c = data.preferredCountries.map((x) => x.toLowerCase());
  const us = c.some((x) => /^(us|usa|united states|america)/.test(x));
  const other = c.some((x) => !/^(us|usa|united states|america)/.test(x));
  return us && !other ? "us" : "uk_eu";
}

const createSchema = z.object({ mode: z.enum(["url", "paste"]), url: z.string().max(2000).optional(), text: z.string().max(60_000).optional() });

/** Reads the job (link or pasted text), analyses it, and creates a tailored resume. Takes 20–60s. */
export async function createTailoringAction(input: z.infer<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const p = createSchema.safeParse(input);
    if (!p.success) return fail("Please provide a job link or paste the description.");

    const master = await getMasterResume(user.id);
    if (!master) return fail("Upload your master resume first.", "no_resume");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;
    const llm = await resolveLlm(user.id);

    let job: IngestedJob;
    try {
      job = p.data.mode === "url" ? await ingestUrl(p.data.url ?? "") : ingestPastedText(p.data.text ?? "");
    } catch (e) {
      if (e instanceof IngestError) return fail(e.message, e.pasteFallback ? "paste_fallback" : "invalid");
      throw e;
    }

    let parsed;
    try {
      parsed = await parseJob(job.text, llm, job.hints);
    } catch (e) {
      if (e instanceof NotAJobError) return fail(e.message, job.source === "pasted_url" ? "paste_fallback" : "invalid");
      throw e;
    }

    const result = await generateTailoring(master.content, parsed, llm);
    const id = await createTailored({
      userId: user.id,
      masterResumeId: master.id,
      masterVersion: master.version,
      variant: await defaultVariant(user.id),
      job: { source: job.source, url: job.url, text: job.text, parsed },
      content: master.content, // starts as the master; suggestions are applied only when the user accepts them
      changes: result.changes,
      gaps: result.gaps,
      analysis: result.analysis,
      matchScore: result.score,
    });
    revalidatePath("/tailor");
    return { ok: true, id };
  } catch (err) {
    return actionError(err);
  }
}

/* ───────────── Accept / reject ───────────── */

function decide(content: import("@/lib/resume/schema").ResumeContent, changes: TailorChange[], changeId: string, decision: Decision) {
  const c = changes.find((x) => x.id === changeId);
  if (!c) throw new StructureError("That suggestion no longer exists.");
  let next = content;
  const state = changeState(next, c);
  if (decision === "accepted") {
    if (state === "stale") throw new StructureError("You've edited that text, so this suggestion no longer fits. Reject it or undo your edit.");
    if (state === "unapplied") next = applyTailorChange(next, c);
  } else if (state === "applied") {
    next = revertTailorChange(next, c); // rejecting/unsetting an accepted change restores the original text
  }
  return { content: next, changes: changes.map((x) => (x.id === changeId ? { ...x, decision } : x)) };
}

export async function decideChangeAction(id: string, changeId: string, decision: Decision): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const r = await mutateWorking(user.id, id, (w) => ({ ...w, ...decide(w.content, w.changes, changeId, decision) }));
    if (!r) return fail("Not found.");
    return { ok: true };
  } catch (err) {
    if (err instanceof StructureError) return fail(err.message, "stale");
    return actionError(err);
  }
}

export async function decideAllAction(id: string, decision: "accepted" | "rejected"): Promise<ActionResult<{ changed: number; skipped: number }>> {
  try {
    const user = await requireUser();
    let changed = 0;
    let skipped = 0;
    const r = await mutateWorking(user.id, id, (w) => {
      let { content, changes } = w;
      for (const c of w.changes.filter((x) => x.decision === "pending")) {
        try {
          ({ content, changes } = decide(content, changes, c.id, decision));
          changed++;
        } catch (e) {
          if (!(e instanceof StructureError)) throw e;
          skipped++;
        }
      }
      return { ...w, content, changes };
    });
    if (!r) return fail("Not found.");
    return { ok: true, changed, skipped };
  } catch (err) {
    return actionError(err);
  }
}

/* ───────────── Manual edits ───────────── */

export async function saveTailoredContentAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = resumeContentSchema.safeParse(input);
    if (!parsed.success) return fail("Some fields are invalid.", "invalid");
    const view = await getTailored(user.id, id);
    if (!view) return fail("Not found.");
    // Facts must equal the master version this was tailored from.
    const base = await getVersionContent(user.id, view.baseMasterVersion);
    if (!base) return fail("The master version this was based on is missing. Re-tailor to continue.");
    assertStructureUnchanged(base, parsed.data);
    await mutateWorking(user.id, id, (w) => ({ ...w, content: parsed.data }));
    return { ok: true };
  } catch (err) {
    if (err instanceof StructureError) return fail(err.message, "structure");
    return actionError(err);
  }
}

/* ───────────── Gaps: questions, never inventions ───────────── */

export async function answerGapAction(id: string, gapId: string, answer: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const a = answer.trim().slice(0, 2000);
    if (!a) return fail("Tell us what you did, or skip this one.");
    const master = await getMasterResume(user.id);
    const view = await getTailored(user.id, id);
    const gap = view?.gaps.find((g) => g.id === gapId);
    if (!master || !view || !gap) return fail("Not found.");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;
    const llm = await resolveLlm(user.id);

    // Reuse the Q&A engine: the answer can only become proposed edits to the MASTER resume, which the user reviews.
    const proposals = await proposeChanges(
      master.content,
      [{ id: gap.id, question: gap.question, why: `The job asks for: ${gap.requirement}`, kind: "text", targetId: null }],
      [{ questionId: gap.id, answer: a, skipped: false }],
      llm,
    );
    await mutateWorking(user.id, id, (w) => ({ ...w, gaps: w.gaps.map((g) => (g.id === gapId ? { ...g, answer: a, proposals } : g)) }));
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function decideGapProposalAction(id: string, gapId: string, proposalId: string, decision: Decision): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const r = await mutateWorking(user.id, id, (w) => ({
      ...w,
      gaps: w.gaps.map((g) => (g.id === gapId ? { ...g, proposals: g.proposals.map((p) => (p.id === proposalId ? { ...p, decision } : p)) } : g)),
    }));
    return r ? { ok: true } : fail("Not found.");
  } catch (err) {
    return actionError(err);
  }
}

/** Adds the accepted facts to the MASTER resume (new master version). Then the user re-tailors. */
export async function applyGapAction(id: string, gapId: string): Promise<ActionResult<{ applied: number }>> {
  try {
    const user = await requireUser();
    const master = await getMasterResume(user.id);
    const view = await getTailored(user.id, id);
    const gap = view?.gaps.find((g) => g.id === gapId);
    if (!master || !view || !gap) return fail("Not found.");

    const accepted = gap.proposals.filter((p) => p.decision === "accepted").map((p) => changeSchema.parse(p.patch));
    let applied = 0;
    if (accepted.length) {
      const r = applyChanges(master.content, accepted);
      applied = accepted.length - r.skipped;
      if (applied > 0) await addVersion({ userId: user.id, resumeId: master.id, content: r.resume, source: "qa", note: `Added from a tailoring gap (${applied} change${applied === 1 ? "" : "s"})` });
    }
    await mutateWorking(user.id, id, (w) => ({ ...w, gaps: w.gaps.map((g) => (g.id === gapId ? { ...g, resolved: true } : g)) }));
    revalidatePath("/", "layout");
    return { ok: true, applied };
  } catch (err) {
    return actionError(err);
  }
}

/** Regenerates suggestions against the CURRENT master. The previous version stays in history. */
export async function retailorAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const master = await getMasterResume(user.id);
    const view = await getTailored(user.id, id);
    if (!master || !view?.job.parsed) return fail("Not found.");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;
    const result = await generateTailoring(master.content, view.job.parsed, await resolveLlm(user.id));
    await freezeCurrent(user.id, id);
    await addTailoredVersion(user.id, id, { masterVersion: master.version, content: master.content, changes: result.changes, gaps: result.gaps, analysis: result.analysis, matchScore: result.score });
    revalidatePath(`/tailor/${id}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ───────────── Application questions found in the posting ───────────── */

/** Drafts answers to the questions the application asks, from the master resume + profile only. */
export async function draftAnswersAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const view = await getTailored(user.id, id);
    const questions = view?.job.parsed?.applicationQuestions ?? [];
    if (!view?.job.parsed || questions.length === 0) return fail("This job has no application questions.");
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;
    const { data: profile } = await getProfile(user.id);
    // Answer from what the candidate will actually send: the tailored resume as it stands.
    const answers = await draftAnswers(questions, view.content, profile, view.job.parsed, await resolveLlm(user.id));
    await saveJobAnswers(user.id, view.job.id, answers);
    revalidatePath(`/tailor/${id}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ───────────── Export & housekeeping ───────────── */

export async function setVariantAction(id: string, variant: "uk_eu" | "us"): Promise<ActionResult> {
  const user = await requireUser();
  await setVariant(user.id, id, variant === "us" ? "us" : "uk_eu");
  return { ok: true };
}

export async function exportTailoredAction(id: string, format: ExportFormat): Promise<ActionResult<{ url: string; fileName: string; pending: number }>> {
  try {
    const user = await requireUser();
    if (format !== "pdf" && format !== "docx") return fail("Unknown format.");
    const limited = await limitOrFail(user.id, ["export"]);
    if (limited) return limited;
    const view = await getTailored(user.id, id);
    if (!view) return fail("Not found.");
    // The exported file is exactly this version; freeze it so later edits create a new version.
    await freezeCurrent(user.id, id);
    const out = await exportToUrl({ userId: user.id, ownerId: id, content: view.content, variant: view.variant, format, company: view.job.company });
    return { ok: true, url: out.url, fileName: out.fileName, pending: view.changes.filter((c) => c.decision === "pending").length };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteTailoringAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await deleteTailored(user.id, id);
    revalidatePath("/tailor");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
