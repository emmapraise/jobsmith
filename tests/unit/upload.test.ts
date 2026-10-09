import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, normaliseText, UploadError, validateUpload } from "@/lib/resume/upload";

const pdf = (extra = "") => new TextEncoder().encode(`%PDF-1.7\n${extra}`);
const docx = () => {
  const b = new Uint8Array(200);
  b.set([0x50, 0x4b, 0x03, 0x04]);
  b.set(new TextEncoder().encode("word/document.xml"), 40);
  return b;
};
const file = (name: string, type: string, bytes: Uint8Array) => ({ name, type, size: bytes.byteLength });

function code(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof UploadError) return e.code;
    throw e;
  }
  return null;
}

describe("validateUpload", () => {
  it("accepts a real-looking PDF and DOCX", () => {
    const p = pdf();
    const d = docx();
    expect(validateUpload(file("cv.pdf", "application/pdf", p), p)).toBe("pdf");
    expect(
      validateUpload(file("cv.DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", d), d),
    ).toBe("docx");
  });

  it("accepts neutral or empty MIME types if extension and bytes agree", () => {
    const p = pdf();
    expect(validateUpload(file("cv.pdf", "", p), p)).toBe("pdf");
    expect(validateUpload(file("cv.pdf", "application/octet-stream", p), p)).toBe("pdf");
  });

  it("rejects other extensions", () => {
    const p = pdf();
    expect(code(() => validateUpload(file("cv.exe", "application/pdf", p), p))).toBe("bad_type");
    expect(code(() => validateUpload(file("cv.doc", "application/msword", p), p))).toBe("bad_type");
    expect(code(() => validateUpload(file("cv", "application/pdf", p), p))).toBe("bad_type");
  });

  it("rejects files over 5 MB and empty files", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    expect(code(() => validateUpload(file("a.pdf", "application/pdf", big), big))).toBe("too_large");
    const exactly = new Uint8Array(MAX_UPLOAD_BYTES);
    exactly.set(new TextEncoder().encode("%PDF-"));
    expect(code(() => validateUpload(file("a.pdf", "application/pdf", exactly), exactly))).toBeNull();
    expect(code(() => validateUpload(file("a.pdf", "application/pdf", new Uint8Array(0)), new Uint8Array(0)))).toBe("empty");
  });

  it("rejects a declared size over the limit even if bytes are small (client lies)", () => {
    const p = pdf();
    expect(code(() => validateUpload({ name: "a.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 }, p))).toBe("too_large");
  });

  it("rejects mismatched MIME, and content that isn't what the extension claims", () => {
    const p = pdf();
    expect(code(() => validateUpload(file("a.pdf", "image/png", p), p))).toBe("mismatch");
    const exe = new TextEncoder().encode("MZ\x90\x00 not a pdf");
    expect(code(() => validateUpload(file("evil.pdf", "application/pdf", exe), exe))).toBe("mismatch");
    // a zip that isn't a docx
    const zip = new Uint8Array(100);
    zip.set([0x50, 0x4b, 0x03, 0x04]);
    expect(code(() => validateUpload(file("a.docx", "", zip), zip))).toBe("mismatch");
    // pdf bytes renamed to docx
    expect(code(() => validateUpload(file("a.docx", "", p), p))).toBe("mismatch");
  });
});

describe("normaliseText", () => {
  it("collapses blank runs, strips control chars and trims", () => {
    expect(normaliseText("a\r\n\r\n\r\n\r\nb\u0000c  \n")).toBe("a\n\nbc");
  });
});

import { readFileSync } from "node:fs";
import { extractResumeText } from "@/lib/resume/upload";

describe("extractResumeText (real files)", () => {
  const load = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`));

  it("extracts text from a PDF and passes validation", async () => {
    const b = load("sample-resume.pdf");
    expect(validateUpload({ name: "sample-resume.pdf", type: "application/pdf", size: b.byteLength }, b)).toBe("pdf");
    const t = await extractResumeText(b, "pdf");
    expect(t).toContain("Ada Okafor");
    expect(t).toContain("Reduced p95 latency");
  });

  it("extracts text from a DOCX and passes validation", async () => {
    const b = load("sample-resume.docx");
    expect(validateUpload({ name: "sample-resume.docx", type: "", size: b.byteLength }, b)).toBe("docx");
    const t = await extractResumeText(b, "docx");
    expect(t).toContain("Senior Backend Engineer");
    expect(t).toContain("PostgreSQL 15");
  });

  it("refuses files with too little text (scans) and corrupted files with friendly errors", async () => {
    const tiny = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    await expect(extractResumeText(tiny, "pdf")).rejects.toMatchObject({ code: "unreadable" });
    const empty = load("sample-resume.docx");
    await expect(extractResumeText(empty.slice(0, 50), "docx")).rejects.toMatchObject({ code: "unreadable" });
  });
});
