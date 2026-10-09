import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { freezeCurrent, getTailored } from "@/lib/tailor/repo";
import { dueApps, snoozeUntil, type DueApp } from "./due";
import { followUpOnMove, type Stage } from "./stages";

const { applications: ap, applicationEvents: ev, jobs, tailoredResumeVersions: trv, tailoredResumes: tr, resumeVersions: rv } = tables;

export type ResumeRef =
  | { kind: "tailored"; tailoredId: string; version: number; frozen: boolean; matchScore: number | null }
  | { kind: "master"; version: number }
  | null;

export type AppRow = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  location: string;
  url: string | null;
  status: Stage;
  appliedAt: Date | null;
  nextFollowUpAt: Date | null;
  statusChangedAt: Date;
  lastStatusPromptAt: Date | null;
  snoozedUntil: Date | null;
  notes: string;
  createdAt: Date;
  resume: ResumeRef;
};

const select = {
  id: ap.id, jobId: ap.jobId, title: jobs.title, company: jobs.company, location: jobs.location, url: jobs.url, status: ap.status,
  appliedAt: ap.appliedAt, nextFollowUpAt: ap.nextFollowUpAt, statusChangedAt: ap.statusChangedAt, lastStatusPromptAt: ap.lastStatusPromptAt,
  snoozedUntil: ap.snoozedUntil, notes: ap.notes, createdAt: ap.createdAt,
  tVersion: trv.version, tFrozen: trv.frozenAt, tScore: trv.matchScore, tId: trv.tailoredResumeId, mVersion: rv.version,
};

type Raw = {
  [K in keyof typeof select]: (typeof select)[K]["_"]["data"] extends infer D ? D : never;
} & { tVersion: number | null; tFrozen: Date | null; tScore: number | null; tId: string | null; mVersion: number | null };

function toRow(r: Raw): AppRow {
  const { tVersion, tFrozen, tScore, tId, mVersion, ...rest } = r;
  const resume: ResumeRef = tId && tVersion !== null ? { kind: "tailored", tailoredId: tId, version: tVersion, frozen: Boolean(tFrozen), matchScore: tScore }
    : mVersion !== null ? { kind: "master", version: mVersion } : null;
  return { ...(rest as Omit<Raw, "tVersion" | "tFrozen" | "tScore" | "tId" | "mVersion">), status: rest.status as Stage, resume } as AppRow;
}

const base = () =>
  db().select(select).from(ap).innerJoin(jobs, eq(jobs.id, ap.jobId)).leftJoin(trv, eq(trv.id, ap.tailoredResumeVersionId)).leftJoin(rv, eq(rv.id, ap.resumeVersionId));

export async function listApplications(userId: string): Promise<AppRow[]> {
  const rows = await base().where(eq(ap.userId, userId)).orderBy(desc(ap.statusChangedAt));
  return rows.map((r) => toRow(r as unknown as Raw));
}

export async function getApplication(userId: string, id: string): Promise<AppRow | null> {
  const [r] = await base().where(and(eq(ap.id, id), eq(ap.userId, userId))).limit(1);
  return r ? toRow(r as unknown as Raw) : null;
}

/** The application tracking a given job, if any (so the tailoring page can show "In tracker"). */
export async function applicationForJob(userId: string, jobId: string): Promise<{ id: string; status: Stage } | null> {
  const [r] = await db().select({ id: ap.id, status: ap.status }).from(ap).where(and(eq(ap.userId, userId), eq(ap.jobId, jobId))).limit(1);
  return r ? { id: r.id, status: r.status as Stage } : null;
}

export async function getEvents(userId: string, id: string) {
  const [own] = await db().select({ id: ap.id }).from(ap).where(and(eq(ap.id, id), eq(ap.userId, userId))).limit(1);
  if (!own) return [];
  return db().select({ from: ev.fromStatus, to: ev.toStatus, at: ev.at }).from(ev).where(eq(ev.applicationId, id)).orderBy(asc(ev.at));
}

