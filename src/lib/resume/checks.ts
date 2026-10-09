import type { ResumeContent } from "./schema";

export type ReviewFlag = {
  id: string;
  section: "contact" | "summary" | "experience" | "education" | "skills";
  /** Item id the flag points at, when applicable. */
  targetId?: string;
  message: string;
  severity: "fix" | "check";
};

const DATE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

/**
 * Deterministic sanity checks shown on the review screen. No LLM: cheap, explainable, testable.
 */
export function reviewFlags(r: ResumeContent): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const add = (f: Omit<ReviewFlag, "id">) => flags.push({ ...f, id: `${f.section}:${f.targetId ?? ""}:${flags.length}` });

  if (!r.contact.fullName.trim()) add({ section: "contact", message: "We couldn't find your name.", severity: "fix" });
  if (!r.contact.email.trim()) add({ section: "contact", message: "No email address found.", severity: "fix" });
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.contact.email.trim())) {
    add({ section: "contact", message: "That email address looks invalid.", severity: "fix" });
  }
  if (!r.contact.location.trim()) add({ section: "contact", message: "No location found. Recruiters filter by it.", severity: "check" });

  if (r.experience.length === 0) add({ section: "experience", message: "No work experience was found.", severity: "fix" });

  for (const e of r.experience) {
    const label = [e.title, e.company].filter(Boolean).join(" at ") || "A role";
    if (!e.title.trim() || !e.company.trim()) add({ section: "experience", targetId: e.id, message: `${label} is missing a title or company.`, severity: "fix" });
    if (!e.start.trim()) add({ section: "experience", targetId: e.id, message: `${label} has no start date.`, severity: "fix" });
    else if (!DATE.test(e.start)) add({ section: "experience", targetId: e.id, message: `${label}: start date should look like 2023-04 or 2023.`, severity: "check" });
    if (!e.current && !e.end.trim()) add({ section: "experience", targetId: e.id, message: `${label} has no end date and isn't marked current.`, severity: "fix" });
    if (e.end && !DATE.test(e.end)) add({ section: "experience", targetId: e.id, message: `${label}: end date should look like 2023-04 or 2023.`, severity: "check" });
    if (e.start && e.end && DATE.test(e.start) && DATE.test(e.end) && e.end < e.start) {
      add({ section: "experience", targetId: e.id, message: `${label} ends before it starts.`, severity: "fix" });
    }
    if (e.bullets.length === 0) add({ section: "experience", targetId: e.id, message: `${label} has no bullet points.`, severity: "check" });
  }

  if (r.skills.length === 0) add({ section: "skills", message: "No skills found.", severity: "check" });
  return flags;
}

/** Approximate total years of experience from role dates (overlaps merged). Null when unknown. */
export function estimateYearsExperience(r: ResumeContent, now = new Date()): number | null {
  const toMonths = (s: string, fallbackEnd = false): number | null => {
    if (!DATE.test(s)) return null;
    const [y, m] = s.split("-");
    return Number(y) * 12 + (m ? Number(m) - 1 : fallbackEnd ? 11 : 0);
  };
  const nowM = now.getFullYear() * 12 + now.getMonth();
  const spans: [number, number][] = [];
  for (const e of r.experience) {
    const s = toMonths(e.start);
    const end = e.current ? nowM : toMonths(e.end, true);
    if (s !== null && end !== null && end >= s) spans.push([s, end]);
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  total += ce - cs;
  return Math.round((total / 12) * 2) / 2; // nearest half year
}
