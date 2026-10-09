import type { ResumeContent } from "@/lib/resume/schema";

/**
 * Truthfulness backstop. The prompt tells the model not to invent; THIS is the code that enforces it.
 * A rewrite is rejected if it contains
 *   1. a number that isn't in the master resume (40k ≡ 40,000),
 *   2. a job keyword/tool that isn't in the master resume (the classic "stuff the posting's keywords" failure),
 *   3. a proper noun / tech-looking term that isn't in the master resume.
 * It is a conservative heuristic, not a proof; the user still reviews every change.
 */

export function resumeCorpus(r: ResumeContent): string {
  const parts: string[] = [r.contact.fullName, r.contact.headline, r.contact.location, r.summary];
  for (const e of r.experience) parts.push(e.company, e.title, e.location, e.start, e.end, ...e.bullets.map((b) => b.text));
  for (const e of r.education) parts.push(e.institution, e.degree, e.field, e.start, e.end, ...e.details.map((b) => b.text));
  for (const s of r.skills) parts.push(s.name, ...s.items);
  for (const p of r.projects) parts.push(p.name, p.description, ...p.technologies, ...p.bullets.map((b) => b.text));
  for (const c of r.certifications) parts.push(c.name, c.issuer, c.date);
  for (const l of r.languages) parts.push(l.name, l.level);
  return parts.filter(Boolean).join("\n");
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, "");

/** Numbers as comparable values: "40,000" → 40000, "40k" → 40000, "1.5m" → 1500000, "30%" → 30. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|b)?(?![\w])/gi)) {
    let v = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    const suf = m[2]?.toLowerCase();
    if (suf === "k") v *= 1e3;
    else if (suf === "m") v *= 1e6;
    else if (suf === "b" || suf === "bn") v *= 1e9;
    out.push(v);
  }
  return out;
}

const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*[a-z0-9+#]|[a-z0-9]/g) ?? [];

/** Light stemming for words of 6+ letters: "mentoring"/"mentored"/"mentors" → "mentor". Shorter words match exactly. */
function stem(t: string): string {
  const w = t.replace(/\./g, "");
  if (w.length < 6) return w;
  return w.replace(/(ations?|ings?|ions?|ers?|ed|es|s)$/, "") || w;
}

// Tiny single-entry cache: one tailoring checks many rewrites against the same corpus.
function corpusStems(corpus: string): Set<string> {
  if (lastCorpus.text !== corpus) lastCorpus = { text: corpus, stems: new Set(tokenize(corpus).map(stem)) };
  return lastCorpus.stems;
}
let lastCorpus: { text: string; stems: Set<string> } = { text: "", stems: new Set() };

/**
 * Is `term` evidenced in the corpus? Whole-token matching ("Java" does NOT match "JavaScript"), separator- and
 * case-insensitive ("Node.js" ≡ "nodejs"), with light stemming ("mentoring" ≡ "mentored"). A multi-word term is
 * evidenced when every one of its words is.
 */
export function corpusHas(corpus: string, term: string): boolean {
  const stems = corpusStems(corpus);
  const parts = tokenize(term);
  if (parts.length === 0) return true;
  // "NodeJS" has no separator but equals the corpus token "node.js": compare compact forms too.
  const compactTokens = new Set(tokenize(corpus).map(compact));
  return parts.every((p) => stems.has(stem(p)) || compactTokens.has(compact(p))) || compactTokens.has(compact(term));
}

function inText(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "i").test(text);
}

// Capitalised words that are fine without being in the resume.
const COMMON = new Set(["i", "a", "an", "the", "and", "or", "of", "to", "in", "for", "with", "on", "at", "by", "as", "from", "while", "across", "using", "via", "per"]);

function properTerms(text: string): string[] {
  const out: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const s of sentences) {
    const toks = s.match(/[A-Za-z0-9][A-Za-z0-9+#./-]*/g) ?? [];
    toks.forEach((tok, i) => {
      const t = tok.replace(/[./-]+$/g, "");
      if (t.length < 2 || /^\d/.test(t)) return; // numbers (40k, 2021, 95ms) are checked numerically, not as terms
      const lowerWord = COMMON.has(t.toLowerCase());
      const techShape = /[A-Z].*[A-Z]|[a-z][A-Z]|[+#]|\.[a-z]|[0-9][A-Za-z]|[A-Za-z][0-9]/.test(t); // AWS, JavaScript, C++, Node.js, S3
      const capitalised = /^[A-Z][a-z]/.test(t) && i > 0;
      if (!lowerWord && (techShape || capitalised)) out.push(t);
    });
  }
  return out;
}

// Words too generic to count as a claim on their own when they appear inside a multi-word job keyword.
const GENERIC = new Set(["engineering", "software", "services", "systems", "development", "applications", "application", "solutions", "management", "experience", "platform", "backend", "frontend", "technical", "technology", "technologies", "building", "design"]);

/** "high-throughput APIs" → ["throughput"]: the significant single words inside multi-word keywords. */
function keywordWords(keyword: string): string[] {
  return (keyword.toLowerCase().match(/[a-z][a-z0-9+#]{5,}/g) ?? []).filter((w) => !GENERIC.has(w));
}

export type FactCheck = { ok: true } | { ok: false; violations: string[] };

export function factCheck(newText: string, corpus: string, jobKeywords: string[] = []): FactCheck {
  const violations: string[] = [];

  const known = numbersIn(corpus);
  for (const n of numbersIn(newText)) {
    if (!known.some((k) => Math.abs(k - n) < 1e-9)) violations.push(`number ${n}`);
  }

  for (const kw of jobKeywords) {
    if (inText(newText, kw) && !corpusHas(corpus, kw)) violations.push(`keyword "${kw}"`);
  }

  // Individual words of multi-word keywords ("high-throughput APIs" must not smuggle in "throughput").
  for (const kw of jobKeywords) {
    if (!/[\s-]/.test(kw.trim())) continue;
    for (const w of keywordWords(kw)) {
      if (inText(newText, w) && !corpusHas(corpus, w)) violations.push(`word "${w}"`);
    }
  }

  for (const t of properTerms(newText)) {
    if (!corpusHas(corpus, t)) violations.push(`term "${t}"`);
  }

  return violations.length ? { ok: false, violations: [...new Set(violations)] } : { ok: true };
}

/** Share of `keywords` present in the resume (whole-term, separator-insensitive). */
export function keywordsPresent(r: ResumeContent, keywords: string[]): { present: string[]; missing: string[] } {
  const corpus = resumeCorpus(r);
  const present: string[] = [];
  const missing: string[] = [];
  for (const k of keywords) (corpusHas(corpus, k) ? present : missing).push(k);
  return { present, missing };
}
