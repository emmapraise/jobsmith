import { z } from "zod";
import { newId, type ResumeContent } from "./schema";

/**
 * A "change" is a typed, minimal patch to the structured resume. The LLM only ever proposes changes in
 * this shape; the server validates and applies them, and the user accepts or rejects each one.
 * Flat shape (nullable fields, no unions) keeps it portable across LLM providers' structured-output modes.
 */
export const CHANGE_OPS = [
  "add_bullet",
  "replace_bullet",
  "add_skills",
  "set_summary",
  "set_headline",
  "set_role_end",
  "mark_role_current",
  "add_experience",
  "add_certification",
] as const;

export const changeSchema = z.object({
  op: z.enum(CHANGE_OPS),
  /** experience/project id (add_bullet, set_role_end, mark_role_current) or bullet id (replace_bullet). */
  targetId: z.string().nullable(),
  /** Bullet text, summary, headline or end date (YYYY-MM) depending on op. */
  text: z.string().nullable(),
  groupName: z.string().nullable(),
  items: z.array(z.string()),
  role: z
    .object({
      company: z.string(),
      title: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      current: z.boolean(),
    })
    .nullable(),
  cert: z.object({ name: z.string(), issuer: z.string(), date: z.string() }).nullable(),
  /** Short human description of the change. */
  description: z.string(),
  /** Why: cites the user's answer. */
  reason: z.string(),
});

export type Change = z.infer<typeof changeSchema>;

export class ChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangeError";
  }
}

const need = <T>(v: T | null | undefined, what: string): T => {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) throw new ChangeError(`Missing ${what}`);
  return v;
};

/** Pure: returns a new resume. Throws ChangeError when the change can't be applied cleanly. */
export function applyChange(resume: ResumeContent, change: Change): ResumeContent {
  const r: ResumeContent = structuredClone(resume);

  switch (change.op) {
    case "add_bullet": {
      const id = need(change.targetId, "target");
      const text = need(change.text, "text").trim();
      const target = r.experience.find((e) => e.id === id) ?? r.projects.find((p) => p.id === id);
      if (!target) throw new ChangeError("Target role or project not found");
      target.bullets.push({ id: newId(), text });
      return r;
    }
    case "replace_bullet": {
      const id = need(change.targetId, "target");
      const text = need(change.text, "text").trim();
      const lists = [...r.experience.map((e) => e.bullets), ...r.projects.map((p) => p.bullets), ...r.education.map((e) => e.details)];
      for (const list of lists) {
        const b = list.find((x) => x.id === id);
        if (b) {
          b.text = text;
          return r;
        }
      }
      throw new ChangeError("Bullet not found");
    }
    case "add_skills": {
      const items = change.items.map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) throw new ChangeError("No skills given");
      const name = (change.groupName ?? "").trim() || "Skills";
      let group = r.skills.find((g) => g.name.toLowerCase() === name.toLowerCase());
      if (!group) {
        group = { id: newId(), name, items: [] };
        r.skills.push(group);
      }
      const have = new Set(group.items.map((s) => s.toLowerCase()));
      const fresh = items.filter((s) => !have.has(s.toLowerCase()));
      if (fresh.length === 0) throw new ChangeError("Those skills are already listed");
      group.items.push(...fresh);
      return r;
    }
    case "set_summary":
      r.summary = need(change.text, "text").trim();
      return r;
    case "set_headline":
      r.contact.headline = need(change.text, "text").trim();
      return r;
    case "set_role_end": {
      const e = r.experience.find((x) => x.id === need(change.targetId, "target"));
      if (!e) throw new ChangeError("Role not found");
      const end = need(change.text, "end date").trim();
      if (!/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(end)) throw new ChangeError("End date must look like 2025-03");
      e.end = end;
      e.current = false;
      return r;
    }
    case "mark_role_current": {
      const e = r.experience.find((x) => x.id === need(change.targetId, "target"));
      if (!e) throw new ChangeError("Role not found");
      e.current = true;
      e.end = "";
      return r;
    }
    case "add_experience": {
      const role = need(change.role, "role");
      need(role.company, "company");
      need(role.title, "title");
      const bullets = change.text?.trim() ? [{ id: newId(), text: change.text.trim() }] : [];
      r.experience.unshift({ id: newId(), ...role, end: role.current ? "" : role.end, bullets });
      return r;
    }
    case "add_certification": {
      const cert = need(change.cert, "certification");
      need(cert.name, "certification name");
      r.certifications.push({ id: newId(), ...cert });
      return r;
    }
  }
}

/** Apply every accepted change in order; changes that no longer apply are skipped and reported. */
export function applyChanges(resume: ResumeContent, changes: Change[]): { resume: ResumeContent; skipped: number } {
  let current = resume;
  let skipped = 0;
  for (const c of changes) {
    try {
      current = applyChange(current, c);
    } catch (err) {
      if (!(err instanceof ChangeError)) throw err;
      skipped++;
    }
  }
  return { resume: current, skipped };
}
