import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_TEXT_CHARS = 60_000;
export const MIN_TEXT_CHARS = 200;

export type UploadKind = "pdf" | "docx";

export class UploadError extends Error {
  constructor(
    public readonly code:
      | "missing_file"
      | "empty"
      | "too_large"
      | "bad_type"
      | "mismatch"
      | "unreadable"
      | "no_text",
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const OK_MIME: Record<UploadKind, string[]> = {
  pdf: ["application/pdf", "application/x-pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};
// Browsers/OSes sometimes send no type or a generic one; we then rely on extension + magic bytes.
const NEUTRAL_MIME = ["", "application/octet-stream"];

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Server-side validation. Trust nothing from the client: extension, declared MIME and magic bytes must agree. */
export function validateUpload(file: { name: string; type: string; size: number }, bytes: Uint8Array): UploadKind {
  if (bytes.byteLength === 0 || file.size === 0) throw new UploadError("empty", "That file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES || file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("too_large", "That file is larger than 5 MB.");
  }

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext !== "pdf" && ext !== "docx") {
    throw new UploadError("bad_type", "Only PDF and DOCX files are accepted.");
  }
  const kind: UploadKind = ext;

  const mime = file.type.toLowerCase();
  if (!NEUTRAL_MIME.includes(mime) && !OK_MIME[kind].includes(mime)) {
    throw new UploadError("mismatch", "The file type doesn't match its extension.");
  }

  if (kind === "pdf") {
    // "%PDF-" must appear in the first 1024 bytes (the spec allows leading junk).
    const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
    if (!head.includes("%PDF-")) throw new UploadError("mismatch", "This doesn't look like a real PDF.");
  } else {
    // DOCX is a ZIP ("PK\x03\x04") that contains word/document.xml.
    if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
      throw new UploadError("mismatch", "This doesn't look like a real DOCX file.");
    }
    if (!Buffer.from(bytes).includes("word/document.xml")) {
      throw new UploadError("mismatch", "This doesn't look like a Word document.");
    }
  }
  return kind;
}

/** Extracts plain text in memory. The text is never stored or logged. */
export async function extractResumeText(bytes: Uint8Array, kind: UploadKind): Promise<string> {
  let text = "";
  try {
    if (kind === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const res = await extractText(pdf, { mergePages: true });
      text = Array.isArray(res.text) ? res.text.join("\n") : res.text;
    } else {
      const res = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = res.value;
    }
  } catch {
    throw new UploadError("unreadable", "We couldn't open that file. It may be corrupted or password protected.");
  }

  text = normaliseText(text);
  if (text.length < MIN_TEXT_CHARS) {
    throw new UploadError(
      "no_text",
      "We couldn't find readable text in that file. If it's a scanned image, export a text-based PDF or upload the DOCX.",
    );
  }
  return text.slice(0, MAX_TEXT_CHARS);
}

export function normaliseText(t: string): string {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
