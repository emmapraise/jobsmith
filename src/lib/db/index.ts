import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };

function client() {
  if (!globalForDb.__pg) {
    globalForDb.__pg = postgres(env().DATABASE_URL, {
      // Serverless: many short-lived instances share one pooler, so keep each instance's pool small.
      max: env().NODE_ENV === "production" ? 3 : 10,
      prepare: false, // required behind PgBouncer-style poolers (Neon's pooled endpoint)
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }
  return globalForDb.__pg;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** Lazy so importing this module never connects (keeps `next build` and unit tests free of a DB). */
export function db() {
  if (!_db) _db = drizzle(client(), { schema });
  return _db;
}

export * as tables from "./schema";
