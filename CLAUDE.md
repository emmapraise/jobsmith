# Jobsmith — project guide for Claude

Jobsmith is a **free** web app that helps software engineers, AI engineers and other tech people land jobs.
The first user is the owner (Nigeria-based, targeting UK, Europe and remote roles). Build for real use, not as a demo.

Flow: upload one **master resume** → parse to structured JSON → short Q&A + profile questions → role insights →
paste a job link/description → tailored resume (with per-change reasons, accept/reject) → preview/edit → PDF/DOCX →
job tracker → interview prep → job search.

> **Next.js here is NOT the Next.js in your training data.** Read `node_modules/next/dist/docs/` before using an API
> you are unsure of (see `AGENTS.md`). `middleware` is now `proxy.ts`; `params`/`searchParams`/`cookies()`/`headers()` are async.

## Milestones (build in order; do not start the next until told)
0. Foundation — scaffold, auth, DB schema, storage + LLM interfaces, env example, app shell, design tokens, this file. **DONE**
1. Master resume — upload, parse, review/correct, guided Q&A, profile questions, role insights. **DONE (see status)**
2. Tailoring — job link/paste ingestion, tailored resume + change list + match score, side-by-side editor, PDF/DOCX export. **DONE**
3. Job tracker — Saved/Applied/Screening/Interview/Offer/Rejected, resume version per card, status prompts, reminders. **DONE**
4. Interview prep — technical/behavioural/system-design questions, practice mode with feedback, company brief. **DONE**
5. Job search — job APIs/aggregators, remote boards, pasted links; filters (country, remote/relocation, visa); fit score; one-click tailor/save. **Never scrape sites that forbid it.**

## Stack (decided — don't re-litigate)
- Next.js (App Router) + TypeScript (strict), Tailwind v4, shadcn/ui (base-nova / Base UI primitives), lucide icons.
- Postgres + Drizzle ORM (`postgres` driver). Migrations via `drizzle-kit` in `drizzle/`.
- Auth.js v5 (`next-auth@beta`): Google + email magic link via Resend. **Database sessions** (required by the email provider).
  With no `AUTH_RESEND_KEY` in non-production, the magic link is printed to the server console instead of emailed.
- Storage: Cloudflare R2 via the S3 API behind `src/lib/storage` (interface `ObjectStorage`).
  Buckets `jobsmith-uploads` (original resumes) and `jobsmith-exports` (PDF/DOCX, cached by content hash). Both private.
  Signed URLs only, short-lived. Keys: `users/{userId}/resumes/{resumeId}/...`.
  `STORAGE_DRIVER=local` is a dev-only filesystem driver (`.data/storage`, HMAC-signed URLs); production must use `r2`.
- LLM: Vercel AI SDK behind `src/lib/llm`. Provider/model/key resolve per user (`llm/user-config.ts`): the user's choice and
  own encrypted key from Settings → AI provider, else `LLM_PROVIDER`/`LLM_MODEL` + env keys. Every LLM call takes an explicit
  `LlmConfig`. Models must support structured output (`gpt-4` does not; `gpt-4.1` verified). **No provider-specific code outside `src/lib/llm`.** All structured outputs use Zod schemas.
- Export (M2): PDF + DOCX, ATS-friendly, regional variants (UK/EU CV vs US resume).
- Pricing: free. **No payments code.**
- Theme: light/dark/system via a `.dark` class on `<html>` (tokens in `globals.css`, toggle in `components/theme-toggle.tsx`, no-flash script in `layout.tsx`).
- Next config: `cacheComponents` and `partialPrefetching` are deliberately **off** — the app is fully authenticated and
  dynamic, so classic dynamic rendering avoids wrapping every session read in Suspense.

## Non-negotiable rules
1. **Truthfulness guard.** A tailored resume may only use facts in the master profile. Anything the job asks for that is
   not in the profile is a **gap** and becomes a question to the user — never invented.
2. **Every AI change is shown with a short reason**, and the user can accept or reject each one individually.
3. **Privacy.** TLS everywhere (HSTS header set), **never log resume text** (use `src/lib/log.ts`, which refuses to log
   free text fields; never `console.log` resume/profile/LLM payloads), never use user data for training, support full
   account deletion = DB rows (cascade) + every object under `users/{userId}/` in **both** buckets.
