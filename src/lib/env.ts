import "server-only";
import { z } from "zod";

const blank = (v: unknown) => (v === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(blank, s.optional());

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(16),
    AUTH_URL: opt(z.string().url()),
    AUTH_GOOGLE_ID: opt(z.string()),
    AUTH_GOOGLE_SECRET: opt(z.string()),
    AUTH_RESEND_KEY: opt(z.string()),
    EMAIL_FROM: z.preprocess(blank, z.string().default("Jobsmith <login@jobsmith.local>")),

    // Encrypts users' own API keys at rest. Falls back to AUTH_SECRET.
    APP_ENCRYPTION_KEY: opt(z.string().min(16)),

    STORAGE_DRIVER: z.preprocess(blank, z.enum(["r2", "local"]).default("local")),
    R2_ACCOUNT_ID: opt(z.string()),
    R2_ACCESS_KEY_ID: opt(z.string()),
    R2_SECRET_ACCESS_KEY: opt(z.string()),
    R2_UPLOADS_BUCKET: z.preprocess(blank, z.string().default("jobsmith-uploads")),
    R2_EXPORTS_BUCKET: z.preprocess(blank, z.string().default("jobsmith-exports")),
    STORAGE_SIGNING_SECRET: opt(z.string().min(16)),

    LLM_PROVIDER: z.preprocess(blank, z.enum(["anthropic", "openai", "google"]).default("anthropic")),
    LLM_MODEL: opt(z.string()),
    ANTHROPIC_API_KEY: opt(z.string()),
    OPENAI_API_KEY: opt(z.string()),
    GOOGLE_GENERATIVE_AI_API_KEY: opt(z.string()),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === "production" && e.STORAGE_DRIVER !== "r2") {
      ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "production requires STORAGE_DRIVER=r2" });
    }
    if (e.STORAGE_DRIVER === "r2") {
      for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const) {
        if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: `${k} is required when STORAGE_DRIVER=r2` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Parsed lazily so `next build` works without secrets. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment: ${problems}`);
    }
    cached = parsed.data;
  }
  return cached;
}
