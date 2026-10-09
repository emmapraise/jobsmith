import { parse } from "node-html-parser";

export type ExtractedJob = {
  text: string;
  hints: { title?: string; company?: string; location?: string; remote?: boolean };
  /** True when schema.org JobPosting data was found (high-quality source). */
  structured: boolean;
};

const MAX_CHARS = 24_000;

const clean = (s: string) =>
  s
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** HTML → readable text with line breaks for block elements and bullets for list items. */
export function htmlToText(html: string): string {
  const root = parse(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|section|tr|ul|ol)>/gi, "</$1>\n").replace(/<li[^>]*>/gi, "\n- "));
  root.querySelectorAll("script,style,noscript,svg,iframe").forEach((n) => n.remove());
  return clean(root.textContent);
}

type JsonLd = Record<string, unknown>;

function* walk(node: unknown): Generator<JsonLd> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === "object") {
    yield node as JsonLd;
    const g = (node as JsonLd)["@graph"];
    if (g) yield* walk(g);
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function locationOf(v: unknown): string | undefined {
  const first = Array.isArray(v) ? v[0] : v;
  if (!first || typeof first !== "object") return str(first);
  const addr = (first as JsonLd).address as JsonLd | string | undefined;
  if (typeof addr === "string") return addr;
  if (addr && typeof addr === "object") {
    return [str(addr.addressLocality), str(addr.addressRegion), str(addr.addressCountry as string)].filter(Boolean).join(", ") || undefined;
  }
  return str((first as JsonLd).name);
}

export function extractJob(html: string): ExtractedJob {
  const root = parse(html);

  // 1. schema.org JobPosting (most career sites ship this for Google Jobs)
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(s.textContent);
    } catch {
      continue;
    }
    for (const n of walk(data)) {
      const type = n["@type"];
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
        const desc = str(n.description);
        if (!desc) continue;
        const org = n.hiringOrganization as JsonLd | string | undefined;
        const company = typeof org === "string" ? org : str(org?.name);
        const labelled = (label: string, v: string | undefined) => (v ? [`${label}: ${v}`] : []);
        const parts = [
          ...labelled("Job title", str(n.title)),
          ...labelled("Company", company),
          ...labelled("Location", locationOf(n.jobLocation)),
          ...labelled("Location type", str(n.jobLocationType)),
          ...labelled("Employment type", str(n.employmentType)),
          "",
          htmlToText(desc),
        ];
        return {
          text: clean(parts.join("\n")).slice(0, MAX_CHARS),
          hints: {
            title: str(n.title),
            company,
            location: locationOf(n.jobLocation),
            remote: str(n.jobLocationType)?.toUpperCase() === "TELECOMMUTE" || undefined,
          },
          structured: true,
        };
      }
    }
  }

  // 2. Fallback: main content text
  root.querySelectorAll("script,style,noscript,svg,iframe,nav,header,footer,aside,form,button").forEach((n) => n.remove());
  const main = root.querySelector("main") ?? root.querySelector("article") ?? root.querySelector("body") ?? root;
  const title = str(root.querySelector("title")?.textContent) ?? str(root.querySelector("h1")?.textContent);
  return { text: htmlToText(main.toString()).slice(0, MAX_CHARS), hints: { title }, structured: false };
}

export const MIN_JOB_CHARS = 300;
