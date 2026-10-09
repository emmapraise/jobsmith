import type { AppRow, DueRow } from "./repo";
import type { Stage } from "./stages";

/** JSON-safe application for client components (dates as ISO strings). */
export type AppView = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string | null;
  status: Stage;
  appliedAt: string | null;
  nextFollowUpAt: string | null;
  statusChangedAt: string;
  notes: string;
  resume: AppRow["resume"];
  due?: { followUpDue: string | null; promptDue: boolean; daysInStage: number };
};

export const toView = (r: AppRow | DueRow): AppView => ({
  id: r.id, title: r.title, company: r.company, location: r.location, url: r.url, status: r.status,
  appliedAt: r.appliedAt?.toISOString() ?? null, nextFollowUpAt: r.nextFollowUpAt?.toISOString() ?? null, statusChangedAt: r.statusChangedAt.toISOString(),
  notes: r.notes, resume: r.resume,
  ...("due" in r ? { due: { followUpDue: r.due.followUpDue?.toISOString() ?? null, promptDue: r.due.promptDue, daysInStage: r.due.daysInStage } } : {}),
});

/** "today", "yesterday", "5 days ago" relative to a server-provided `now` (so SSR and client agree). */
export function ago(iso: string, nowIso: string): string {
  const d = Math.floor((new Date(nowIso).getTime() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}
