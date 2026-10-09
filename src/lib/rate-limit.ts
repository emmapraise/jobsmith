import "server-only";
import { and, lt, sql } from "drizzle-orm";
import { db, tables } from "@/lib/db";

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

type Policy = { limit: number; windowSeconds: number };

/** Central policies. AI and upload endpoints must use one of these. */
export const POLICIES = {
  upload: { limit: 10, windowSeconds: 60 * 60 } satisfies Policy, // 10 uploads / hour
  ai: { limit: 60, windowSeconds: 60 * 60 } satisfies Policy, // 60 AI calls / hour
  aiBurst: { limit: 8, windowSeconds: 60 } satisfies Policy, // 8 / minute
  signIn: { limit: 10, windowSeconds: 15 * 60 } satisfies Policy,
} as const;

/**
 * Postgres fixed-window counter. `key` should combine policy name and user id (or IP for anonymous).
 * Atomic via INSERT ... ON CONFLICT DO UPDATE.
 */
export async function rateLimit(key: string, policy: Policy, now = new Date()): Promise<RateLimitResult> {
  const windowMs = policy.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  const [row] = await db()
    .insert(tables.rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [tables.rateLimits.key, tables.rateLimits.windowStart],
      set: { count: sql`${tables.rateLimits.count} + 1` },
    })
    .returning({ count: tables.rateLimits.count });

  // Opportunistic cleanup of old windows (cheap, indexed by PK prefix scan is fine at this scale).
  if (Math.random() < 0.02) {
    await db()
      .delete(tables.rateLimits)
      .where(and(lt(tables.rateLimits.windowStart, new Date(now.getTime() - 2 * windowMs))));
  }

  if (row.count > policy.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));
    return { ok: false, retryAfterSeconds };
  }
  return { ok: true, remaining: policy.limit - row.count };
}

/** Check several policies for one user; returns the first failure. */
export async function rateLimitUser(userId: string, names: (keyof typeof POLICIES)[]): Promise<RateLimitResult> {
  let last: RateLimitResult = { ok: true, remaining: Infinity };
  for (const n of names) {
    const r = await rateLimit(`${n}:${userId}`, POLICIES[n]);
    if (!r.ok) return r;
    last = r;
  }
  return last;
}
