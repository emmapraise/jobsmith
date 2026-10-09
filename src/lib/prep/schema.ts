import { z } from "zod";

/** Stored in interview_preps.data. */
export const CATEGORIES = ["technical", "behavioural", "system_design", "gap"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  system_design: "System design",
  gap: "Gaps in your resume",
};

export const CATEGORY_HINT: Record<Category, string> = {
  technical: "Questions on the skills and tools this role asks for.",
  behavioural: "“Tell me about a time…” questions. Answer with a real story, using STAR.",
  system_design: "Design a system out loud: scope, architecture, trade-offs.",
  gap: "Things the job asks for that your resume doesn’t show. Expect to be probed on them.",
};

export const questionSchema = z.object({
  id: z.string(),
  category: z.enum(CATEGORIES),
  question: z.string(),
  /** What the interviewer is really probing. */
  why: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  /** What a strong answer covers (hidden while practising). */
  keyPoints: z.array(z.string()),
  followUps: z.array(z.string()),
  /** Ids of experience/project entries in YOUR resume that you could draw on. Validated against the resume. */
  resumeRefs: z.array(z.string()),
  requirementIds: z.array(z.string()),
});
export type PrepQuestion = z.infer<typeof questionSchema>;

export const briefSchema = z.object({
  /** Two or three sentences, only from the posting / page the user supplied. */
  summary: z.string(),
  whatTheyDo: z.array(z.string()),
  techAndTools: z.array(z.string()),
  cultureSignals: z.array(z.string()),
  /** Things worth settling with the recruiter early (visa, salary, work mode…), from the user's own profile. */
  clarifyEarly: z.array(z.string()),
  researchChecklist: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
  /** What the brief was built from, so nothing looks more authoritative than it is. */
  sources: z.array(z.enum(["job_posting", "company_page"])),
});
export type CompanyBrief = z.infer<typeof briefSchema>;

export const feedbackSchema = z.object({
  /** Rubric scores 1-5 keyed by dimension (see RUBRIC). */
  scores: z.record(z.string(), z.number().min(1).max(5)),
  overall: z.number().min(1).max(5),
  verdict: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  /** A structure for a stronger answer. Never invented experience. */
  suggestedOutline: z.array(z.string()),
  /** Real things from your resume you could add. Checked against it. */
  resumeTips: z.array(z.string()),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const attemptSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  answer: z.string(),
  at: z.string(),
  seconds: z.number().nullable().default(null),
  feedback: feedbackSchema.nullable(),
});
export type Attempt = z.infer<typeof attemptSchema>;

export const prepDataSchema = z.object({
  version: z.literal(1),
  questions: z.array(questionSchema),
  brief: briefSchema,
  attempts: z.array(attemptSchema),
  generatedAt: z.string(),
  /** Which resume the prep was grounded on, and which job text. */
  basis: z.object({ resume: z.string(), companyUrl: z.string().nullable() }),
});
export type PrepData = z.infer<typeof prepDataSchema>;

/** Rubric per category: what feedback scores, 1-5 each. */
export const RUBRIC: Record<Category, { key: string; label: string }[]> = {
  technical: [
    { key: "accuracy", label: "Technical accuracy" },
    { key: "depth", label: "Depth" },
    { key: "tradeoffs", label: "Trade-offs" },
    { key: "clarity", label: "Clarity" },
  ],
  behavioural: [
    { key: "situation", label: "Situation & task" },
    { key: "action", label: "Your actions" },
    { key: "result", label: "Result & impact" },
    { key: "reflection", label: "Reflection" },
    { key: "concise", label: "Concision" },
  ],
  system_design: [
    { key: "requirements", label: "Requirements & scope" },
    { key: "architecture", label: "Architecture" },
    { key: "scaling", label: "Scaling & bottlenecks" },
    { key: "tradeoffs", label: "Trade-offs" },
    { key: "communication", label: "Communication" },
  ],
  gap: [
    { key: "honesty", label: "Honesty" },
    { key: "transferable", label: "Transferable evidence" },
    { key: "plan", label: "Plan to close the gap" },
    { key: "confidence", label: "Confidence" },
  ],
};

export const MAX_ANSWER_CHARS = 4000;
