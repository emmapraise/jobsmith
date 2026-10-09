import "server-only";
import { z } from "zod";
import { generateStructured, untrusted, UNTRUSTED_NOTICE, type LlmConfig } from "@/lib/llm";
import { newId, resumeContentSchema, type ResumeContent } from "./schema";

/**
 * LLM-facing parse schema: no ids (we assign them), every key required, nullable instead of optional.
 * Mapped to ResumeContent by `toResumeContent`.
 */
const bullets = z.array(z.string());

export const parsedResumeSchema = z.object({
  contact: z.object({
    fullName: z.string(),
    headline: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  summary: z.string(),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      current: z.boolean(),
      bullets,
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      details: bullets,
    }),
  ),
  skills: z.array(z.object({ name: z.string(), items: z.array(z.string()) })),
  projects: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      description: z.string(),
      technologies: z.array(z.string()),
      bullets,
    }),
  ),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string(), date: z.string() })),
  languages: z.array(z.object({ name: z.string(), level: z.string() })),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

const SYSTEM = `You convert resume text into structured JSON. You are a faithful transcriber, not a writer.

Rules:
- Use ONLY information present in the resume text. Never invent, infer, embellish or "improve" anything.
- If a field is not present, use an empty string (or empty array / false). Do not guess.
- Keep each bullet's wording as written. Only repair obvious extraction artefacts (words split across lines, stray page numbers, bullet glyphs).
- Dates: normalise to "YYYY-MM" when month and year are known, "YYYY" when only the year is known, otherwise "". For a role that is ongoing ("Present", "Current", "Now"), set end to "" and current to true.
- Order experience and education most recent first, as the resume presents them.
- Skills: keep the resume's own groupings (e.g. "Languages", "Cloud"). If the resume lists skills without groups, use one group named "Skills".
- contact.headline is the professional title/tagline under the name if one exists, otherwise "".
- Put links (LinkedIn, GitHub, portfolio) in contact.links with a short label.
- If a section does not exist in the resume, return an empty array for it.
${UNTRUSTED_NOTICE}`;

export async function parseResumeText(text: string, config: LlmConfig): Promise<ResumeContent> {
  const parsed = await generateStructured(parsedResumeSchema, {
    config,
    system: SYSTEM,
    prompt: `Convert this resume to the structured format.\n\n${untrusted("resume", text)}`,
    maxOutputTokens: 12_000,
    temperature: 0,
  });
  return toResumeContent(parsed);
}

const b = (text: string) => ({ id: newId(), text: text.trim() });

export function toResumeContent(p: ParsedResume): ResumeContent {
  const content: ResumeContent = {
    contact: { ...p.contact, links: p.contact.links.map((l) => ({ id: newId(), ...l })) },
    summary: p.summary.trim(),
    experience: p.experience.map((e) => ({
      id: newId(),
      ...e,
      end: e.current ? "" : e.end,
      bullets: e.bullets.filter((x) => x.trim()).map(b),
    })),
    education: p.education.map((e) => ({ id: newId(), ...e, details: e.details.filter((x) => x.trim()).map(b) })),
    skills: p.skills
      .map((s) => ({ id: newId(), name: s.name.trim() || "Skills", items: dedupe(s.items) }))
      .filter((s) => s.items.length),
    projects: p.projects.map((x) => ({ id: newId(), ...x, bullets: x.bullets.filter((y) => y.trim()).map(b) })),
    certifications: p.certifications.map((c) => ({ id: newId(), ...c })),
    languages: p.languages.map((l) => ({ id: newId(), ...l })),
  };
  return resumeContentSchema.parse(content);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}
