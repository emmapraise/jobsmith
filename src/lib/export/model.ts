import type { ResumeContent } from "@/lib/resume/schema";

/**
 * One neutral document model feeds BOTH the PDF and DOCX renderers, so the two files always say the same thing.
 * ATS-friendly by construction: single column, real text, standard section names, no tables/images/icons.
 *
 * Regional variants:
 *   uk_eu  A4 "CV": Professional Profile → Work Experience → Education → Skills → Projects → Certifications → Languages;
 *          full month names; location shown.
 *   us     Letter "Resume": Summary → Skills → Experience → Projects → Education → Certifications; abbreviated months;
 *          languages omitted (not customary).
 * Neither includes a photo, date of birth, marital status or nationality (we never collect them).
 */
export type Variant = "uk_eu" | "us";
export const TEMPLATE_VERSION = 1;

export type Block =
  | { t: "section"; title: string }
  | { t: "paragraph"; text: string }
  | { t: "entry"; heading: string; sub: string; dates: string; bullets: string[] }
  | { t: "kv"; label: string; text: string };

export type DocModel = {
  page: "A4" | "LETTER";
  docTitle: string; // "CV" | "Resume"
  name: string;
  headline: string;
  contact: string[]; // each item is one contact detail
  blocks: Block[];
};

const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDate(d: string, variant: Variant): string {
  const m = d.match(/^(\d{4})(?:-(\d{2}))?$/);
  if (!m) return d.trim();
  if (!m[2]) return m[1];
  const name = MONTHS_FULL[Number(m[2]) - 1];
  if (!name) return m[1];
  return `${variant === "us" ? name.slice(0, 3) : name} ${m[1]}`;
}

export function dateRange(start: string, end: string, current: boolean, variant: Variant): string {
  const s = formatDate(start, variant);
  const e = current ? "Present" : formatDate(end, variant);
  return [s, e].filter(Boolean).join(" – ");
}

const join = (parts: (string | undefined | false)[], sep = ", ") => parts.filter((p): p is string => Boolean(p && p.trim())).join(sep);

export function buildDocument(r: ResumeContent, variant: Variant): DocModel {
  const uk = variant === "uk_eu";
  const H = uk
    ? { summary: "Professional Profile", experience: "Work Experience", education: "Education", skills: "Skills", projects: "Projects", certs: "Certifications", languages: "Languages" }
    : { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", projects: "Projects", certs: "Certifications", languages: "Languages" };

  const sections: Record<string, Block[]> = {};

  if (r.summary.trim()) sections.summary = [{ t: "section", title: H.summary }, { t: "paragraph", text: r.summary.trim() }];

  if (r.experience.length) {
    sections.experience = [
      { t: "section", title: H.experience },
      ...r.experience.map((e): Block => ({
        t: "entry",
        heading: join([e.title, e.company], " — "),
        sub: e.location,
        dates: dateRange(e.start, e.end, e.current, variant),
        bullets: e.bullets.map((b) => b.text.trim()).filter(Boolean),
      })),
    ];
  }

  if (r.education.length) {
    sections.education = [
      { t: "section", title: H.education },
      ...r.education.map((e): Block => ({
        t: "entry",
        heading: join([join([e.degree, e.field], " in "), e.institution], " — "),
        sub: e.location,
        dates: dateRange(e.start, e.end, false, variant),
        bullets: e.details.map((b) => b.text.trim()).filter(Boolean),
      })),
    ];
  }

  const skillRows = r.skills.filter((g) => g.items.length);
  if (skillRows.length) {
    sections.skills = [{ t: "section", title: H.skills }, ...skillRows.map((g): Block => ({ t: "kv", label: g.name, text: g.items.join(", ") }))];
  }

  if (r.projects.length) {
    sections.projects = [
      { t: "section", title: H.projects },
      ...r.projects.map((p): Block => ({
        t: "entry",
        heading: join([p.name, p.url], " — "),
        sub: p.technologies.join(", "),
        dates: "",
        bullets: [p.description.trim(), ...p.bullets.map((b) => b.text.trim())].filter(Boolean),
      })),
    ];
  }

  if (r.certifications.length) {
    sections.certs = [
      { t: "section", title: H.certs },
      ...r.certifications.map((c): Block => ({ t: "entry", heading: join([c.name, c.issuer], " — "), sub: "", dates: formatDate(c.date, variant), bullets: [] })),
    ];
  }

  if (uk && r.languages.length) {
    sections.languages = [{ t: "section", title: H.languages }, { t: "kv", label: "", text: r.languages.map((l) => join([l.name, l.level && `(${l.level})`], " ")).join(", ") }];
  }

  const order = uk
    ? ["summary", "experience", "education", "skills", "projects", "certs", "languages"]
    : ["summary", "skills", "experience", "projects", "education", "certs"];

  return {
    page: uk ? "A4" : "LETTER",
    docTitle: uk ? "CV" : "Resume",
    name: r.contact.fullName.trim(),
    headline: r.contact.headline.trim(),
    contact: [r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links.map((l) => join([l.label, l.url], ": "))].map((x) => x.trim()).filter(Boolean),
    blocks: order.flatMap((k) => sections[k] ?? []),
  };
}

export function exportFileName(name: string, variant: Variant, company: string, ext: "pdf" | "docx"): string {
  const clean = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [clean(name) || "Resume", variant === "uk_eu" ? "CV" : "Resume", clean(company)].filter(Boolean).join("-") + `.${ext}`;
}
