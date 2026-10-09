import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { resumeContentSchema, type ResumeContent } from "./schema";

const { resumes, resumeVersions } = tables;

export type MasterResume = {
  id: string;
  status: "parsing" | "ready" | "failed";
  reviewed: boolean;
  version: number;
  content: ResumeContent;
  updatedAt: Date;
  sourceFileName: string | null;
};

/** Every query is scoped by userId. */
export async function getMasterResume(userId: string): Promise<MasterResume | null> {
  const [row] = await db()
    .select({
      id: resumes.id,
      status: resumes.status,
      reviewed: resumes.reviewed,
      version: resumes.currentVersion,
      updatedAt: resumes.updatedAt,
      content: resumeVersions.content,
    })
    .from(resumes)
    .innerJoin(resumeVersions, and(eq(resumeVersions.resumeId, resumes.id), eq(resumeVersions.version, resumes.currentVersion)))
    .where(eq(resumes.userId, userId))
    .limit(1);
  if (!row) return null;

  const [file] = await db()
    .select({ name: resumeVersions.sourceFileName })
    .from(resumeVersions)
    .where(and(eq(resumeVersions.resumeId, row.id), eq(resumeVersions.source, "upload")))
    .orderBy(desc(resumeVersions.version))
    .limit(1);

  return { ...row, content: resumeContentSchema.parse(row.content), sourceFileName: file?.name ?? null };
}

export async function getResumeId(userId: string): Promise<string | null> {
  const [r] = await db().select({ id: resumes.id }).from(resumes).where(eq(resumes.userId, userId)).limit(1);
  return r?.id ?? null;
}

export type AddVersionInput = {
  userId: string;
  /** Pre-chosen id so the storage key can be computed before the DB write. Used only when creating. */
  resumeId: string;
  content: ResumeContent;
  source: "upload" | "manual_edit" | "qa" | "restore";
  note?: string;
  file?: { key: string; name: string };
  /** Reset the "reviewed" flag (true for new uploads). */
  resetReviewed?: boolean;
};

/** Creates the master resume if needed, then appends an immutable version. Returns the new version number. */
export async function addVersion(input: AddVersionInput): Promise<{ resumeId: string; version: number }> {
  const content = resumeContentSchema.parse(input.content);
  return db().transaction(async (tx) => {
    const [existing] = await tx.select({ id: resumes.id }).from(resumes).where(eq(resumes.userId, input.userId)).limit(1);

    let resumeId: string;
    let version: number;
    if (!existing) {
      resumeId = input.resumeId;
      version = 1;
      await tx.insert(resumes).values({ id: resumeId, userId: input.userId, status: "ready", currentVersion: 1, reviewed: false });
    } else {
      resumeId = existing.id;
      const [bumped] = await tx
        .update(resumes)
        .set({
          currentVersion: sql`${resumes.currentVersion} + 1`,
          status: "ready",
          ...(input.resetReviewed ? { reviewed: false } : {}),
        })
        .where(eq(resumes.id, resumeId))
        .returning({ v: resumes.currentVersion });
      version = bumped.v;
    }

    await tx.insert(resumeVersions).values({
      resumeId,
      version,
      content,
      source: input.source,
      note: input.note ?? null,
      sourceFileKey: input.file?.key ?? null,
      sourceFileName: input.file?.name ?? null,
    });
    return { resumeId, version };
  });
}

export async function markReviewed(userId: string): Promise<void> {
  await db().update(resumes).set({ reviewed: true }).where(eq(resumes.userId, userId));
}

export type VersionSummary = { version: number; source: string; note: string | null; createdAt: Date };

export async function listVersions(userId: string, limit = 20): Promise<VersionSummary[]> {
  const resumeId = await getResumeId(userId);
  if (!resumeId) return [];
  return db()
    .select({
      version: resumeVersions.version,
      source: resumeVersions.source,
      note: resumeVersions.note,
      createdAt: resumeVersions.createdAt,
    })
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, resumeId))
    .orderBy(desc(resumeVersions.version))
    .limit(limit);
}

export async function getVersionContent(userId: string, version: number): Promise<ResumeContent | null> {
  const resumeId = await getResumeId(userId);
  if (!resumeId) return null;
  const [row] = await db()
    .select({ content: resumeVersions.content })
    .from(resumeVersions)
    .where(and(eq(resumeVersions.resumeId, resumeId), eq(resumeVersions.version, version)))
    .limit(1);
  return row ? resumeContentSchema.parse(row.content) : null;
}

/** Latest original upload (for "download my original"). */
export async function getLatestOriginal(userId: string): Promise<{ key: string; name: string } | null> {
  const resumeId = await getResumeId(userId);
  if (!resumeId) return null;
  const [row] = await db()
    .select({ key: resumeVersions.sourceFileKey, name: resumeVersions.sourceFileName })
    .from(resumeVersions)
    .where(and(eq(resumeVersions.resumeId, resumeId), eq(resumeVersions.source, "upload")))
    .orderBy(desc(resumeVersions.version))
    .limit(1);
  return row?.key ? { key: row.key, name: row.name ?? "resume" } : null;
}

export function sameContent(a: ResumeContent, b: ResumeContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
