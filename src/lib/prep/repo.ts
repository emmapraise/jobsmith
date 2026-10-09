import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { prepDataSchema, type Attempt, type PrepData } from "./schema";

const { interviewPreps: ip, jobs } = tables;

export type PrepView = {
  id: string;
  jobId: string;
  applicationId: string | null;
  title: string;
  company: string;
  location: string;
  data: PrepData;
  updatedAt: Date;
};

const sel = { id: ip.id, jobId: ip.jobId, applicationId: ip.applicationId, data: ip.data, updatedAt: ip.updatedAt, title: jobs.title, company: jobs.company, location: jobs.location };

function toView(r: { id: string; jobId: string; applicationId: string | null; data: unknown; updatedAt: Date; title: string; company: string; location: string }): PrepView | null {
  const parsed = prepDataSchema.safeParse(r.data);
  return parsed.success ? { ...r, data: parsed.data } : null; // a malformed/old row is treated as absent, never rendered
}

export async function getPrep(userId: string, id: string): Promise<PrepView | null> {
  const [r] = await db().select(sel).from(ip).innerJoin(jobs, eq(jobs.id, ip.jobId)).where(and(eq(ip.id, id), eq(ip.userId, userId))).limit(1);
  return r ? toView(r) : null;
}

export async function prepForJob(userId: string, jobId: string): Promise<PrepView | null> {
  const [r] = await db().select(sel).from(ip).innerJoin(jobs, eq(jobs.id, ip.jobId)).where(and(eq(ip.jobId, jobId), eq(ip.userId, userId))).limit(1);
  return r ? toView(r) : null;
}

export async function listPreps(userId: string): Promise<PrepView[]> {
  const rows = await db().select(sel).from(ip).innerJoin(jobs, eq(jobs.id, ip.jobId)).where(eq(ip.userId, userId)).orderBy(desc(ip.updatedAt));
  return rows.flatMap((r) => toView(r) ?? []);
}

/** Creates the prep for a job, or replaces its content (keeping the same id) when one already exists. */
export async function upsertPrep(userId: string, jobId: string, applicationId: string | null, data: PrepData): Promise<string> {
  const [job] = await db().select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId))).limit(1);
  if (!job) throw new Error("Job not found");
  const [r] = await db()
    .insert(ip)
    .values({ userId, jobId, applicationId, data })
    .onConflictDoUpdate({ target: [ip.userId, ip.jobId], set: { data, applicationId } })
    .returning({ id: ip.id });
  return r.id;
}

const MAX_ATTEMPTS = 200;

export async function addAttempt(userId: string, id: string, attempt: Attempt): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [row] = await tx.select({ data: ip.data }).from(ip).where(and(eq(ip.id, id), eq(ip.userId, userId))).for("update").limit(1);
    const parsed = row ? prepDataSchema.safeParse(row.data) : null;
    if (!parsed?.success) return false;
    if (!parsed.data.questions.some((q) => q.id === attempt.questionId)) return false;
    const attempts = [...parsed.data.attempts, attempt].slice(-MAX_ATTEMPTS);
    await tx.update(ip).set({ data: { ...parsed.data, attempts } }).where(eq(ip.id, id));
    return true;
  });
}

export async function clearAttempts(userId: string, id: string, questionId?: string): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [row] = await tx.select({ data: ip.data }).from(ip).where(and(eq(ip.id, id), eq(ip.userId, userId))).for("update").limit(1);
    const parsed = row ? prepDataSchema.safeParse(row.data) : null;
    if (!parsed?.success) return false;
    const attempts = questionId ? parsed.data.attempts.filter((a) => a.questionId !== questionId) : [];
    await tx.update(ip).set({ data: { ...parsed.data, attempts } }).where(eq(ip.id, id));
    return true;
  });
}

export async function deletePrep(userId: string, id: string): Promise<void> {
  await db().delete(ip).where(and(eq(ip.id, id), eq(ip.userId, userId)));
}

export type PrepJobOption = {
  id: string;
  title: string;
  company: string;
  status: string | null;
  hasPrep: boolean;
  /** Never analysed and no usable text: the user will be asked to paste the description. */
  needsDescription: boolean;
};

/** Jobs the user could prepare for (anything they've tailored for or tracked), interviewing ones first. */
export async function listJobsForPrep(userId: string): Promise<PrepJobOption[]> {
  const rows = await db()
    .select({
      id: jobs.id, title: jobs.title, company: jobs.company, parsed: jobs.parsed, descLen: sql<number>`char_length(${jobs.description})`,
      status: tables.applications.status, prepId: ip.id, createdAt: jobs.createdAt,
    })
    .from(jobs)
    .leftJoin(tables.applications, eq(tables.applications.jobId, jobs.id))
    .leftJoin(ip, eq(ip.jobId, jobs.id))
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt));
  const rank = (s: string | null) => (s === "interview" ? 0 : s === "screening" ? 1 : s === "applied" ? 2 : s === "offer" ? 3 : s === "saved" ? 4 : s === "rejected" ? 6 : 5);
  return rows
    .map((r) => ({ id: r.id, title: r.title, company: r.company, status: r.status as string | null, hasPrep: Boolean(r.prepId), needsDescription: !r.parsed && Number(r.descLen) < 200 }))
    .sort((a, b) => rank(a.status) - rank(b.status));
}
