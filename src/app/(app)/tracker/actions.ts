"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, fail, limitOrFail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth/session";
import { exportToUrl, type ExportFormat } from "@/lib/export/service";
import { getMasterResume, getVersionContent } from "@/lib/resume/repo";
import { getTailored, getTailoredVersion } from "@/lib/tailor/repo";
import { isStage } from "@/lib/tracker/stages";
import {
  createApplication, deleteApplication, followedUp, getApplication, moveApplication, setApplicationResume, snoozeApplication, updateApplication, type ResumeChoice,
} from "@/lib/tracker/repo";

const refresh = () => {
  revalidatePath("/tracker");
  revalidatePath("/dashboard");
};

/** "2026-03-05" → noon UTC that day (no timezone drift); "" → null. */
function parseDay(v: string | undefined | null): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === "" || v === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("bad date");
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error("bad date");
  return d;
}

const httpUrl = z.string().trim().max(2000).refine((u) => { try { return ["http:", "https:"].includes(new URL(u).protocol); } catch { return false; } }, "Enter a link starting with http:// or https://");

const resumeChoice = z.string().refine((v) => v === "none" || v === "master" || /^tailored:[0-9a-f-]{36}$/i.test(v)).default("none");
const toChoice = (v: string): ResumeChoice => (v === "master" ? { master: true } : v.startsWith("tailored:") ? { tailoredId: v.slice(9) } : null);

const addSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(120),
  title: z.string().trim().min(1, "Job title is required").max(160),
  url: z.union([z.literal(""), httpUrl]).optional(),
  location: z.string().trim().max(120).optional(),
  status: z.string().refine(isStage),
  appliedOn: z.string().optional(),
  resume: resumeChoice,
  notes: z.string().max(5000).optional(),
});

export async function addApplicationAction(input: z.input<typeof addSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const p = addSchema.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Please check the form.", "invalid");
    const d = p.data;
    const choice = toChoice(d.resume);
    if (choice && "tailoredId" in choice && !(await getTailored(user.id, choice.tailoredId))) return fail("That tailored resume wasn't found.");
    const r = await createApplication({
      userId: user.id, manual: { company: d.company, title: d.title, url: d.url || null, location: d.location }, status: d.status as never,
      appliedAt: parseDay(d.appliedOn) ?? null, resume: choice, notes: d.notes,
    });
    refresh();
    return { ok: true, id: r.id };
  } catch (err) {
    return actionError(err);
  }
}

/** From a tailored resume: track its job and pin the exact version that's current right now. */
export async function trackTailoredAction(tailoredId: string, status: "saved" | "applied"): Promise<ActionResult<{ id: string; created: boolean }>> {
  try {
    const user = await requireUser();
    const view = await getTailored(user.id, tailoredId);
    if (!view) return fail("Not found.");
    const r = await createApplication({ userId: user.id, jobId: view.job.id, status: status === "applied" ? "applied" : "saved", resume: { tailoredId }, now: new Date() });
    refresh();
    revalidatePath(`/tailor/${tailoredId}`);
    return { ok: true, ...r };
  } catch (err) {
    return actionError(err);
  }
}

export async function moveApplicationAction(id: string, stage: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!isStage(stage)) return fail("Unknown stage.");
    if (!(await moveApplication(user.id, id, stage))) return fail("Not found.");
    refresh();
    revalidatePath(`/tracker/${id}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

const updateSchema = z.object({ notes: z.string().max(5000).optional(), appliedOn: z.string().optional(), followUpOn: z.string().optional() });

export async function updateApplicationAction(id: string, input: z.input<typeof updateSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const p = updateSchema.safeParse(input);
    if (!p.success) return fail("Please check the form.", "invalid");
    let appliedAt, nextFollowUpAt;
    try { appliedAt = parseDay(p.data.appliedOn); nextFollowUpAt = parseDay(p.data.followUpOn); } catch { return fail("That date isn't valid.", "invalid"); }
    const ok = await updateApplication(user.id, id, { notes: p.data.notes, appliedAt, nextFollowUpAt });
    if (!ok) return fail("Not found.");
    refresh();
    revalidatePath(`/tracker/${id}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Answer to "any news?": "no_news" snoozes for a week. Real news is a stage change (moveApplicationAction). */
export async function noNewsAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!(await snoozeApplication(user.id, id))) return fail("Not found.");
    refresh();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function followedUpAction(id: string, nextInDays: number | null): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const n = nextInDays === null ? null : Math.min(Math.max(Math.round(nextInDays), 1), 60);
    if (!(await followedUp(user.id, id, n))) return fail("Not found.");
    refresh();
    revalidatePath(`/tracker/${id}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function setResumeAction(id: string, choice: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const c = resumeChoice.safeParse(choice);
    if (!c.success) return fail("Unknown resume.");
    if (!(await setApplicationResume(user.id, id, toChoice(c.data)))) return fail("Not found.");
    refresh();
    revalidatePath(`/tracker/${id}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteApplicationAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await deleteApplication(user.id, id);
    refresh();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Download exactly the resume version this application used (never the latest). */
export async function exportApplicationResumeAction(id: string, format: ExportFormat): Promise<ActionResult<{ url: string; fileName: string }>> {
  try {
    const user = await requireUser();
    if (format !== "pdf" && format !== "docx") return fail("Unknown format.");
    const limited = await limitOrFail(user.id, ["export"]);
    if (limited) return limited;
    const app = await getApplication(user.id, id);
    if (!app?.resume) return fail("No resume is linked to this application.");

    if (app.resume.kind === "tailored") {
      const v = await getTailoredVersion(user.id, app.resume.tailoredId, app.resume.version);
      if (!v) return fail("That resume version no longer exists.");
      const out = await exportToUrl({ userId: user.id, ownerId: app.resume.tailoredId, content: v.content, variant: v.variant, format, company: v.company });
      return { ok: true, url: out.url, fileName: out.fileName };
    }
    const master = await getMasterResume(user.id);
    const content = master ? await getVersionContent(user.id, app.resume.version) : null;
    if (!master || !content) return fail("That resume version no longer exists.");
    const out = await exportToUrl({ userId: user.id, ownerId: master.id, content, variant: "uk_eu", format, company: app.company });
    return { ok: true, url: out.url, fileName: out.fileName };
  } catch (err) {
    return actionError(err);
  }
}
