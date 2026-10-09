import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import type { QAAnswer, QAProposedChange, QAQuestion } from "@/lib/db/schema";
import { applyChanges, changeSchema } from "./apply-change";
import { addVersion, getMasterResume } from "./repo";

const { qaSessions } = tables;

export type QaSession = typeof qaSessions.$inferSelect;

export async function getOpenQa(userId: string): Promise<QaSession | null> {
  const [row] = await db()
    .select()
    .from(qaSessions)
    .where(and(eq(qaSessions.userId, userId), inArray(qaSessions.status, ["active", "review"])))
    .orderBy(desc(qaSessions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function createQa(userId: string, resumeId: string, baseVersion: number, questions: QAQuestion[]) {
  // Only one open session per user: abandon any earlier one.
  await db()
    .update(qaSessions)
    .set({ status: "abandoned" })
    .where(and(eq(qaSessions.userId, userId), inArray(qaSessions.status, ["active", "review"])));
  const [row] = await db().insert(qaSessions).values({ userId, resumeId, baseVersion, questions }).returning();
  return row;
}

export async function saveAnswer(userId: string, qaId: string, answer: QAAnswer): Promise<QaSession | null> {
  const [s] = await db().select().from(qaSessions).where(and(eq(qaSessions.id, qaId), eq(qaSessions.userId, userId))).limit(1);
  if (!s || s.status !== "active") return null;
  if (!s.questions.some((q) => q.id === answer.questionId)) return null;
  const answers = [...s.answers.filter((a) => a.questionId !== answer.questionId), { ...answer, answer: answer.answer.slice(0, 2000) }];
  const [row] = await db().update(qaSessions).set({ answers }).where(eq(qaSessions.id, qaId)).returning();
  return row;
}

export async function moveToReview(userId: string, qaId: string, changes: QAProposedChange[]) {
  const [row] = await db()
    .update(qaSessions)
    .set({ proposedChanges: changes, status: changes.length ? "review" : "completed", completedAt: changes.length ? null : new Date() })
    .where(and(eq(qaSessions.id, qaId), eq(qaSessions.userId, userId)))
    .returning();
  return row ?? null;
}

export async function decideChange(userId: string, qaId: string, changeId: string, decision: "accepted" | "rejected" | "pending") {
  const [s] = await db().select().from(qaSessions).where(and(eq(qaSessions.id, qaId), eq(qaSessions.userId, userId))).limit(1);
  if (!s || s.status !== "review") return null;
  const proposedChanges = s.proposedChanges.map((c) => (c.id === changeId ? { ...c, decision } : c));
  const [row] = await db().update(qaSessions).set({ proposedChanges }).where(eq(qaSessions.id, qaId)).returning();
  return row;
}

/** Applies accepted changes to the CURRENT master content as a new version, then closes the session. */
export async function completeQa(userId: string, qaId: string): Promise<{ applied: number; version: number | null }> {
  const [s] = await db().select().from(qaSessions).where(and(eq(qaSessions.id, qaId), eq(qaSessions.userId, userId))).limit(1);
  if (!s || s.status !== "review") return { applied: 0, version: null };

  const accepted = s.proposedChanges.filter((c) => c.decision === "accepted");
  let version: number | null = null;
  let applied = 0;
  if (accepted.length) {
    const master = await getMasterResume(userId);
    if (master) {
      const changes = accepted.map((c) => changeSchema.parse(c.patch));
      const { resume, skipped } = applyChanges(master.content, changes);
      applied = changes.length - skipped;
      if (applied > 0) {
        const v = await addVersion({
          userId,
          resumeId: master.id,
          content: resume,
          source: "qa",
          note: `Updated from Q&A (${applied} change${applied === 1 ? "" : "s"})`,
        });
        version = v.version;
      }
    }
  }
  await db().update(qaSessions).set({ status: "completed", completedAt: new Date() }).where(eq(qaSessions.id, qaId));
  return { applied, version };
}

export async function abandonQa(userId: string, qaId: string) {
  await db()
    .update(qaSessions)
    .set({ status: "abandoned" })
    .where(and(eq(qaSessions.id, qaId), eq(qaSessions.userId, userId)));
}

export async function lastCompletedQaAt(userId: string): Promise<Date | null> {
  const [row] = await db()
    .select({ at: qaSessions.completedAt })
    .from(qaSessions)
    .where(and(eq(qaSessions.userId, userId), eq(qaSessions.status, "completed")))
    .orderBy(desc(qaSessions.completedAt))
    .limit(1);
  return row?.at ?? null;
}
