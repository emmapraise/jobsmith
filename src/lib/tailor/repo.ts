import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/lib/db";
import { parsedJobSchema, type ParsedJob } from "@/lib/jobs/schema";
import { resumeContentSchema, type ResumeContent } from "@/lib/resume/schema";
import { analysisSchema, gapSchema, tailorChangeSchema, type Analysis, type Gap, type TailorChange } from "./types";

const { jobs, tailoredResumes: tr, tailoredResumeVersions: trv } = tables;

export type TailoredView = {
  id: string;
  variant: "uk_eu" | "us";
  masterResumeId: string;
  job: { id: string; title: string; company: string; location: string; url: string | null; parsed: ParsedJob | null };
  version: number;
  baseMasterVersion: number;
  frozen: boolean;
  content: ResumeContent;
  changes: TailorChange[];
  gaps: Gap[];
  analysis: Analysis | null;
  matchScore: number | null;
  updatedAt: Date;
};

const arr = <T extends z.ZodType>(s: T, v: unknown): z.infer<T>[] => z.array(s).catch([]).parse(v);

export async function getTailored(userId: string, id: string): Promise<TailoredView | null> {
  const [row] = await db()
    .select({ t: tr, j: jobs, v: trv })
    .from(tr)
    .innerJoin(jobs, eq(jobs.id, tr.jobId))
    .innerJoin(trv, and(eq(trv.tailoredResumeId, tr.id), eq(trv.version, tr.currentVersion)))
    .where(and(eq(tr.id, id), eq(tr.userId, userId)))
    .limit(1);
  if (!row) return null;
  const parsed = parsedJobSchema.safeParse(row.j.parsed);
  const analysis = analysisSchema.safeParse(row.v.analysis);
  return {
    id: row.t.id,
    variant: row.t.variant === "us" ? "us" : "uk_eu",
    masterResumeId: row.t.masterResumeId,
    job: { id: row.j.id, title: row.j.title, company: row.j.company, location: row.j.location, url: row.j.url, parsed: parsed.success ? parsed.data : null },
    version: row.v.version,
    baseMasterVersion: row.v.baseMasterVersion,
    frozen: Boolean(row.v.frozenAt),
    content: resumeContentSchema.parse(row.v.content),
    changes: arr(tailorChangeSchema, row.v.changes),
    gaps: arr(gapSchema, row.v.gaps),
    analysis: analysis.success ? analysis.data : null,
    matchScore: row.v.matchScore,
    updatedAt: row.t.updatedAt,
  };
}

export type TailoredListItem = { id: string; title: string; company: string; matchScore: number | null; version: number; updatedAt: Date };

export async function listTailored(userId: string, limit = 50): Promise<TailoredListItem[]> {
  return db()
    .select({ id: tr.id, title: jobs.title, company: jobs.company, matchScore: trv.matchScore, version: tr.currentVersion, updatedAt: tr.updatedAt })
    .from(tr)
    .innerJoin(jobs, eq(jobs.id, tr.jobId))
    .innerJoin(trv, and(eq(trv.tailoredResumeId, tr.id), eq(trv.version, tr.currentVersion)))
    .where(eq(tr.userId, userId))
    .orderBy(desc(tr.updatedAt))
    .limit(limit);
}

export type NewTailoring = {
  userId: string;
  masterResumeId: string;
  masterVersion: number;
  variant: "uk_eu" | "us";
  job: { source: "pasted_text" | "pasted_url"; url: string | null; text: string; parsed: ParsedJob };
  content: ResumeContent;
  changes: TailorChange[];
  gaps: Gap[];
  analysis: Analysis;
  matchScore: number | null;
};

export async function createTailored(n: NewTailoring): Promise<string> {
  return db().transaction(async (tx) => {
    const [job] = await tx
      .insert(jobs)
      .values({ userId: n.userId, source: n.job.source, url: n.job.url, title: n.job.parsed.title, company: n.job.parsed.company, location: n.job.parsed.location, description: n.job.text, parsed: n.job.parsed })
      .returning({ id: jobs.id });
    const [t] = await tx
      .insert(tr)
      .values({ userId: n.userId, jobId: job.id, masterResumeId: n.masterResumeId, currentVersion: 1, variant: n.variant })
      .returning({ id: tr.id });
    await tx.insert(trv).values({
      tailoredResumeId: t.id, version: 1, baseMasterVersion: n.masterVersion, content: n.content, changes: n.changes, gaps: n.gaps, analysis: n.analysis, matchScore: n.matchScore,
    });
    return t.id;
  });
}

