import { z } from "zod";

/** LLM-facing job parse (no ids; every key required). */
export const llmJobSchema = z.object({
  isJobPosting: z.boolean(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  workMode: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  seniority: z.enum(["intern", "junior", "mid", "senior", "staff", "principal", "manager", "director", "unknown"]),
  visaSponsorship: z.enum(["offered", "not_offered", "unknown"]),
  summary: z.string(),
  requirements: z.array(
    z.object({
      text: z.string(),
      importance: z.enum(["must", "nice"]),
      category: z.enum(["skill", "experience", "education", "domain", "soft", "other"]),
    }),
  ),
  keywords: z.array(z.string()),
  responsibilities: z.array(z.string()),
  /** Questions the applicant must answer on the application ("Why do you want to work here?"), verbatim. */
  applicationQuestions: z.array(z.string()),
});

/** Stored form (jobs.parsed): requirements get stable ids r1..rn. */
export const parsedJobSchema = llmJobSchema.omit({ requirements: true, isJobPosting: true, applicationQuestions: true }).extend({
  applicationQuestions: z.array(z.string()).optional(),
  /** Drafted answers (grounded in the resume + profile). The user edits and copies them; nothing is sent anywhere. */
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  requirements: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      importance: z.enum(["must", "nice"]),
      category: z.enum(["skill", "experience", "education", "domain", "soft", "other"]),
    }),
  ),
});

export type ParsedJob = z.infer<typeof parsedJobSchema>;
export type Requirement = ParsedJob["requirements"][number];
