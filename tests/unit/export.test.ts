import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { renderDocx } from "@/lib/export/docx";
import { buildDocument, dateRange, exportFileName, formatDate } from "@/lib/export/model";
import { needsUnicodeFont, renderPdf } from "@/lib/export/pdf";
import { contentHash } from "@/lib/export/service";
import { emptyResume, type ResumeContent } from "@/lib/resume/schema";

const resume = (over: Partial<ResumeContent> = {}): ResumeContent => ({
  ...emptyResume(),
  contact: { fullName: "Ada Okafor", headline: "Senior Backend Engineer", email: "ada@example.com", phone: "+234 800 000 0000", location: "Lagos, Nigeria", links: [{ id: "l", label: "GitHub", url: "github.com/ada" }] },
  summary: "Backend engineer with 7 years building payment APIs.",
  experience: [
    { id: "e1", company: "Acme", title: "Senior Backend Engineer", location: "Lagos", start: "2021-03", end: "", current: true, bullets: [{ id: "b1", text: "Built Node.js payment APIs serving 40,000 daily users." }, { id: "b2", text: "Cut p95 latency from 900ms to 240ms." }] },
    { id: "e2", company: "DataWorks", title: "Backend Engineer", location: "Remote", start: "2018-06", end: "2021-02", current: false, bullets: [{ id: "b3", text: "Built ETL pipelines." }] },
  ],
  education: [{ id: "ed", institution: "University of Lagos", degree: "BSc", field: "Computer Science", location: "", start: "2012", end: "2016", details: [] }],
  skills: [{ id: "s1", name: "Languages", items: ["TypeScript", "Python"] }],
  languages: [{ id: "lg", name: "English", level: "Fluent" }],
  certifications: [{ id: "c1", name: "AWS Solutions Architect", issuer: "AWS", date: "2024" }],
  ...over,
});

const pdfText = async (buf: Buffer) => {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: Array.isArray(text) ? text.join("\n") : text, pages: totalPages };
};

describe("document model & regional variants", () => {
  it("formats dates per region", () => {
    expect(formatDate("2021-03", "uk_eu")).toBe("March 2021");
    expect(formatDate("2021-03", "us")).toBe("Mar 2021");
    expect(formatDate("2018", "us")).toBe("2018");
    expect(dateRange("2021-03", "", true, "uk_eu")).toBe("March 2021 – Present");
    expect(dateRange("2018-06", "2021-02", false, "us")).toBe("Jun 2018 – Feb 2021");
  });
  it("UK/EU: A4 CV, profile first, education before skills, languages included", () => {
    const m = buildDocument(resume(), "uk_eu");
    expect(m).toMatchObject({ page: "A4", docTitle: "CV" });
    const titles = m.blocks.filter((b) => b.t === "section").map((b) => (b as { title: string }).title);
    expect(titles).toEqual(["Professional Profile", "Work Experience", "Education", "Skills", "Certifications", "Languages"]);
  });
  it("US: Letter resume, skills before experience, no languages section", () => {
    const m = buildDocument(resume(), "us");
    expect(m).toMatchObject({ page: "LETTER", docTitle: "Resume" });
    const titles = m.blocks.filter((b) => b.t === "section").map((b) => (b as { title: string }).title);
    expect(titles).toEqual(["Summary", "Skills", "Experience", "Education", "Certifications"]);
  });
  it("omits empty sections and builds safe file names", () => {
    const m = buildDocument(resume({ projects: [], summary: "" }), "us");
    expect(m.blocks.some((b) => b.t === "section" && b.title === "Summary")).toBe(false);
    expect(exportFileName("Ọlá Adéwálé", "uk_eu", "Globex Ltd.", "pdf")).toBe("Ola-Adewale-CV-Globex-Ltd.pdf");
    expect(exportFileName("", "us", "", "docx")).toBe("Resume-Resume.docx");
  });
});

describe("PDF export", () => {
  it("is a real PDF whose text can be read back in order (ATS-readable)", async () => {
    const buf = await renderPdf(buildDocument(resume(), "uk_eu"));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const { text, pages } = await pdfText(buf);
    expect(pages).toBe(1);
    for (const s of ["Ada Okafor", "PROFESSIONAL PROFILE", "WORK EXPERIENCE", "Senior Backend Engineer", "March 2021 – Present", "40,000 daily users", "University of Lagos", "TypeScript, Python", "English (Fluent)"]) {
      expect(text).toContain(s);
    }
    expect(text.indexOf("WORK EXPERIENCE")).toBeLessThan(text.indexOf("EDUCATION"));
  });
  it("uses an embedded font so Yoruba/Polish/Turkish names survive", async () => {
    expect(needsUnicodeFont("Ada Okafor, Zoë, Müller, café — “quoted” • 2021")).toBe(false);
    expect(needsUnicodeFont("Ọlá Adéwálé")).toBe(true);
    const buf = await renderPdf(buildDocument(resume({ contact: { ...resume().contact, fullName: "Ọlá Adéwálé", location: "Łódź" } }), "uk_eu"));
    const { text } = await pdfText(buf);
    expect(text).toContain("Ọlá Adéwálé");
    expect(text).toContain("Łódź");
  });
  it("paginates long resumes without losing content", async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `e${i}`, company: `Company ${i}`, title: `Engineer ${i}`, location: "Remote", start: "2010-01", end: "2011-01", current: false,
      bullets: Array.from({ length: 5 }, (_, j) => ({ id: `b${i}-${j}`, text: `Delivered milestone ${i}-${j} for the platform team with measurable results across services.` })) }));
    const buf = await renderPdf(buildDocument(resume({ experience: many }), "us"));
    const { text, pages } = await pdfText(buf);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain("Company 0");
    expect(text).toContain("Company 13");
    expect(text).toContain("milestone 13-4");
  });
});

describe("DOCX export", () => {
  it("is a real DOCX with headings, bullets and all content", async () => {
    const buf = await renderDocx(buildDocument(resume(), "us"));
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const raw = (await mammoth.extractRawText({ buffer: buf })).value;
    for (const s of ["Ada Okafor", "SUMMARY", "EXPERIENCE", "Built Node.js payment APIs serving 40,000 daily users.", "Mar 2021 – Present", "Languages: TypeScript, Python"]) {
      expect(raw).toContain(s);
    }
    expect(raw).not.toContain("English (Fluent)"); // US variant omits languages
    const html = (await mammoth.convertToHtml({ buffer: buf })).value;
    expect(html).toMatch(/<h1>/); // real heading styles
    expect(html).toMatch(/<li>/); // real list items
  });
});

describe("export cache key", () => {
  it("is stable for identical input and changes with content, variant or format", () => {
    const r = resume();
    const h = contentHash(r, "uk_eu", "pdf");
    expect(contentHash(structuredClone(r), "uk_eu", "pdf")).toBe(h);
    expect(contentHash(r, "us", "pdf")).not.toBe(h);
    expect(contentHash(r, "uk_eu", "docx")).not.toBe(h);
    expect(contentHash({ ...r, summary: "changed" }, "uk_eu", "pdf")).not.toBe(h);
  });
});
