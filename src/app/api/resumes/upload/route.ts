import { NextResponse } from "next/server";
import { handleApiError, tooManyRequests, fail } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { log } from "@/lib/log";
import { rateLimitUser } from "@/lib/rate-limit";
import { parseResumeText } from "@/lib/resume/parse";
import { addVersion, getResumeId } from "@/lib/resume/repo";
import { extractResumeText, MAX_UPLOAD_BYTES, UploadError, validateUpload } from "@/lib/resume/upload";
import { originalResumeKey, storage } from "@/lib/storage";

export const maxDuration = 120;
export const runtime = "nodejs";

const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export async function POST(req: Request) {
  let storedKey: string | null = null;
  try {
    const user = await requireUserApi();

    // Rate limit before reading the body: uploads cost storage and an AI call.
    const limit = await rateLimitUser(user.id, ["upload", "ai"]);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    // Cheap early reject on declared size (multipart overhead allowance); real check is on the bytes below.
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new UploadError("too_large", "That file is larger than 5 MB.");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new UploadError("missing_file", "Choose a PDF or DOCX file to upload.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = validateUpload({ name: file.name, type: file.type, size: file.size }, bytes);
    const text = await extractResumeText(bytes, kind);

    // Parse first: if the AI step fails, nothing is stored.
    const content = await parseResumeText(text);

    const resumeId = (await getResumeId(user.id)) ?? crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const key = originalResumeKey(user.id, resumeId, versionId, kind);
    await storage().put("uploads", key, bytes, { contentType: CONTENT_TYPES[kind] });
    storedKey = key;

    const safeName = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120);
    const { version } = await addVersion({
      userId: user.id,
      resumeId,
      content,
      source: "upload",
      note: "Uploaded and parsed",
      file: { key, name: safeName },
      resetReviewed: true,
    });
    storedKey = null; // committed

    log.info("resume.uploaded", { kind, version });
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    if (storedKey) {
      // DB write failed after the object was stored: don't leave an orphan.
      await storage().delete("uploads", storedKey).catch(() => undefined);
    }
    if (err instanceof TypeError) return fail("bad_request", "That upload couldn't be read. Please try again.", 400);
    return handleApiError(err);
  }
}
