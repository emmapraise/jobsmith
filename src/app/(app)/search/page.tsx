import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { ListingActions } from "@/components/search/listing-actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/profile/repo";
import { getMasterResume } from "@/lib/resume/repo";
import { rankListings, userSkills } from "@/lib/search/rank";
import { fetchListings } from "@/lib/search/sources";
import { cn } from "@/lib/utils";

export const metadata = { title: "Job search" };
export const maxDuration = 60;

const SHOWN = 40;
const shortLoc = (s: string) => { const p = s.split(", "); return p.length > 3 ? `${p.slice(0, 3).join(", ")} +${p.length - 3} more` : s; };
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [master, { data: profile }] = await Promise.all([getMasterResume(user.id), getProfile(user.id)]);

  if (!master) {
    return (
      <div className="page">
        <PageHeader eyebrow="Job search" title="Job search" />
        <EmptyState icon={<Search aria-hidden="true" />} title="Upload a master resume first" description="Jobs are ranked by how well they match your own skills." action={<Button render={<Link href="/resume" />}>Upload resume</Button>} />
      </div>
    );
  }

  // First visit: start from the profile. After that, whatever the form sent.
  const first = !("country" in sp);
  const f = {
    q: one(sp.q).trim().slice(0, 100),
    country: first ? (profile.preferredCountries[0] ?? "") : one(sp.country).trim().slice(0, 60),
    remoteOnly: first ? profile.workModes.length === 1 && profile.workModes[0] === "remote" : one(sp.remote) === "1",
    visa: one(sp.visa) === "1" || (first && profile.needsVisaSponsorship === true),
    relocation: one(sp.relocation) === "1",
  };

  const { listings, failed } = await fetchListings(f.q);
  const results = rankListings(listings, f, userSkills(master.content), [...profile.targetRoles]);

  return (
    <div className="page">
      <PageHeader eyebrow="Job search" title="Find roles that fit you" description="Open listings from remote and European job boards, ranked by how many of your skills they name. Apply on the original site, or tailor your resume first." />

      <form method="get" className="rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <div>
            <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-ink">Keywords</label>
            <Input id="q" name="q" defaultValue={f.q} placeholder="e.g. node.js backend, ML engineer (empty = best fits)" />
          </div>
          <div>
            <label htmlFor="country" className="mb-1.5 block text-sm font-medium text-ink">Country</label>
            <Input id="country" name="country" defaultValue={f.country} placeholder="e.g. United Kingdom (empty = anywhere)" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {([["remote", "Remote only", f.remoteOnly], ["visa", "Mentions visa sponsorship", f.visa], ["relocation", "Mentions relocation help", f.relocation]] as const).map(([n, label, on]) => (
            <label key={n} className="flex items-center gap-2 text-ink"><input type="checkbox" name={n} value="1" defaultChecked={on} className="size-4 accent-[var(--brand)]" /> {label}</label>
          ))}
          <Button type="submit" className="ml-auto"><Search data-icon="inline-start" aria-hidden="true" /> Search</Button>
        </div>
      </form>

      {failed.length > 0 && <p role="status" className="mt-4 rounded-lg border border-line bg-surface-sunken p-3 text-sm text-ink-muted">Couldn’t reach {failed.join(", ")} just now. Results come from the other boards.</p>}

      {results.length === 0 ? (
        <div className="mt-6"><EmptyState icon={<Search aria-hidden="true" />} title="No matching listings" description="Try fewer keywords, drop the visa or relocation filter, or search anywhere. Boards only list recent jobs." /></div>
      ) : (
        <>
          <p className="mt-6 text-sm text-ink-muted">{results.length} listing{results.length === 1 ? "" : "s"}{results.length > SHOWN ? `, showing the best ${SHOWN}` : ""}. Fit counts the skills from your resume that a listing names.</p>
          <ul className="mt-3 space-y-3">
            {results.slice(0, SHOWN).map((l) => (
              <li key={l.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-sans text-base font-semibold text-ink">{l.title}</h3>
                    <p className="text-sm text-ink-muted">{l.company} · {shortLoc(l.location)}{l.salary && ` · ${l.salary}`}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", l.fit >= 60 ? "bg-brand-soft text-brand-soft-ink" : "bg-surface-sunken text-ink-muted")} title="Share of your skills this listing names, plus a bonus for a title you're targeting">Fit {l.fit}</span>
                </div>
                <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {l.remote && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-ink-muted">Remote</span>}
                  {l.visa && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-ink-muted">Mentions visa sponsorship</span>}
                  {l.relocation && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-ink-muted">Mentions relocation help</span>}
                </p>
                {l.matched.length > 0 && <p className="mt-2 text-sm text-ink-muted">Your skills named: <span className="text-ink">{l.matched.join(", ")}</span></p>}
                <ListingActions l={{ title: l.title, company: l.company, location: l.location, url: l.url, description: l.description }} />
                <p className="mt-3 text-xs text-ink-muted">
                  via {l.source} · <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">View and apply on the original <ExternalLink className="size-3" aria-hidden="true" /></a>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
