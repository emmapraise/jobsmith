import { z } from "zod";
import type { ParsedJob } from "@/lib/jobs/schema";
import type { ResumeContent } from "@/lib/resume/schema";
import { factCheck, resumeCorpus, corpusHas } from "./factcheck";
import type { TailorChange } from "./types";

/** LLM-facing operation (flat; nullable instead of optional so it works with strict structured-output modes). */
export const llmOpSchema = z.object({
  op: z.enum(["rewrite_bullet", "reorder_bullets", "reorder_skills", "add_skills", "set_summary", "set_headline"]),
  /** bullet id (rewrite_bullet), experience/project id (reorder_bullets) or skill group id (reorder_skills, add_skills). */
  targetId: z.string().nullable(),
  /** New text for rewrite_bullet / set_summary / set_headline. */
  text: z.string().nullable(),
  /** reorder_bullets: ALL bullet ids of that role/project, most relevant first. */
  orderedIds: z.array(z.string()),
  /** reorder_skills: ALL existing items of the group in the new order. add_skills: items to add. */
  items: z.array(z.string()),
  reason: z.string(),
  requirementIds: z.array(z.string()),
});
export type LlmOp = z.infer<typeof llmOpSchema>;

/** `target`/`text` let the engine tell the model what was rejected so it can propose a faithful replacement. */
export type Dropped = { op: string; why: string; target?: string | null; text?: string | null };

const MAX_CHANGES = 14;
const lower = (s: string) => s.trim().toLowerCase();

function allBullets(r: ResumeContent) {
  return [...r.experience.flatMap((e) => e.bullets), ...r.projects.flatMap((p) => p.bullets), ...r.education.flatMap((e) => e.details)];
}

/**
 * Validates every proposed operation against the MASTER resume and the job, and converts the survivors
 * into materialised changes. This is where the truthfulness guard is enforced in code.
 */
export function materializeChanges(master: ResumeContent, job: ParsedJob, ops: LlmOp[], opts: { touched?: Set<string> } = {}): { changes: TailorChange[]; dropped: Dropped[] } {
  const corpus = resumeCorpus(master);
  const keywords = [...job.keywords, ...job.requirements.map((r) => r.text).filter((t) => t.length <= 40)];
  const reqIds = new Set(job.requirements.map((r) => r.id));
  const bullets = new Map(allBullets(master).map((b) => [b.id, b]));
  const changes: TailorChange[] = [];
  const dropped: Dropped[] = [];
  const touched = new Set<string>(opts.touched ?? []);

  const drop = (op: LlmOp, why: string) => dropped.push({ op: op.op, why, target: op.targetId, text: op.text });
  const common = (op: LlmOp) => ({
    id: crypto.randomUUID(),
    reason: op.reason.trim().slice(0, 300) || "Better matches the job's wording.",
    requirementIds: op.requirementIds.filter((id) => reqIds.has(id)),
    decision: "pending" as const,
  });
  const claim = (key: string) => (touched.has(key) ? false : (touched.add(key), true));

  for (const op of ops) {
    if (changes.length >= MAX_CHANGES) break;

    switch (op.op) {
      case "rewrite_bullet": {
        const b = op.targetId ? bullets.get(op.targetId) : undefined;
        const after = op.text?.trim();
        if (!b || !after) { drop(op, "unknown bullet or empty text"); break; }
        if (after === b.text) { drop(op, "no change"); break; }
        if (after.length > b.text.length * 1.6 + 40) { drop(op, "too long"); break; }
        const fc = factCheck(after, corpus, keywords);
        if (!fc.ok) { drop(op, `unsupported: ${fc.violations.slice(0, 3).join(", ")}`); break; }
        if (!claim(`bullet:${b.id}`)) { drop(op, "duplicate target"); break; }
        changes.push({ ...common(op), kind: "bullet_text", bulletId: b.id, before: b.text, after });
        break;
      }
      case "reorder_bullets": {
        const parent = master.experience.find((e) => e.id === op.targetId) ?? master.projects.find((p) => p.id === op.targetId);
        if (!parent) { drop(op, "unknown role"); break; }
        const before = parent.bullets.map((b) => b.id);
        const after = op.orderedIds;
        if (after.length !== before.length || new Set(after).size !== before.length || !after.every((id) => before.includes(id))) { drop(op, "not a permutation"); break; }
        if (after.join() === before.join()) { drop(op, "no change"); break; }
        if (!claim(`bullets:${parent.id}`)) { drop(op, "duplicate target"); break; }
        changes.push({ ...common(op), kind: "bullets_order", parentId: parent.id, before, after });
        break;
      }
      case "reorder_skills": {
        const g = master.skills.find((s) => s.id === op.targetId);
        if (!g) { drop(op, "unknown skill group"); break; }
        const norm = (a: string[]) => a.map(lower).sort().join("|");
        const byLower = new Map(g.items.map((i) => [lower(i), i]));
        if (op.items.length !== g.items.length || norm(op.items) !== norm(g.items)) { drop(op, "not a permutation"); break; }
        const after = op.items.map((i) => byLower.get(lower(i))!); // keep the user's own spelling
        if (after.join("|") === g.items.join("|")) { drop(op, "no change"); break; }
        if (!claim(`skills:${g.id}`)) { drop(op, "duplicate target"); break; }
        changes.push({ ...common(op), kind: "skills_order", groupId: g.id, before: [...g.items], after });
        break;
      }
      case "add_skills": {
        const g = master.skills.find((s) => s.id === op.targetId);
        if (!g) { drop(op, "unknown skill group"); break; }
        const have = new Set(g.items.map(lower));
        const fresh = op.items.map((i) => i.trim()).filter((i) => i && !have.has(lower(i)));
        // Only skills the resume already evidences elsewhere (bullets, projects…). Never new ones.
        const supported = fresh.filter((i) => corpusHas(corpus, i));
        if (supported.length === 0) { drop(op, fresh.length ? "skills not evidenced in resume" : "already listed"); break; }
        if (!claim(`skills:${g.id}`)) { drop(op, "duplicate target"); break; }
        changes.push({ ...common(op), kind: "skills_add", groupId: g.id, items: supported });
        break;
      }
      case "set_summary": {
        const after = op.text?.trim();
        if (!after || after === master.summary) { drop(op, "empty or unchanged"); break; }
        if (after.length > 600) { drop(op, "too long"); break; }
        const fc = factCheck(after, corpus, keywords);
        if (!fc.ok) { drop(op, `unsupported: ${fc.violations.slice(0, 3).join(", ")}`); break; }
        if (!claim("summary")) { drop(op, "duplicate target"); break; }
        changes.push({ ...common(op), kind: "summary", before: master.summary, after });
        break;
      }
      case "set_headline": {
        const after = op.text?.trim();
        if (!after || after === master.contact.headline) { drop(op, "empty or unchanged"); break; }
        if (after.length > 90) { drop(op, "too long"); break; }
        const fc = factCheck(after, corpus, keywords);
        if (!fc.ok) { drop(op, `unsupported: ${fc.violations.slice(0, 3).join(", ")}`); break; }
        if (!claim("headline")) { drop(op, "duplicate target"); break; }
        changes.push({ ...common(op), kind: "headline", before: master.contact.headline, after });
        break;
      }
    }
  }
  return { changes, dropped };
}
