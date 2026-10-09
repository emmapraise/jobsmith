import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { parsedJobSchema, type ParsedJob } from "@/lib/jobs/schema";
import { getMasterResume, getVersionContent } from "@/lib/resume/repo";
import type { ResumeContent } from "@/lib/resume/schema";
import { getTailored, getTailoredVersion } from "@/lib/tailor/repo";
import { applicationForJob, getApplication } from "@/lib/tracker/repo";

export type PrepJob = { id: string; title: string; company: string; location: string; url: string | null; description: string; parsed: ParsedJob | null };

export async function getJobForPrep(userId: string, jobId: string): Promise<PrepJob | null> {
  const [j] = await db().select().from(tables.jobs).where(and(eq(tables.jobs.id, jobId), eq(tables.jobs.userId, userId))).limit(1);
  if (!j) return null;
  const parsed = parsedJobSchema.safeParse(j.parsed);
  return { id: j.id, title: j.title, company: j.company, location: j.location, url: j.url, description: j.description, parsed: parsed.success ? parsed.data : null };
}

/**
 * Which resume the candidate is interviewing WITH: the version pinned to their application (what the employer has),
 * else their latest tailored resume for this job, else the current master.
 */
export async function resolvePrepResume(userId: string, jobId: string): Promise<{ content: ResumeContent; label: string; applicationId: string | null } | null> {
  const link = await applicationForJob(userId, jobId);
  const app = link ? await getApplication(userId, link.id) : null;
  if (app?.resume?.kind === "tailored") {
    const v = await getTailoredVersion(userId, app.resume.tailoredId, app.resume.version);
    if (v) return { content: v.content, label: `Tailored CV v${app.resume.version} (the one you applied with)`, applicationId: app.id };
  }
  if (app?.resume?.kind === "master") {
    const c = await getVersionContent(userId, app.resume.version);
    if (c) return { content: c, label: `Master resume v${app.resume.version} (the one you applied with)`, applicationId: app.id };
  }
  const [t] = await db().select({ id: tables.tailoredResumes.id }).from(tables.tailoredResumes).where(and(eq(tables.tailoredResumes.userId, userId), eq(tables.tailoredResumes.jobId, jobId))).orderBy(desc(tables.tailoredResumes.updatedAt)).limit(1);
  if (t) {
    const v = await getTailored(userId, t.id);
    if (v) return { content: v.content, label: `Tailored CV v${v.version}`, applicationId: app?.id ?? null };
  }
  const master = await getMasterResume(userId);
  return master ? { content: master.content, label: `Master resume v${master.version}`, applicationId: app?.id ?? null } : null;
}
