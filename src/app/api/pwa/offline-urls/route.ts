import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireUserApi, UnauthorizedError } from "@/lib/auth/session";
import { db, tables } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Pages worth saving for offline reading: the main screens plus the user's most recent applications and tailored
 * resumes. Only paths (no content). The service worker fetches them with the user's own session.
 */
export async function GET() {
  try {
    const user = await requireUserApi();
    const [apps, tailored, preps] = await Promise.all([
      db().select({ id: tables.applications.id }).from(tables.applications).where(eq(tables.applications.userId, user.id)).orderBy(desc(tables.applications.statusChangedAt)).limit(8),
      db().select({ id: tables.tailoredResumes.id }).from(tables.tailoredResumes).where(eq(tables.tailoredResumes.userId, user.id)).orderBy(desc(tables.tailoredResumes.updatedAt)).limit(4),
      db().select({ id: tables.interviewPreps.id }).from(tables.interviewPreps).where(eq(tables.interviewPreps.userId, user.id)).orderBy(desc(tables.interviewPreps.updatedAt)).limit(3),
    ]);
    const urls = ["/dashboard", "/tracker", "/tailor", "/roles", "/resume", "/prep", ...apps.map((a) => `/tracker/${a.id}`), ...tailored.map((t) => `/tailor/${t.id}`), ...preps.map((p) => `/prep/${p.id}`)];
    return NextResponse.json({ urls }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ urls: [] }, { status: 401 });
    throw e;
  }
}
