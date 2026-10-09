/** Application stages and the timing rules around them. Pure (safe in client components). */
export const STAGES = ["saved", "applied", "screening", "interview", "offer", "rejected"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export const STAGE_HINT: Record<Stage, string> = {
  saved: "Roles you plan to apply for",
  applied: "Waiting to hear back",
  screening: "Recruiter or phone screen",
  interview: "Interviewing",
  offer: "You have an offer",
  rejected: "Closed or declined",
};

export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);

/** Stages where we're waiting on the employer, so reminders make sense. */
export const WAITING_STAGES: Stage[] = ["applied", "screening", "interview"];

/** Days until the follow-up reminder when an application enters a stage. */
export const FOLLOW_UP_DAYS: Partial<Record<Stage, number>> = { applied: 7, screening: 5, interview: 3 };

/** Days in a stage (with no update) before we ask "any news?". */
export const PROMPT_AFTER_DAYS: Partial<Record<Stage, number>> = { saved: 7, applied: 14, screening: 10, interview: 7 };

/** Days we stay quiet after the user says "no news yet". */
export const SNOOZE_DAYS = 7;

const DAY = 86_400_000;
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Follow-up date to set when an application moves into `to` (null = no reminder). */
export function followUpOnMove(to: Stage, now: Date): Date | null {
  const n = FOLLOW_UP_DAYS[to];
  return n ? addDays(now, n) : null;
}
