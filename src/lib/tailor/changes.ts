import type { ResumeContent } from "@/lib/resume/schema";
import type { TailorChange } from "./types";

export type ChangeState = "applied" | "unapplied" | "stale";

const lower = (s: string) => s.trim().toLowerCase();
const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a.map(lower)).size === new Set([...a, ...b].map(lower)).size;

function bulletLists(r: ResumeContent) {
  return [...r.experience.map((e) => e.bullets), ...r.projects.map((p) => p.bullets), ...r.education.map((e) => e.details)];
}
const findBullet = (r: ResumeContent, id: string) => {
  for (const l of bulletLists(r)) {
    const b = l.find((x) => x.id === id);
    if (b) return b;
  }
  return null;
};
const findParent = (r: ResumeContent, id: string) => r.experience.find((e) => e.id === id) ?? r.projects.find((p) => p.id === id) ?? null;

/** Where does the CURRENT content stand relative to this change? */
export function changeState(r: ResumeContent, c: TailorChange): ChangeState {
  switch (c.kind) {
    case "bullet_text": {
      const b = findBullet(r, c.bulletId);
      if (!b) return "stale";
      return b.text === c.after ? "applied" : b.text === c.before ? "unapplied" : "stale";
    }
    case "summary":
      return r.summary === c.after ? "applied" : r.summary === c.before ? "unapplied" : "stale";
    case "headline":
      return r.contact.headline === c.after ? "applied" : r.contact.headline === c.before ? "unapplied" : "stale";
    case "bullets_order": {
      const p = findParent(r, c.parentId);
      if (!p) return "stale";
      const ids = p.bullets.map((b) => b.id);
      if (ids.join() === c.after.join()) return "applied";
      if (ids.join() === c.before.join()) return "unapplied";
      return "stale";
    }
    case "skills_order": {
      const g = r.skills.find((s) => s.id === c.groupId);
      if (!g) return "stale";
      if (g.items.join("|") === c.after.join("|")) return "applied";
      if (g.items.join("|") === c.before.join("|")) return "unapplied";
      return "stale";
    }
    case "skills_add": {
      const g = r.skills.find((s) => s.id === c.groupId);
      if (!g) return "stale";
      const have = new Set(g.items.map(lower));
      const n = c.items.filter((i) => have.has(lower(i))).length;
      return n === c.items.length ? "applied" : n === 0 ? "unapplied" : "stale";
    }
  }
}

/** Pure. Throws if the change is stale or already applied. */
export function applyTailorChange(resume: ResumeContent, c: TailorChange): ResumeContent {
  if (changeState(resume, c) !== "unapplied") throw new Error("Change cannot be applied: content changed");
  return transform(resume, c, "after");
}

export function revertTailorChange(resume: ResumeContent, c: TailorChange): ResumeContent {
  if (changeState(resume, c) !== "applied") throw new Error("Change cannot be reverted: content changed");
  return transform(resume, c, "before");
}

function transform(resume: ResumeContent, c: TailorChange, to: "before" | "after"): ResumeContent {
  const r: ResumeContent = structuredClone(resume);
  switch (c.kind) {
    case "bullet_text":
      findBullet(r, c.bulletId)!.text = c[to];
      break;
    case "summary":
      r.summary = c[to];
      break;
    case "headline":
      r.contact.headline = c[to];
      break;
    case "bullets_order": {
      const p = findParent(r, c.parentId)!;
      const order = c[to];
      p.bullets.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      break;
    }
    case "skills_order":
      r.skills.find((s) => s.id === c.groupId)!.items = [...c[to]];
      break;
    case "skills_add": {
      const g = r.skills.find((s) => s.id === c.groupId)!;
      if (to === "after") {
        const have = new Set(g.items.map(lower));
        g.items.push(...c.items.filter((i) => !have.has(lower(i))));
      } else {
        const drop = new Set(c.items.map(lower));
        g.items = g.items.filter((i) => !drop.has(lower(i)));
      }
      break;
    }
  }
  return r;
}

/** Content with every PENDING change applied (for showing suggestions in context). Stale ones are skipped. */
export function withPending(resume: ResumeContent, changes: TailorChange[]): ResumeContent {
  let cur = resume;
  for (const c of changes) {
    if (c.decision !== "pending") continue;
    if (changeState(cur, c) === "unapplied") cur = applyTailorChange(cur, c);
  }
  return cur;
}

/** Which document items a change touches (for highlighting). */
export function changeTargets(c: TailorChange): string[] {
  switch (c.kind) {
    case "bullet_text": return [`bullet:${c.bulletId}`];
    case "bullets_order": return [`bullets:${c.parentId}`];
    case "summary": return ["summary"];
    case "headline": return ["headline"];
    case "skills_order":
    case "skills_add": return [`skills:${c.groupId}`];
  }
}

export { sameSet };
