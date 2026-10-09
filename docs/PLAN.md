# Plan — Milestones 0 and 1

## Defaults I chose (change any of these and I'll adapt)
- Postgres: local Homebrew (`jobsmith`, `jobsmith_test`). No Docker needed.
- Next.js 16.4 with Cache Components **off** (see CLAUDE.md).
- No credentials exist yet for R2, Resend, Google or an LLM. The code supports all of them through env vars; locally
  the storage uses a filesystem driver and sign-in prints the magic link to the console. Parsing/Q&A/insights need an LLM key.
- Frontend-design skill is not installed, so the design is hand-built from tokens: warm paper background, ink text,
  deep teal brand, amber for "changed by AI", serif headings (Fraunces) over a clean sans (Geist).

## M0 Foundation
1. Config: `next.config.ts` (security headers, cache components off), `.env.example`, `src/lib/env.ts`, scripts.
2. DB: Drizzle schema — Auth.js tables; `profiles`; `resumes` + `resume_versions`; `qa_sessions`; `jobs`;
   `tailored_resumes` + `tailored_resume_versions`; `applications`; `interview_preps`; `rate_limits`. Migrations.
3. Auth: Auth.js v5, Google + Resend, DB sessions, `requireUser()`, `proxy.ts` optimistic redirect.
4. Storage: `ObjectStorage` interface, R2 driver, local dev driver, key helpers, signed-URL route for local.
5. LLM: provider-agnostic `generateStructured`/`generateText`, Zod, retries, "not configured" error type.
6. Safety utils: rate limiter, redacting logger.
7. Design tokens in `globals.css`, app shell (sidebar desktop / bottom bar + sheet mobile), landing, sign-in.
8. Tests (vitest), typecheck, lint, commit.

## M1 Master resume
1. Upload (`POST /api/resumes/upload`): auth → rate limit → validate (ext, MIME, magic bytes, 5 MB) → store original → extract text
   (unpdf / mammoth, in memory only) → LLM parse to `ResumeContent` (Zod) → save version 1.
2. Review & correct screen: structured editor for every section, per-section save creating a new version.
3. Guided Q&A: LLM generates ≤8 short questions from the resume (stale dates, missing metrics, gaps); one at a time with progress;
   answers are merged into the resume as proposed changes the user confirms (no invention — only user-supplied facts).
4. Profile questions: experience level/years, goals, target salary + currency, preferred countries, work mode, work authorization & visa sponsorship.
5. Role insights: LLM returns best-fit and adjacent roles with fit rationale, evidence from the resume, and skill gaps; cached per resume version + profile hash.
6. Account deletion (DB + both buckets) in settings.
7. Tests, typecheck, lint, visual check of key screens, commit.
