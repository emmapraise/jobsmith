import "server-only";
import { LlmError, LlmNotConfiguredError } from "@/lib/llm";
import { log } from "@/lib/log";
import { rateLimitUser, type POLICIES } from "@/lib/rate-limit";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string; code?: string };

export const fail = (message: string, code?: string): { ok: false; message: string; code?: string } => ({ ok: false, message, code });

/** Server actions return results instead of throwing, so the UI can show friendly error states. */
export function actionError(err: unknown) {
  if (err instanceof LlmNotConfiguredError) {
    return fail("AI isn't configured on this server yet. Add an API key to .env.local and restart.", "ai_not_configured");
  }
  if (err instanceof LlmError) return fail(err.message, "ai_failed");
  log.error("action.unhandled", err);
  return fail("Something went wrong. Please try again.", "server_error");
}

export async function limitOrFail(userId: string, names: (keyof typeof POLICIES)[]) {
  const r = await rateLimitUser(userId, names);
  if (r.ok) return null;
  const wait = r.retryAfterSeconds < 90 ? `${r.retryAfterSeconds} seconds` : `${Math.ceil(r.retryAfterSeconds / 60)} minutes`;
  return fail(`You're going a bit fast. Try again in ${wait}.`, "rate_limited");
}
