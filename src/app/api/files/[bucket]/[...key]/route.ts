import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { verifyLocalSignature } from "@/lib/storage/local";

// DEV ONLY: serves objects from the local storage driver using HMAC-signed, expiring URLs.
// With the R2 driver, signed URLs point straight at R2 and this route is disabled.
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function GET(req: Request, ctx: { params: Promise<{ bucket: string; key: string[] }> }) {
  if (env().STORAGE_DRIVER !== "local") return new NextResponse("Not found", { status: 404 });
  const { bucket, key: parts } = await ctx.params;
  if (bucket !== "uploads" && bucket !== "exports") return new NextResponse("Not found", { status: 404 });

  const key = parts.map(decodeURIComponent).join("/");
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  const name = url.searchParams.get("name") ?? "";
  if (!verifyLocalSignature(bucket, key, exp, name, sig)) return new NextResponse("Link expired or invalid", { status: 403 });

  const body = await storage().get(bucket, key);
  if (!body) return new NextResponse("Not found", { status: 404 });

  const ext = key.split(".").pop() ?? "";
  return new NextResponse(Buffer.from(body), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      ...(name ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
