import "server-only";
import { createHash } from "node:crypto";
import type { ResumeContent } from "@/lib/resume/schema";
import { exportKey, storage } from "@/lib/storage";
import { renderDocx } from "./docx";
import { buildDocument, exportFileName, TEMPLATE_VERSION, type Variant } from "./model";
import { renderPdf } from "./pdf";

export type ExportFormat = "pdf" | "docx";

const CONTENT_TYPE: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Same content + variant + template version + format → same hash → cached object, no re-render. */
export function contentHash(content: ResumeContent, variant: Variant, format: ExportFormat): string {
  return createHash("sha256").update(JSON.stringify({ content, variant, format, template: TEMPLATE_VERSION })).digest("hex").slice(0, 40);
}

export async function renderBytes(content: ResumeContent, variant: Variant, format: ExportFormat): Promise<Buffer> {
  const model = buildDocument(content, variant);
  return format === "pdf" ? renderPdf(model) : renderDocx(model);
}

/**
 * Returns a short-lived signed URL to the exported file, rendering and caching it in the private
 * exports bucket if needed. `ownerId` is the resume/tailored-resume id used in the object key.
 */
export async function exportToUrl(args: { userId: string; ownerId: string; content: ResumeContent; variant: Variant; format: ExportFormat; company?: string }) {
  const hash = contentHash(args.content, args.variant, args.format);
  const key = exportKey(args.userId, args.ownerId, hash, args.format);
  const s = storage();
  let cached = true;
  if (!(await s.exists("exports", key))) {
    cached = false;
    await s.put("exports", key, await renderBytes(args.content, args.variant, args.format), { contentType: CONTENT_TYPE[args.format] });
  }
  const fileName = exportFileName(args.content.contact.fullName, args.variant, args.company ?? "", args.format);
  const url = await s.getSignedUrl("exports", key, { expiresInSeconds: 120, downloadName: fileName });
  return { url, fileName, cached };
}