4. **Upload validation on the server**: PDF and DOCX only (check extension, MIME and magic bytes), 5 MB cap.
5. **Rate limit** AI and upload endpoints (`src/lib/rate-limit.ts`, Postgres fixed-window).
6. **Resume content is structured JSON in Postgres = source of truth.** Files are generated from it. Never store a
   generated file as the only copy of an edit.

## Layout
```
src/app/(marketing)/        public landing
src/app/(auth)/             sign-in, verify
src/app/(app)/              authenticated shell: dashboard, resume, profile, roles, settings
src/app/api/                route handlers (auth, upload, files)
src/lib/db/                 drizzle client + schema.ts
src/lib/auth/               auth.ts config, getCurrentUser() DAL
src/lib/storage/            ObjectStorage interface, r2 + local drivers, keys
src/lib/llm/                provider-agnostic interface (generateObject/generateText) — the ONLY place importing @ai-sdk/*
src/lib/resume/             Zod schema for structured resume, text extraction, parsing, Q&A generation, role insights
src/lib/jobs/               SSRF-safe URL fetch (net.ts), robots.txt, HTML/JSON-LD extraction, ingest (link or paste), LLM job parse
src/lib/tailor/             typed changes (changes.ts), fact check (factcheck.ts), validation (materialize.ts), LLM verifier (verify.ts),
                            engine (engine.ts), score, gap questions, manual-edit guard (guard.ts), repo (versions; frozen = immutable)
src/lib/prep/               interview prep: schema, pure validation (build.ts), LLM engine (engine.ts), context (which resume), repo
src/lib/tracker/            stage rules (stages.ts), what's due (due.ts), repo (applications + events), opt-in email digest (digest.ts, reminders.ts)
src/lib/export/             one neutral doc model (model.ts) → PDF (pdfkit) and DOCX (docx); UK/EU CV vs US resume; cached by content hash
src/lib/profile/            profile Zod schema
src/lib/rate-limit.ts, log.ts, env.ts
src/components/ui/          shadcn primitives
src/components/             app components
tests/                      vitest
drizzle/                    SQL migrations
```

## How tailoring stays truthful (M2) — defence in depth, don't weaken any layer
1. Prompt forbids invention; the model may only propose typed ops (reword bullet, reorder bullets/skills, add a skill ALREADY
   evidenced elsewhere in the resume, summary, headline). It cannot add roles, bullets, dates, employers or degrees.
2. `materialize.ts` validates every op against the master and runs `factCheck`: numbers must exist in the master, job keywords
   (including single words inside multi-word keywords) must be evidenced, proper nouns/tech terms must be evidenced. Whole-token
   matching with light stemming ("Java" ≠ "JavaScript"; "mentoring" ≈ "mentored").
3. `verify.ts`: an independent strict LLM reviewer rejects soft embellishment ("improving…", "maintained", "high-throughput"). Fails closed.
4. One bounded repair pass re-asks for faithful replacements for rejected edits; replacements go through layers 2–3 again.
5. Gaps never become content: they become questions; an answer becomes a proposed edit to the MASTER resume the user must accept.
6. Manual edits pass `guard.ts`: wording may change; facts (employers, titles, dates, new bullets, new skills) may not.
7. Every change is materialised (before/after), shown with a reason and a diff, accepted/rejected individually, stale-detected if the
   user edits the same text, and reversible. Exporting freezes a version; later edits create a new version.
Outbound fetches of user-supplied URLs go only through `jobs/net.ts` (SSRF guard, size/time caps, robots.txt, refuses LinkedIn/Indeed/
Glassdoor). A link that can't be read always falls back to the paste box.

## Tracker rules (M3)
- An application PINS the exact resume version used: tracking a tailored resume freezes its current version (`applications.tailored_resume_version_id`)
  or records the master version (`resume_version_id`). Later edits create new versions; the application keeps the one that was sent, and the detail
  page downloads exactly that version. Never repoint an application's version automatically.
- One application per job per user (unique index). Moving stage writes an event, sets/clears the follow-up date (`stages.ts`), and resets prompts.
- "Needs attention" = follow-up date arrived, or no stage change for N days (saved 7, applied 14, screening 10, interview 7), unless snoozed 7 days.
  Offers/rejections are closed: no reminders. The same `dueApps()` feeds the tracker, dashboard, nav badge and email digest.
