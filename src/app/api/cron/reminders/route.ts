import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runReminderDigests } from "@/lib/tracker/reminders";

export const maxDuration = 120;

function authorised(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function handle(req: Request) {
  // Disabled (404) unless CRON_SECRET is set; wrong/missing secret is 401.
  if (!env().CRON_SECRET) return new NextResponse("Not found", { status: 404 });
  if (!authorised(req)) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await runReminderDigests());
}

export const GET = handle; // Vercel Cron calls GET
export const POST = handle;
