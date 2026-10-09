# Jobsmith

Free web app that helps software engineers, AI engineers and other tech people land jobs: upload one master resume,
see the roles you fit, tailor the resume to each job without inventing anything, track applications, prep for interviews.

Project rules, stack decisions and conventions live in **[CLAUDE.md](./CLAUDE.md)**. The milestone plan is in [docs/PLAN.md](./docs/PLAN.md).

## Run locally

```bash
createdb jobsmith && createdb jobsmith_test     # Postgres 15+
cp .env.example .env.local                      # then fill AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate
npm run dev                                     # http://localhost:3000
```

- **Sign-in without email/Google configured:** request a magic link on `/sign-in`; the link is printed in the server console (dev only).
- **AI features** (resume parsing, Q&A, role insights) need `LLM_PROVIDER`, `LLM_MODEL` and that provider's API key in `.env.local`.
  Without one, those screens show a clear "AI isn't set up yet" state.
- **See every screen without an LLM key:** sign in once, then `npm run db:seed-dev -- you@example.com`.
- **Storage:** `STORAGE_DRIVER=local` stores files in `.data/storage` (dev only). Production must use `r2` (see `.env.example`).

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` · `lint` · `test` | Quality gates (tests use the `jobsmith_test` database) |
| `npm run db:generate` · `db:migrate` | Drizzle migrations |
| `npm run llm:check` | Run the real parser against your configured provider (`TAILOR=1` / `FULL=1` for tailoring / Q&A) |
| `npm run tailor:e2e` | Full tailoring + PDF/DOCX export for the dev user (`NOACCEPT=1` leaves suggestions pending) |

## Reminders

Tracker reminders show in the app (badge, dashboard, tracker). Email digests are opt-in per user (Settings → Reminders). To send them, set
`CRON_SECRET` and call the endpoint once a day from any scheduler:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/reminders
```