export type ResumeChoice = { tailoredId: string } | { master: true } | null;

/** Freezes the chosen tailored version (so it can never change) and returns the column values to store. */
async function resolveResume(userId: string, choice: ResumeChoice): Promise<{ tailoredResumeVersionId: string | null; resumeVersionId: string | null }> {
  if (!choice) return { tailoredResumeVersionId: null, resumeVersionId: null };
  if ("tailoredId" in choice) {
    const view = await getTailored(userId, choice.tailoredId);
    if (!view) throw new Error("Tailored resume not found");
    await freezeCurrent(userId, choice.tailoredId);
    const [v] = await db().select({ id: trv.id }).from(trv).where(and(eq(trv.tailoredResumeId, choice.tailoredId), eq(trv.version, view.version))).limit(1);
    return { tailoredResumeVersionId: v.id, resumeVersionId: null };
  }
  const [m] = await db()
    .select({ id: rv.id })
    .from(tables.resumes)
    .innerJoin(rv, and(eq(rv.resumeId, tables.resumes.id), eq(rv.version, tables.resumes.currentVersion)))
    .where(eq(tables.resumes.userId, userId))
    .limit(1);
  return { tailoredResumeVersionId: null, resumeVersionId: m?.id ?? null };
}

export type NewApplication = {
  userId: string;
  /** Existing job (from a tailoring). Otherwise `manual` creates one. */
  jobId?: string;
  manual?: { company: string; title: string; url?: string | null; location?: string };
  status: Stage;
  appliedAt?: Date | null;
  resume: ResumeChoice;
  notes?: string;
  now?: Date;
};

/** Creates the application (idempotent per job), records the first event, and sets the follow-up reminder. */
export async function createApplication(n: NewApplication): Promise<{ id: string; created: boolean }> {
  const now = n.now ?? new Date();
  let jobId = n.jobId;
  if (jobId) {
    const [j] = await db().select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.userId, n.userId))).limit(1);
    if (!j) throw new Error("Job not found");
    const existing = await applicationForJob(n.userId, jobId);
    if (existing) return { id: existing.id, created: false };
  }
  const resume = await resolveResume(n.userId, n.resume);

  return db().transaction(async (tx) => {
    if (!jobId) {
      const m = n.manual!;
      const [j] = await tx
        .insert(jobs)
        .values({ userId: n.userId, source: m.url ? "pasted_url" : "pasted_text", url: m.url || null, title: m.title.trim(), company: m.company.trim(), location: (m.location ?? "").trim(), description: "" })
        .returning({ id: jobs.id });
      jobId = j.id;
    }
    const applied = n.status === "saved" ? null : (n.appliedAt ?? now);
    const [a] = await tx
      .insert(ap)
      .values({ userId: n.userId, jobId, ...resume, status: n.status, statusChangedAt: now, appliedAt: applied, nextFollowUpAt: followUpOnMove(n.status, applied ?? now), notes: (n.notes ?? "").slice(0, 5000) })
      .returning({ id: ap.id });
    await tx.insert(ev).values({ applicationId: a.id, fromStatus: null, toStatus: n.status, at: now });
    return { id: a.id, created: true };
  });
}

export async function moveApplication(userId: string, id: string, to: Stage, now = new Date()): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [cur] = await tx.select().from(ap).where(and(eq(ap.id, id), eq(ap.userId, userId))).limit(1);
    if (!cur) return false;
    if (cur.status === to) return true;
    await tx
      .update(ap)
      .set({
        status: to,
        statusChangedAt: now,
        snoozedUntil: null,
        lastStatusPromptAt: null,
        nextFollowUpAt: followUpOnMove(to, now),
        // Any stage past "saved" implies it was applied for; keep an earlier date if the user set one.
        appliedAt: to === "saved" ? cur.appliedAt : (cur.appliedAt ?? now),
      })
      .where(eq(ap.id, id));
    await tx.insert(ev).values({ applicationId: id, fromStatus: cur.status, toStatus: to, at: now });
    return true;
  });
}

