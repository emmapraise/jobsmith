import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env, r2Configured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Deployment check. Public by design, so it returns ONLY booleans and the short git commit: no env names, no
 * secrets, no user data. 200 when the database answers, 503 otherwise.
 */
export async function GET() {
  let dbOk = false;
  try {
    await db().execute(sql`select 1`);
    dbOk = true;
  } catch {
    /* reported below */
  }
  const e = env();
  const body = {
    ok: dbOk,
    db: dbOk,
    storage: e.STORAGE_DRIVER,
    storageConfigured: e.STORAGE_DRIVER === "local" || r2Configured(e),
    email: Boolean(e.AUTH_RESEND_KEY),
    googleSignIn: Boolean(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET),
    serverAiKey: Boolean(e.ANTHROPIC_API_KEY || e.OPENAI_API_KEY || e.GOOGLE_GENERATIVE_AI_API_KEY),
    restrictedSignIn: Boolean(e.ALLOWED_EMAILS),
    reminders: Boolean(e.CRON_SECRET),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
  return NextResponse.json(body, { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
