import "server-only";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { buildDigest } from "./digest";
import { dueForUser } from "./repo";

const MIN_GAP_MS = 20 * 3_600_000; // at most one digest a day

export async function getEmailReminders(userId: string): Promise<boolean> {
  const [r] = await db().select({ on: tables.notificationPrefs.emailReminders }).from(tables.notificationPrefs).where(eq(tables.notificationPrefs.userId, userId)).limit(1);
  return r?.on ?? false;
}

export async function setEmailReminders(userId: string, on: boolean): Promise<void> {
  await db().insert(tables.notificationPrefs).values({ userId, emailReminders: on }).onConflictDoUpdate({ target: tables.notificationPrefs.userId, set: { emailReminders: on } });
}

/** Sends one digest to each opted-in user who has something due. Safe to call repeatedly. */
export async function runReminderDigests(now = new Date()): Promise<{ users: number; sent: number; skipped: number }> {
  const rows = await db()
    .select({ userId: tables.notificationPrefs.userId, last: tables.notificationPrefs.lastDigestAt, email: tables.users.email })
    .from(tables.notificationPrefs)
    .innerJoin(tables.users, eq(tables.users.id, tables.notificationPrefs.userId))
    .where(eq(tables.notificationPrefs.emailReminders, true));

  let sent = 0;
  let skipped = 0;
  for (const u of rows) {
    if (!u.email || (u.last && now.getTime() - u.last.getTime() < MIN_GAP_MS)) { skipped++; continue; }
    const due = await dueForUser(u.userId, now);
    if (due.length === 0) { skipped++; continue; }
    const mail = buildDigest(due.map((d) => ({ id: d.id, company: d.company, title: d.title, status: d.status, followUpDue: d.due.followUpDue !== null, promptDue: d.due.promptDue, daysInStage: d.due.daysInStage })), env().AUTH_URL ?? "http://localhost:3000");
    try {
      if (await sendEmail({ to: u.email, ...mail })) {
        await db().update(tables.notificationPrefs).set({ lastDigestAt: now }).where(eq(tables.notificationPrefs.userId, u.userId));
        sent++;
      } else skipped++;
    } catch (err) {
      log.error("reminders.send_failed", err);
      skipped++;
    }
  }
  log.info("reminders.run", { users: rows.length, sent, skipped });
  return { users: rows.length, sent, skipped };
}