/** Adds a fresh version (e.g. after re-tailoring against an updated master). Previous versions are kept. */
export async function addTailoredVersion(userId: string, id: string, v: { masterVersion: number; content: ResumeContent; changes: TailorChange[]; gaps: Gap[]; analysis: Analysis; matchScore: number | null }) {
  return db().transaction(async (tx) => {
    const [t] = await tx.select({ id: tr.id }).from(tr).where(and(eq(tr.id, id), eq(tr.userId, userId))).limit(1);
    if (!t) return null;
    const [bumped] = await tx.update(tr).set({ currentVersion: sql`${tr.currentVersion} + 1` }).where(eq(tr.id, id)).returning({ v: tr.currentVersion });
    await tx.insert(trv).values({ tailoredResumeId: id, version: bumped.v, baseMasterVersion: v.masterVersion, content: v.content, changes: v.changes, gaps: v.gaps, analysis: v.analysis, matchScore: v.matchScore });
    return bumped.v;
  });
}

export type Working = { content: ResumeContent; changes: TailorChange[]; gaps: Gap[] };

/**
 * Applies `fn` to the current working version. If that version is frozen (exported / used for an application)
 * a NEW version is created from it, so a version that was sent to an employer never changes.
 */
export async function mutateWorking(userId: string, id: string, fn: (w: Working) => Working | Promise<Working>): Promise<{ version: number } | null> {
  const view = await getTailored(userId, id);
  if (!view) return null;
  const next = await fn({ content: view.content, changes: view.changes, gaps: view.gaps });
  const content = resumeContentSchema.parse(next.content);

  return db().transaction(async (tx) => {
    if (view.frozen) {
      const [bumped] = await tx.update(tr).set({ currentVersion: sql`${tr.currentVersion} + 1` }).where(eq(tr.id, id)).returning({ v: tr.currentVersion });
      await tx.insert(trv).values({
        tailoredResumeId: id, version: bumped.v, baseMasterVersion: view.baseMasterVersion, content, changes: next.changes, gaps: next.gaps,
        analysis: view.analysis ?? {}, matchScore: view.matchScore,
      });
      return { version: bumped.v };
    }
    await tx.update(trv).set({ content, changes: next.changes, gaps: next.gaps }).where(and(eq(trv.tailoredResumeId, id), eq(trv.version, view.version)));
    await tx.update(tr).set({ updatedAt: new Date() }).where(eq(tr.id, id));
    return { version: view.version };
  });
}

export async function freezeCurrent(userId: string, id: string): Promise<void> {
  const view = await getTailored(userId, id);
  if (!view || view.frozen) return;
  await db().update(trv).set({ frozenAt: new Date() }).where(and(eq(trv.tailoredResumeId, id), eq(trv.version, view.version)));
}

export async function setVariant(userId: string, id: string, variant: "uk_eu" | "us") {
  await db().update(tr).set({ variant }).where(and(eq(tr.id, id), eq(tr.userId, userId)));
}

export async function deleteTailored(userId: string, id: string): Promise<void> {
  const [t] = await db().select({ jobId: tr.jobId }).from(tr).where(and(eq(tr.id, id), eq(tr.userId, userId))).limit(1);
  if (t) await db().delete(jobs).where(and(eq(jobs.id, t.jobId), eq(jobs.userId, userId))); // cascades to tailored rows
}

/** A specific stored version (used to download exactly what an application was sent with). */
export async function getTailoredVersion(userId: string, id: string, version: number) {
  const [row] = await db()
    .select({ content: trv.content, variant: tr.variant, company: jobs.company, title: jobs.title, frozen: trv.frozenAt })
    .from(trv)
    .innerJoin(tr, eq(tr.id, trv.tailoredResumeId))
    .innerJoin(jobs, eq(jobs.id, tr.jobId))
    .where(and(eq(trv.tailoredResumeId, id), eq(trv.version, version), eq(tr.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { content: resumeContentSchema.parse(row.content), variant: (row.variant === "us" ? "us" : "uk_eu") as "uk_eu" | "us", company: row.company, title: row.title, frozen: Boolean(row.frozen) };
}

/** Stores drafted application answers on the job (they belong to the job, not to one resume version). */
export async function saveJobAnswers(userId: string, jobId: string, answers: { question: string; answer: string }[]): Promise<void> {
  const [j] = await db().select({ parsed: jobs.parsed }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId))).limit(1);
  const parsed = parsedJobSchema.safeParse(j?.parsed);
  if (!parsed.success) return;
  await db().update(jobs).set({ parsed: { ...parsed.data, answers } }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
}
