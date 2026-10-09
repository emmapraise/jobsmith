# Deployment

Stack: **Vercel** (app) · **Neon** (Postgres) · **Cloudflare R2** (files) · **Resend** (email) · **GitHub** (code + CI).

## Environments

| | Development | Preview (PRs / branches) | Production |
|---|---|---|---|
| Where | your laptop | Vercel Preview | Vercel Production |
| Database | local Postgres `jobsmith` | Neon branch `preview` | Neon branch `main` |
| Files | `STORAGE_DRIVER=local` (`.data/`) | R2 (use separate buckets or a `preview/` prefix, see below) | R2 `jobsmith-uploads`, `jobsmith-exports` |
| Email | magic link printed in terminal | Resend | Resend |
| Secrets | `.env.local` (git-ignored) | Vercel env (Preview) | Vercel env (Production) |
| Config check | `npm run env:check -- .env.local` | | `npm run env:check -- .env.production --prod` |

Rules: **never reuse `AUTH_SECRET` across environments**, never commit `.env*` files except `*.example`, and give Preview its own database so a test deploy can never touch production data.

## One-time setup

1. **Neon**: create a project (region near your users, e.g. `aws-eu-west-2` London). Keep the default branch `main` for production and create a second branch `preview`. For each branch copy two connection strings: **pooled** (`-pooler` in the host) → `DATABASE_URL`, **direct** → `DATABASE_URL_UNPOOLED`.
2. **Cloudflare R2**: create buckets `jobsmith-uploads` and `jobsmith-exports` (private; no public access, no custom domain). Create an API token with *Object Read & Write* limited to those two buckets and note `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. (Downloads use short-lived signed URLs to R2's S3 endpoint; no CORS needed.)
3. **Resend**: verify a sending domain and use an address on it for `EMAIL_FROM`.
4. **Google OAuth** (Cloud Console → Credentials → OAuth client, type *Web*): add redirect URIs
   `https://<your-domain>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for dev).
5. **GitHub**: push the repo. **Vercel**: import it (framework auto-detected), set the environment variables from `.env.production.example`, deploy.

The build command is `npm run vercel-build`, which **applies pending database migrations** (using `DATABASE_URL_UNPOOLED`) and then builds. A failed migration fails the deploy, so the old version keeps serving.

### Notes from the first deployment

- Pushing to `main` deploys to Production; other branches and PRs get Preview deployments (own Neon branch, magic-link sign-in only since Google needs fixed redirect URIs).
- `vercel link` writes a `VERCEL_OIDC_TOKEN` into `.env.local`. It is short-lived and unused by the app; delete the line.
- Environment variable changes only apply to **new** deployments: redeploy after changing them.
- R2 buckets are created in R2's default jurisdiction. If you need data to stay in the EU, create them with the EU jurisdiction and point the S3 endpoint at `<account>.eu.r2.cloudflarestorage.com` (currently hard-coded in `src/lib/storage/r2.ts`).
- Preview and Production share the same R2 buckets (objects are keyed by user id, and the databases differ). Use separate buckets if that matters to you.

## Post-deploy checks

```bash
curl https://<your-domain>/api/health
# → {"ok":true,"db":true,"storage":"r2","email":true,"googleSignIn":true,"serverAiKey":...,"restrictedSignIn":true,"reminders":true,"commit":"abc1234"}
```

Then: sign in, upload a resume, tailor to a job, download a PDF, add the job to the tracker.

## Operations

- **Reminders**: `vercel.json` schedules `/api/cron/reminders` daily at 07:00 UTC; Vercel authenticates it with `CRON_SECRET`.
- **Rollback**: Vercel → Deployments → *Promote to Production* on a previous deployment. Migrations are additive; if a release needs a destructive migration, write it in two steps.
- **Backups**: Neon keeps point-in-time history (window depends on plan); you can also branch production at any moment.
- **Rotating a secret**: change it in Vercel and redeploy. Rotating `AUTH_SECRET` signs everyone out; rotating `APP_ENCRYPTION_KEY` (or `AUTH_SECRET` if used as its fallback) makes saved personal API keys undecryptable, so users re-enter them.
- **Account deletion** removes the user's database rows and every object under `users/{id}/` in **both** buckets.

## Known limits

- **Upload size on Vercel**: serverless requests are capped at about **4.5 MB**, below the app's 5 MB rule. Normal resumes are well under 1 MB. (Direct-to-R2 uploads would lift this.)
- **Function time**: tailoring runs several AI calls (about 10-40 s). The routes allow up to 120 s; on a plan with a lower cap, shorten or upgrade.
- **Open sign-up**: unless `ALLOWED_EMAILS` is set, anyone can create an account. With a server AI key set, they can spend it (rate limits cap each user, not the total).
- **No CSP header yet** (other security headers are set). Add a nonce-based CSP before opening to the public.
