import { addDays, PROMPT_AFTER_DAYS, SNOOZE_DAYS, WAITING_STAGES, type Stage } from "./stages";

export type DueInput = {
  id: string;
  status: Stage;
  nextFollowUpAt: Date | null;
  statusChangedAt: Date;
  lastStatusPromptAt: Date | null;
  snoozedUntil: Date | null;
};

export type DueApp = {
  id: string;
  /** Follow-up date that has arrived (overdue or today), if any. */
  followUpDue: Date | null;
  /** True when we should ask "any news on this one?" */
  promptDue: boolean;
  /** Whole days since the last stage change. */
  daysInStage: number;
  /** Sort key: most overdue first. */
  overdueDays: number;
};

const DAY = 86_400_000;
const wholeDays = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));

/**
 * What needs the user's attention now?
 *  - follow-up: nextFollowUpAt has arrived (only while the application is open: saved or waiting stages)
 *  - prompt:    the stage hasn't changed for PROMPT_AFTER_DAYS[stage] (counted from the later of the last stage change
 *               and the last time they answered a prompt), and it isn't snoozed.
 * Offers and rejections are closed: no reminders.
 */
export function dueApps(apps: DueInput[], now: Date): DueApp[] {
  const out: DueApp[] = [];
  for (const a of apps) {
    if (a.status === "offer" || a.status === "rejected") continue;
    const open = a.status === "saved" || WAITING_STAGES.includes(a.status);
    if (!open) continue;

    const followUpDue = a.nextFollowUpAt && a.nextFollowUpAt.getTime() <= now.getTime() ? a.nextFollowUpAt : null;

    const threshold = PROMPT_AFTER_DAYS[a.status];
    const since = a.lastStatusPromptAt && a.lastStatusPromptAt > a.statusChangedAt ? a.lastStatusPromptAt : a.statusChangedAt;
    const snoozed = a.snoozedUntil !== null && a.snoozedUntil.getTime() > now.getTime();
    const promptDue = threshold !== undefined && !snoozed && wholeDays(since, now) >= threshold;

    if (!followUpDue && !promptDue) continue;
    const overdueFrom = followUpDue ?? addDays(since, threshold ?? 0);
    out.push({ id: a.id, followUpDue, promptDue, daysInStage: wholeDays(a.statusChangedAt, now), overdueDays: wholeDays(overdueFrom, now) });
  }
  return out.sort((x, y) => y.overdueDays - x.overdueDays);
}

export const snoozeUntil = (now: Date) => addDays(now, SNOOZE_DAYS);

/** "in 3 days", "today", "2 days overdue" for a follow-up date. */
export function describeFollowUp(date: Date, now: Date): { text: string; overdue: boolean } {
  const d = Math.floor((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY);
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, overdue: true };
  if (d === 0) return { text: "today", overdue: true };
  if (d === 1) return { text: "tomorrow", overdue: false };
  return { text: `in ${d} days`, overdue: false };
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