- Email reminders are opt-in (Settings), at most one digest a day, sent by `/api/cron/reminders` (needs `CRON_SECRET` + any daily scheduler).
  Digests contain only job titles/companies the user typed, never resume content.
- Downloads must start from `lib/download.ts` (hidden link); never `window.location = downloadUrl` (breaks in Safari).

## Interview prep rules (M4)
- One prep pack per user+job (unique index). Grounded in the resume the user actually applied with (`prep/context.ts`: pinned application version,
  else latest tailored, else master). Questions come from 3 parallel LLM calls (technical+system design / behavioural+gaps / brief) and are
  validated in `build.ts`: dedupe, caps, guidance required, `resumeRefs` must be real experience/project ids.
- The company brief is built ONLY from the job posting and an optional company page the user supplies (fetched via `jobs/net.ts`). The model has no
  web access: never let it state company facts from memory. Unknowns become a research checklist / questions to ask. `brief.sources` is shown in the UI.
- "Settle these early" is deterministic (`clarifyEarly`): derived from the user's profile (visa, work mode, salary) and what the posting says.
- Feedback scores only the category's RUBRIC dimensions (1-5), the overall is computed in code, and "resume tips" must pass `factCheck` against the
  resume. Feedback must never invent the user's experience; outlines use [placeholders].
- Practice answers/feedback live in `interview_preps.data` (private; deleted with the account). Drafts are in localStorage under `jobsmith:draft:*`
  and are cleared on sign-out. `/prep` pages are on the offline allowlist (read-only); practising needs a connection.

## PWA / offline rules (don't weaken)
- Installable via `app/manifest.ts` + generated icons (`/pwa-icon/[size]`). `public/sw.js` is plain JS (no build) and only registers in production.
- Offline = READ ONLY. The worker saves only the allowlisted page paths in `PAGE_RE` (dashboard, resume, roles, tailor, tracker + detail pages) after a
  successful, non-redirected HTML load. Never add: settings, profile, editors, auth, `/api/*`, downloads/signed URLs, or any non-GET request.
- Saved pages contain private data (resume text, notes). They MUST be cleared on sign-out and account deletion: use `SignOutForm` / `clearOfflineData()`
  (`src/lib/pwa.ts`). A page that redirects (session gone) is removed from the cache. Max 40 pages kept.
- Pre-saving is gentle on mobile data: at most every 6 h, skipped on Save-Data/2G, ~15 pages; each page's scripts are fetched right after the page.
- Run `npm run pwa:e2e` (real Chrome) after touching the worker, the shell, or sign-out; `tests/unit/sw.test.ts` covers the worker logic.

## Conventions
- Server-only modules start with `import "server-only"`. Authorize in every server action / route handler via
  `requireUser()` close to the data; always scope queries by `userId`.
- Zod schemas are the contract: LLM output → Zod → DB JSON. Validate again when reading JSON from the DB at boundaries.
- Resume item ids are stable (`crypto.randomUUID()`), so diffs/changes can reference them.
- Env access only through `src/lib/env.ts` (validated). `.env.example` documents every variable.
- Design tokens live **once** in `src/app/globals.css` (colour, type, spacing, radius, shadow). Components use token
  utilities (`bg-surface`, `text-ink-muted`, `text-brand` …), never hard-coded hex values.
- Every screen: loading (`loading.tsx` / skeleton), empty and error states. Mobile-first, keyboard accessible, WCAG AA.
- Commands: `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:generate`, `npm run db:migrate`.
  Run typecheck + lint + tests before finishing a milestone; commit with a clear message.

## Local setup
`createdb jobsmith && createdb jobsmith_test`, copy `.env.example` → `.env.local`, `npm run db:migrate`, `npm run dev`.
Without LLM keys the app runs but parsing/insights show a clear "AI not configured" error state.

## Status log
- M0: complete (2026-10-09).
- M4: complete (2026-10-09). Prep packs, practice with scored feedback, company brief; verified in real Chrome against a real model.
- PWA: installable + offline reading (2026-10-09). Production URL: https://getjobsmith.vercel.app
- M3: complete (2026-10-09). Board + detail + prompts + opt-in email digest; verified in the browser and with DB integration tests.
- M2: complete (2026-10-09). Verified against a real OpenAI key (gpt-4.1); PDF/DOCX text round-trips in tests.
- M1: complete (2026-10-09). Stubbed or unverified items are listed in the end-of-milestone summary; update this line as they land.
