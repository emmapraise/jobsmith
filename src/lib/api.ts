import "server-only";
import { NextResponse } from "next/server";
import { LlmError, LlmNotConfiguredError } from "@/lib/llm";
import { log } from "@/lib/log";
import { UnauthorizedError } from "@/lib/auth/session";
import { UploadError } from "@/lib/resume/upload";
import { StorageNotConfiguredError } from "@/lib/storage/types";

export type ApiFailure = { ok: false; code: string; message: string; retryAfterSeconds?: number };

export function fail(code: string, message: string, status: number, extra?: { retryAfterSeconds?: number }) {
  const body: ApiFailure = { ok: false, code, message, ...extra };
  return NextResponse.json(body, {
    status,
    headers: extra?.retryAfterSeconds ? { "Retry-After": String(extra.retryAfterSeconds) } : undefined,
  });
}

/** Maps known errors to safe, user-facing responses. Never echoes error messages from unknown errors. */
export function handleApiError(err: unknown) {
  if (err instanceof UnauthorizedError) return fail("unauthorized", "Please sign in.", 401);
  if (err instanceof UploadError) return fail(err.code, err.message, err.code === "too_large" ? 413 : 400);
  if (err instanceof LlmNotConfiguredError) {
    return fail("ai_not_configured", "AI isn't configured on this server yet. Add an API key and try again.", 503);
  }

  if (err instanceof LlmError) return fail("ai_failed", err.message, 502);
  if (err instanceof StorageNotConfiguredError) return fail("storage_not_configured", err.message, 503);
  log.error("api.unhandled", err);
  return fail("server_error", "Something went wrong on our side. Please try again.", 500);
}

export function tooManyRequests(retryAfterSeconds: number) {
  return fail("rate_limited", `You're going a bit fast. Try again in ${formatWait(retryAfterSeconds)}.`, 429, {
    retryAfterSeconds,
  });
}

function formatWait(s: number) {
  if (s < 90) return `${s} seconds`;
  return `${Math.ceil(s / 60)} minutes`;
}
