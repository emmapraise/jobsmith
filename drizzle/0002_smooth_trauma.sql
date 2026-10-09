ALTER TABLE "tailored_resume_versions" ADD COLUMN "analysis" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tailored_resume_versions" ADD COLUMN "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tailored_resumes" ADD COLUMN "variant" text DEFAULT 'uk_eu' NOT NULL;