import { z } from "zod";

/**
 * Structured resume. This JSON in Postgres is the source of truth; PDF/DOCX are generated from it.
 * Every list item has a stable `id` so tailoring changes and diffs can reference it.
 *
 * Dates are free-form but normalised by the parser to "YYYY-MM" or "YYYY" (or "" when unknown);
 * `end` is "" with `current: true` for ongoing roles.
 */
export const id = () => z.string().min(1);

export const bulletSchema = z.object({ id: id(), text: z.string() });

export const experienceSchema = z.object({
  id: id(),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  start: z.string(),
  end: z.string(),
  current: z.boolean(),
  bullets: z.array(bulletSchema),
});

export const educationSchema = z.object({
  id: id(),
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  location: z.string(),
  start: z.string(),
  end: z.string(),
  details: z.array(bulletSchema),
});

export const skillGroupSchema = z.object({
  id: id(),
  name: z.string(),
  items: z.array(z.string()),
});

export const projectSchema = z.object({
  id: id(),
  name: z.string(),
  url: z.string(),
  description: z.string(),
  technologies: z.array(z.string()),
  bullets: z.array(bulletSchema),
});

export const certificationSchema = z.object({
  id: id(),
  name: z.string(),
  issuer: z.string(),
  date: z.string(),
});

export const languageSchema = z.object({
  id: id(),
  name: z.string(),
  level: z.string(),
});

export const linkSchema = z.object({ id: id(), label: z.string(), url: z.string() });

export const contactSchema = z.object({
  fullName: z.string(),
  headline: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(linkSchema),
});

export const resumeContentSchema = z.object({
  contact: contactSchema,
  summary: z.string(),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  skills: z.array(skillGroupSchema),
  projects: z.array(projectSchema),
  certifications: z.array(certificationSchema),
  languages: z.array(languageSchema),
});

export type Bullet = z.infer<typeof bulletSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ResumeContent = z.infer<typeof resumeContentSchema>;

export const emptyResume = (): ResumeContent => ({
  contact: { fullName: "", headline: "", email: "", phone: "", location: "", links: [] },
  summary: "",
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  languages: [],
});

export const newId = () => crypto.randomUUID();
