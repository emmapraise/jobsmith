import "server-only";
import { generateStructured, untrusted, UNTRUSTED_NOTICE, type LlmConfig } from "@/lib/llm";
import { llmJobSchema, parsedJobSchema, type ParsedJob } from "./schema";

const SYSTEM = `You extract structured data from a job posting. You are a faithful transcriber.
- Use ONLY what the posting says. If something isn't stated, use "" or "unknown". Never guess a company, salary, or visa policy.
- requirements: the distinct skills/experience/education the employer asks for, at most 15, most important first. importance "must" for required/essential items, "nice" for preferred/bonus items. Each is a short phrase (under 14 words), e.g. "3+ years building REST APIs in Node.js".
- keywords: up to 25 exact terms from the posting that an applicant-tracking system would match: technologies, tools, methods, domain terms, role titles. Copy their spelling exactly as written. No generic words ("team", "passion").
- responsibilities: up to 8 short phrases.
- visaSponsorship: "offered" only if the posting says sponsorship/relocation help is offered, "not_offered" only if it says it is NOT, else "unknown".
- summary: two sentences max describing the role.
- isJobPosting: false if the text is not a job advert (e.g. a login page, error page, article).
${UNTRUSTED_NOTICE}`;

export class NotAJobError extends Error {
  constructor() {
    super("That doesn't look like a job posting. Paste the job description text instead.");
    this.name = "NotAJobError";
  }
}

export async function parseJob(text: string, config: LlmConfig, hints: { title?: string; company?: string; location?: string } = {}): Promise<ParsedJob> {
  const out = await generateStructured(llmJobSchema, {
    config,
    system: SYSTEM,
    prompt: `Extract the job details.\n\n${untrusted("job-posting", text)}`,
    maxOutputTokens: 4000,
    temperature: 0,
  });
  if (!out.isJobPosting || out.requirements.length === 0) throw new NotAJobError();

  const seen = new Set<string>();
  const keywords = out.keywords.map((k) => k.trim()).filter((k) => k && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase())).slice(0, 25);
  return parsedJobSchema.parse({
    title: out.title.trim() || hints.title || "",
    company: out.company.trim() || hints.company || "",
    location: out.location.trim() || hints.location || "",
    workMode: out.workMode,
    seniority: out.seniority,
    visaSponsorship: out.visaSponsorship,
    summary: out.summary.trim(),
    keywords,
    responsibilities: out.responsibilities.slice(0, 8),
    requirements: out.requirements.slice(0, 15).map((r, i) => ({ id: `r${i + 1}`, text: r.text.trim(), importance: r.importance, category: r.category })),
  });
}
