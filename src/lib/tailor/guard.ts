import type { ResumeContent } from "@/lib/resume/schema";
import { corpusHas, resumeCorpus } from "./factcheck";

/**
 * Manual edits to a tailored resume may change WORDING (bullet text, summary, headline), remove or reorder
 * bullets, and reorder/remove skills. They may not change facts or introduce new ones: employers, titles, dates,
 * locations, degrees, certifications, languages, contact details and the set of roles/projects must equal the base,
 * no bullet may appear that the base didn't have, and every skill must already be in the group OR evidenced elsewhere
 * in the base resume (the same rule suggestions follow when they add a skill).
 * (To add a genuinely new fact, the user adds it to the MASTER resume, then re-tailors.)
 */
export class StructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructureError";
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function assertStructureUnchanged(base: ResumeContent, next: ResumeContent): void {
  const fail = (what: string): never => {
    throw new StructureError(`${what} can't be changed in a tailored resume. Edit your master resume instead, then re-tailor.`);
  };

  const { headline: _bh, ...baseContact } = base.contact;
  const { headline: _nh, ...nextContact } = next.contact;
  void _bh; void _nh;
  if (!same(baseContact, nextContact)) fail("Contact details");

  if (!same(base.education, next.education)) {
    // details bullets may be edited/removed but not added
    if (base.education.length !== next.education.length) fail("Education");
    base.education.forEach((e, i) => {
      const n = next.education[i];
      if (!same({ ...e, details: [] }, { ...n, details: [] })) fail("Education");
      checkBullets(e.details.map((b) => b.id), n.details.map((b) => b.id), fail);
    });
  }
  if (!same(base.certifications, next.certifications)) fail("Certifications");
  if (!same(base.languages, next.languages)) fail("Languages");

  const idsOf = <T extends { id: string }>(a: T[]) => a.map((x) => x.id).sort().join();
  if (idsOf(base.experience) !== idsOf(next.experience)) fail("The list of roles");
  if (base.experience.map((e) => e.id).join() !== next.experience.map((e) => e.id).join()) fail("The order of roles");
  for (const e of base.experience) {
    const n = next.experience.find((x) => x.id === e.id)!;
    if (!same({ ...e, bullets: [] }, { ...n, bullets: [] })) fail(`Role details (${e.company || e.title})`);
    checkBullets(e.bullets.map((b) => b.id), n.bullets.map((b) => b.id), fail);
  }

  if (idsOf(base.projects) !== idsOf(next.projects)) fail("The list of projects");
  for (const p of base.projects) {
    const n = next.projects.find((x) => x.id === p.id)!;
    if (!same({ ...p, bullets: [] }, { ...n, bullets: [] })) fail(`Project details (${p.name})`);
    checkBullets(p.bullets.map((b) => b.id), n.bullets.map((b) => b.id), fail);
  }

  if (idsOf(base.skills) !== idsOf(next.skills)) fail("Skill groups");
  for (const g of base.skills) {
    const n = next.skills.find((x) => x.id === g.id)!;
    if (g.name !== n.name) fail("Skill group names");
    const known = new Set(g.items.map((s) => s.toLowerCase()));
    const corpus = resumeCorpus(base);
    if (n.items.some((s) => !known.has(s.toLowerCase()) && !corpusHas(corpus, s))) fail("New skills (add them to your master resume first)");
  }
}

function checkBullets(baseIds: string[], nextIds: string[], fail: (w: string) => never) {
  const known = new Set(baseIds);
  if (nextIds.some((id) => !known.has(id))) fail("Adding new bullet points");
  if (new Set(nextIds).size !== nextIds.length) fail("Duplicating bullet points");
}
