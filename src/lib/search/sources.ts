import "server-only";
import { htmlToText } from "@/lib/jobs/extract";

/**
 * Job sources. Only public, keyless JSON APIs whose terms allow showing their listings with credit and a link back
 * (Arbeitnow, Remotive, Remote OK, Himalayas). Nothing is scraped; LinkedIn, Indeed and Glassdoor are never touched.
 * Every listing keeps its source name and original URL, and "apply" always goes to that URL.
 */
export type Listing = {
  id: string;
  source: "Arbeitnow" | "Remotive" | "Remote OK" | "Himalayas";
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  description: string;
  tags: string[];
  salary: string;
  postedAt: number; // ms
};

const MAX_DESC = 8000;
const text = (html: unknown) => (typeof html === "string" ? htmlToText(html).slice(0, MAX_DESC) : "");
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const httpUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : "");

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": "Jobsmith/1.0 (personal job search)", Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

type Obj = Record<string, unknown>;
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === "object") : []);

type Adapter = { name: Listing["source"]; ttlMs: number; fetch: (q: string) => Promise<Listing[]> };

const ADAPTERS: Adapter[] = [
  {
    name: "Arbeitnow", // Germany/Europe; no search parameter, so the query is applied locally
    ttlMs: 30 * 60_000,
    fetch: async () => {
      const d = (await getJson("https://www.arbeitnow.com/api/job-board-api")) as Obj;
      return list(d.data).map((j) => ({
        id: `arbeitnow:${str(j.slug)}`, source: "Arbeitnow" as const, title: str(j.title), company: str(j.company_name),
        location: str(j.location), remote: j.remote === true, url: httpUrl(j.url),
        description: text(j.description), tags: strs(j.tags), salary: "", postedAt: Number(j.created_at) * 1000 || 0,
      }));
    },
  },
  {
    name: "Remotive", // asks for few requests: cache longer
    ttlMs: 60 * 60_000,
    fetch: async (q) => {
      const d = (await getJson(`https://remotive.com/api/remote-jobs?category=software-dev${q ? `&search=${encodeURIComponent(q)}` : ""}`)) as Obj;
      return list(d.jobs).map((j) => ({
        id: `remotive:${j.id}`, source: "Remotive" as const, title: str(j.title), company: str(j.company_name), location: str(j.candidate_required_location) || "Worldwide",
        remote: true, url: httpUrl(j.url), description: text(j.description), tags: strs(j.tags), salary: str(j.salary), postedAt: Date.parse(str(j.publication_date) + "Z") || 0,
      }));
    },
  },
  {
    name: "Remote OK",
    ttlMs: 60 * 60_000,
    fetch: async () => {
      const d = await getJson("https://remoteok.com/api");
      return list(d).filter((j) => j.slug).map((j) => ({
        id: `remoteok:${str(j.id)}`, source: "Remote OK" as const, title: str(j.position), company: str(j.company), location: str(j.location) || "Worldwide", remote: true,
        url: httpUrl(j.url), description: text(j.description), tags: strs(j.tags), salary: Number(j.salary_min) ? `${j.salary_min}–${j.salary_max} USD` : "", postedAt: Number(j.epoch) * 1000 || 0,
      }));
    },
  },
  {
    name: "Himalayas",
    ttlMs: 30 * 60_000,
    fetch: async (q) => {
      const d = (await getJson(q ? `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}` : "https://himalayas.app/jobs/api?limit=20")) as Obj;
      return list(d.jobs).map((j) => ({
        id: `himalayas:${str(j.guid)}`, source: "Himalayas" as const, title: str(j.title), company: str(j.companyName), location: strs(j.locationRestrictions).join(", ") || "Worldwide",
        remote: true, url: httpUrl(j.applicationLink) || httpUrl(j.guid), description: text(j.description) || str(j.excerpt), tags: strs(j.categories).map((c) => c.replace(/-/g, " ")),
        salary: j.minSalary ? `${j.minSalary}–${j.maxSalary} ${str(j.currency)}` : "", postedAt: Number(j.pubDate) * 1000 || 0,
      }));
    },
  },
];

const cache = new Map<string, { at: number; items: Listing[] }>();

/** One query across all sources. A source that fails is reported, not fatal. */
export async function fetchListings(q: string): Promise<{ listings: Listing[]; failed: string[] }> {
  const now = Date.now();
  const results = await Promise.allSettled(
    ADAPTERS.map(async (a) => {
      const key = `${a.name}:${a.name === "Arbeitnow" || a.name === "Remote OK" ? "" : q}`; // these two ignore the query
      const hit = cache.get(key);
      if (hit && now - hit.at < a.ttlMs) return hit.items;
      const items = (await a.fetch(q)).filter((l) => l.title && l.url);
      cache.set(key, { at: now, items });
      return items;
    }),
  );
  return {
    listings: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    failed: results.flatMap((r, i) => (r.status === "rejected" ? [ADAPTERS[i].name] : [])),
  };
}
