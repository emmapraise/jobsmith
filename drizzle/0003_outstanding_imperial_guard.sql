CREATE TABLE "notification_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_reminders" boolean DEFAULT false NOT NULL,
	"last_digest_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "resume_version_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_user_job_unique" ON "applications" USING btree ("user_id","job_id");