export type AppPatch = Partial<{ notes: string; appliedAt: Date | null; nextFollowUpAt: Date | null }>;

export async function updateApplication(userId: string, id: string, patch: AppPatch): Promise<boolean> {
  const set: Record<string, unknown> = {};
  if (patch.notes !== undefined) set.notes = patch.notes.slice(0, 5000);
  if (patch.appliedAt !== undefined) set.appliedAt = patch.appliedAt;
  if (patch.nextFollowUpAt !== undefined) set.nextFollowUpAt = patch.nextFollowUpAt;
  if (Object.keys(set).length === 0) return true;
  const r = await db().update(ap).set(set).where(and(eq(ap.id, id), eq(ap.userId, userId))).returning({ id: ap.id });
  return r.length > 0;
}

/** "No news yet": stay quiet for a week. */
export async function snoozeApplication(userId: string, id: string, now = new Date()): Promise<boolean> {
  const r = await db().update(ap).set({ lastStatusPromptAt: now, snoozedUntil: snoozeUntil(now) }).where(and(eq(ap.id, id), eq(ap.userId, userId))).returning({ id: ap.id });
  return r.length > 0;
}

/** "I followed up": clear this reminder and (optionally) schedule the next one. */
export async function followedUp(userId: string, id: string, nextInDays: number | null, now = new Date()): Promise<boolean> {
  const next = nextInDays ? new Date(now.getTime() + nextInDays * 86_400_000) : null;
  const r = await db().update(ap).set({ nextFollowUpAt: next, lastStatusPromptAt: now }).where(and(eq(ap.id, id), eq(ap.userId, userId))).returning({ id: ap.id });
  return r.length > 0;
}

export async function setApplicationResume(userId: string, id: string, choice: ResumeChoice): Promise<boolean> {
  const [own] = await db().select({ id: ap.id }).from(ap).where(and(eq(ap.id, id), eq(ap.userId, userId))).limit(1);
  if (!own) return false;
  await db().update(ap).set(await resolveResume(userId, choice)).where(eq(ap.id, id));
  return true;
}

export async function deleteApplication(userId: string, id: string): Promise<void> {
  const [a] = await db().select({ jobId: ap.jobId }).from(ap).where(and(eq(ap.id, id), eq(ap.userId, userId))).limit(1);
  if (!a) return;
  await db().delete(ap).where(eq(ap.id, id));
  // A job created only for tracking is removed with it, unless a tailored resume or interview prep still uses it.
  const [still] = await db().select({ id: tr.id }).from(tr).where(eq(tr.jobId, a.jobId)).limit(1);
  const [prep] = await db().select({ id: tables.interviewPreps.id }).from(tables.interviewPreps).where(eq(tables.interviewPreps.jobId, a.jobId)).limit(1);
  if (!still && !prep) await db().delete(jobs).where(and(eq(jobs.id, a.jobId), eq(jobs.userId, userId)));
}

export type DueRow = AppRow & { due: DueApp };

export async function dueForUser(userId: string, now = new Date()): Promise<DueRow[]> {
  const rows = await listApplications(userId);
  const due = dueApps(rows, now);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return due.map((d) => ({ ...byId.get(d.id)!, due: d }));
}

/** Cheap count for the nav badge. */
export async function dueCount(userId: string, now = new Date()): Promise<number> {
  const rows = await db()
    .select({ id: ap.id, status: ap.status, nextFollowUpAt: ap.nextFollowUpAt, statusChangedAt: ap.statusChangedAt, lastStatusPromptAt: ap.lastStatusPromptAt, snoozedUntil: ap.snoozedUntil })
    .from(ap)
    .where(and(eq(ap.userId, userId), inArray(ap.status, ["saved", "applied", "screening", "interview"])));
  return dueApps(rows.map((r) => ({ ...r, status: r.status as Stage })), now).length;
}

