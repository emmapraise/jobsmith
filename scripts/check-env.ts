/**
 * Validates an env file against the app's own schema WITHOUT printing any values.
 *   npm run env:check -- .env.local            (development rules)
 *   npm run env:check -- .env.production --prod (production rules: R2 storage, Resend key required)
 */
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

async function main() {
  const file = process.argv[2] ?? ".env.local";
  const prod = process.argv.includes("--prod");
  const vars = parse(readFileSync(file));
  for (const k of Object.keys(process.env)) if (/^(DATABASE_URL|AUTH_|STORAGE_|R2_|LLM_|ANTHROPIC_|OPENAI_|GOOGLE_|EMAIL_|CRON_|ALLOWED_|APP_)/.test(k)) delete process.env[k];
  Object.assign(process.env, vars, { NODE_ENV: prod ? "production" : "development" });

  const { env } = await import("../src/lib/env");
  let e;
  try {
    e = env();
  } catch (err) {
    console.error(`✗ ${file}: ${(err as Error).message}`);
    process.exit(1);
  }

  const { r2Configured } = await import("../src/lib/env");
  const warn: string[] = [];
  if (e.STORAGE_DRIVER === "r2" && !r2Configured(e)) warn.push("R2 credentials are missing: uploads and exports will fail until R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are set");
  if (!e.ALLOWED_EMAILS) warn.push("ALLOWED_EMAILS is not set: anyone can sign up" + (e.ANTHROPIC_API_KEY || e.OPENAI_API_KEY || e.GOOGLE_GENERATIVE_AI_API_KEY ? " and use your server AI key" : ""));
  if (!e.AUTH_GOOGLE_ID || !e.AUTH_GOOGLE_SECRET) warn.push("Google sign-in is not configured");
  if (!e.AUTH_RESEND_KEY) warn.push("AUTH_RESEND_KEY is not set: magic-link emails will not be sent");
  if (!e.CRON_SECRET) warn.push("CRON_SECRET is not set: email reminders are disabled");
  if (prod && !e.DATABASE_URL.includes("sslmode=require") && !/localhost|127\.0\.0\.1/.test(e.DATABASE_URL)) warn.push("DATABASE_URL has no sslmode=require");
  if (prod && /localhost|127\.0\.0\.1/.test(e.DATABASE_URL)) warn.push("DATABASE_URL points at localhost");
  if (prod && !e.DATABASE_URL_UNPOOLED) warn.push("DATABASE_URL_UNPOOLED is not set: migrations will use the pooled URL");

  console.log(`✓ ${file} is valid for ${prod ? "production" : "development"} (provider ${e.LLM_PROVIDER}, storage ${e.STORAGE_DRIVER})`);
  for (const w of warn) console.log(`  ! ${w}`);
}
main();
