import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { ResumeContent } from "@/lib/resume/schema";
import type { ProfileData } from "@/lib/profile/schema";

const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ───────────────────────── Auth.js (database sessions) ───────────────────────── */

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ───────────────────────────────── Profile ───────────────────────────────── */

/** One row per user: goals, salary, countries, work mode, work authorization. */
export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<ProfileData>().notNull(),
  /** True once the user has completed the profile questions at least once. */
  completed: boolean("completed").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ─────────────────────────── Master resume + versions ─────────────────────────── */

export const resumeStatus = pgEnum("resume_status", ["parsing", "ready", "failed"]);
export const resumeVersionSource = pgEnum("resume_version_source", ["upload", "manual_edit", "qa", "restore"]);

/** The master resume (one per user). The content lives in `resume_versions`. */
export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Master resume"),
    status: resumeStatus("status").notNull().default("parsing"),
    currentVersion: integer("current_version").notNull().default(0),
    /** True once the user has reviewed and confirmed the parsed result. */
    reviewed: boolean("reviewed").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("resumes_user_unique").on(t.userId)],
);

export const resumeVersions = pgTable(
  "resume_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resumeId: uuid("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").$type<ResumeContent>().notNull(),
    source: resumeVersionSource("source").notNull(),
    note: text("note"),
    /** Object key of the original upload in jobsmith-uploads, when source = upload. */
    sourceFileKey: text("source_file_key"),
    sourceFileName: text("source_file_name"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("resume_versions_unique").on(t.resumeId, t.version)],
);

export type QAQuestion = {
  id: string;
  question: string;
  why: string; // short reason shown to the user
  kind: "text" | "yes_no" | "choice";
  choices?: string[];
  /** Resume location the answer relates to, e.g. an experience id. */
  targetId?: string | null;
};
export type QAAnswer = { questionId: string; answer: string; skipped: boolean };
export type QAProposedChange = {
  id: string;
  /** Short human description shown with a reason. */
  description: string;
  reason: string;
  /** Applied by the server with a typed, validated patch (see lib/resume/apply-change.ts). */
  patch: unknown;
  decision: "pending" | "accepted" | "rejected";
};

export const qaStatus = pgEnum("qa_status", ["active", "review", "completed", "abandoned"]);

export const qaSessions = pgTable(
  "qa_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    resumeId: uuid("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    baseVersion: integer("base_version").notNull(),
    questions: jsonb("questions").$type<QAQuestion[]>().notNull(),
    answers: jsonb("answers").$type<QAAnswer[]>().notNull().default([]),
    proposedChanges: jsonb("proposed_changes").$type<QAProposedChange[]>().notNull().default([]),
    status: qaStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("qa_sessions_user_idx").on(t.userId, t.status)],
);

/** Cached role insights, keyed by resume version + profile hash. */
export const roleInsights = pgTable(
  "role_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    resumeId: uuid("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    resumeVersion: integer("resume_version").notNull(),
    inputHash: text("input_hash").notNull(),
    data: jsonb("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("role_insights_unique").on(t.resumeId, t.inputHash)],
);

/* ─────────────────────────── Jobs + tailoring (M2) ─────────────────────────── */

export const jobSource = pgEnum("job_source", ["pasted_text", "pasted_url", "search"]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    source: jobSource("source").notNull(),
    url: text("url"),
    title: text("title").notNull().default(""),
    company: text("company").notNull().default(""),
    location: text("location").notNull().default(""),
    description: text("description").notNull().default(""),
    /** Structured requirements extracted by the LLM (M2). */
    parsed: jsonb("parsed"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_user_idx").on(t.userId)],
);

export const tailoredResumes = pgTable(
  "tailored_resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    masterResumeId: uuid("master_resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    currentVersion: integer("current_version").notNull().default(0),
    /** Export template family: "uk_eu" (A4 CV) or "us" (Letter resume). */
    variant: text("variant").notNull().default("uk_eu"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tailored_user_idx").on(t.userId)],
);

export const tailoredResumeVersions = pgTable(
  "tailored_resume_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tailoredResumeId: uuid("tailored_resume_id").notNull().references(() => tailoredResumes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** Master version this was derived from; the truthfulness guard checks against it. */
    baseMasterVersion: integer("base_master_version").notNull(),
    content: jsonb("content").$type<ResumeContent>().notNull(),
    /** Per-change list with reasons and accept/reject decisions (M2). */
    changes: jsonb("changes").notNull().default([]),
    /** Gaps: things the job asks for that are not in the profile. Become questions, never invented. */
    gaps: jsonb("gaps").notNull().default([]),
    matchScore: integer("match_score"),
    /** Requirement coverage and keyword stats (see tailor/types.ts Analysis). */
    analysis: jsonb("analysis").notNull().default({}),
    /** Set when exported or linked to an application. A frozen version is immutable: edits create a new version. */
    frozenAt: timestamp("frozen_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tailored_versions_unique").on(t.tailoredResumeId, t.version)],
);

/* ───────────────────────────── Tracker + prep (M3/M4) ───────────────────────────── */

export const applicationStatus = pgEnum("application_status", [
  "saved",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
]);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    /** The exact resume version used for this application. */
    tailoredResumeVersionId: uuid("tailored_resume_version_id").references(() => tailoredResumeVersions.id, {
      onDelete: "set null",
    }),
    /** Alternatively, the MASTER resume version used (when no tailored resume was made for this job). */
    resumeVersionId: uuid("resume_version_id").references(() => resumeVersions.id, { onDelete: "set null" }),
    status: applicationStatus("status").notNull().default("saved"),
    /** When the stage last changed; drives "any news?" prompts. */
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** "No news yet, ask me again later". */
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true, mode: "date" }),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true, mode: "date" }),
    lastStatusPromptAt: timestamp("last_status_prompt_at", { withTimezone: true, mode: "date" }),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("applications_user_status_idx").on(t.userId, t.status), uniqueIndex("applications_user_job_unique").on(t.userId, t.jobId)],
);

/** Opt-in email reminders (digest of follow-ups and "any news?" prompts). Off by default. */
export const notificationPrefs = pgTable("notification_prefs", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  emailReminders: boolean("email_reminders").notNull().default(false),
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true, mode: "date" }),
  updatedAt: updatedAt(),
});

export const applicationEvents = pgTable("application_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  fromStatus: applicationStatus("from_status"),
  toStatus: applicationStatus("to_status").notNull(),
  at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const interviewPreps = pgTable("interview_preps", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
  /** Questions, practice attempts + feedback, company brief (M4). */
  data: jsonb("data").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("interview_preps_user_job_unique").on(t.userId, t.jobId)]);

/* ───────────────────────────── AI provider settings ───────────────────────────── */

/** Per-user choice of LLM provider/model, plus optional user-supplied API keys (AES-GCM encrypted). */
export const userAiSettings = pgTable("user_ai_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider"),
  model: text("model"),
  /** { anthropic?: "v1.…", openai?: "v1.…", google?: "v1.…" } encrypted blobs. Never sent to the client. */
  encryptedKeys: jsonb("encrypted_keys").$type<Record<string, string>>().notNull().default({}),
  updatedAt: updatedAt(),
});

/* ───────────────────────────────── Rate limiting ───────────────────────────────── */

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
