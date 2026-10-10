import { corpusHas } from "@/lib/tailor/factcheck";
import type { ResumeContent } from "@/lib/resume/schema";
import type { Listing } from "./sources";

export type Filters = { q: string; country: string; remoteOnly: boolean; visa: boolean; relocation: boolean };
export type Scored = Listing & { fit: number; matched: string[]; visa: boolean; relocation: boolean };

const NO_SPONSOR = /\b(no|not|unable to|cannot|can't|won't|without)\s+(?:able to\s+)?(?:visa\s+)?sponsor|sponsorship (?:is )?not (?:available|offered)|must (?:already )?(?:have|hold) (?:the )?right to work/i;
const SPONSOR = /visa sponsor|sponsor(?:ship)?\b.{0,20}\bvisa|\bwe (?:can )?sponsor|sponsorship (?:is )?(?:available|offered|provided)|skilled worker visa/i;
const RELOCATE = /relocation (?:support|assistance|package|help|bonus|allowance|budget)|help(?:ing)? (?:you )?relocat|will relocate|relocate (?:you|candidates)/i;

/** What a listing says about visas and relocation. These are mentions in the text, not guarantees. */
export const mentionsVisa = (t: string) => SPONSOR.test(t) && !NO_SPONSOR.test(t);
export const mentionsRelocation = (t: string) => RELOCATE.test(t);

const EUROPE = ["uk", "united kingdom", "england", "ireland", "germany", "france", "spain", "portugal", "netherlands", "italy", "poland", "sweden", "norway", "denmark", "finland", "belgium", "austria", "switzerland", "estonia", "lithuania", "latvia", "czech", "romania", "greece"];
const ANYWHERE = /worldwide|anywhere|global|remote\b|^$/i;

/** Does the listing's location suit the chosen country? Worldwide remote suits everyone; "Europe" suits European countries. */
export function locationFits(l: Listing, country: string): boolean {
  const c = country.trim().toLowerCase();
  if (!c) return true;
  const loc = l.location.toLowerCase();
  if (loc.includes(c) || (c === "uk" && /united kingdom|england|london/.test(loc)) || (c === "united kingdom" && /\buk\b|england|london/.test(loc))) return true;
  if (l.source === "Arbeitnow" && c === "germany") return true; // its listings name a city, not a country, and it is a German board
  if (!l.remote) return false;
  if (ANYWHERE.test(loc)) return true;
  return /europe|emea/.test(loc) && EUROPE.some((e) => c.includes(e));
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? [];

/**
 * Explainable fit, no AI: how many of YOUR skills the listing names (up to 6 counts as full), plus a bonus when the title
 * matches a role you're targeting. Skills shorter than 3 characters ("Go", "R") are skipped: they match ordinary words.
 */
export function scoreListing(l: Listing, skills: string[], targetRoles: string[]): { fit: number; matched: string[] } {
  const corpus = `${l.title}\n${l.tags.join(" ")}\n${l.description}`;
  const matched = skills.filter((s) => s.length >= 3 && corpusHas(corpus, s));
  const title = new Set(words(l.title));
  const roleHit = targetRoles.some((r) => { const w = words(r).filter((x) => x.length > 2); return w.length > 0 && w.every((x) => title.has(x)); });
  return { fit: Math.round(Math.min(1, matched.length / 6) * 75 + (roleHit ? 25 : 0)), matched: matched.slice(0, 8) };
}

export function userSkills(r: ResumeContent): string[] {
  return [...new Set(r.skills.flatMap((g) => g.items).map((s) => s.trim()).filter(Boolean))].slice(0, 60);
}

export function rankListings(all: Listing[], f: Filters, skills: string[], targetRoles: string[]): Scored[] {
  const terms = words(f.q);
  const seen = new Set<string>();
  return all
    .filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)))
    .filter((l) => {
      const hay = `${l.title} ${l.company} ${l.tags.join(" ")} ${l.description}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .filter((l) => (f.remoteOnly ? l.remote : true) && locationFits(l, f.country))
    .map((l) => ({ ...l, ...scoreListing(l, skills, targetRoles), visa: mentionsVisa(l.description), relocation: mentionsRelocation(l.description) }))
    .filter((l) => (!f.visa || l.visa) && (!f.relocation || l.relocation) && (terms.length > 0 || l.fit >= 15))
    .sort((a, b) => b.fit - a.fit || b.postedAt - a.postedAt);
}
