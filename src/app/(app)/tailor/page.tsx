import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { NewTailoring } from "@/components/tailor/new-tailoring";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getMasterResume } from "@/lib/resume/repo";
import { listTailored } from "@/lib/tailor/repo";

export const metadata = { title: "Tailor to a job" };
// Creating a tailoring runs several AI calls; allow up to two minutes.
export const maxDuration = 120;

const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export default async function TailorPage() {
  const user = await requireUser();
  const [master, items] = await Promise.all([getMasterResume(user.id), listTailored(user.id)]);

  if (!master) {
    return (
      <div className="page">
        <PageHeader eyebrow="Tailor" title="Tailor to a job" />
        <EmptyState icon={<FileText aria-hidden="true" />} title="Upload a master resume first" description="Tailoring rewrites your master resume for each job, using only facts it already contains." action={<Button render={<Link href="/resume" />}>Upload resume</Button>} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Tailor" title="Tailor to a job" description="Add a job and we’ll suggest edits to your resume. Every edit has a reason, you accept or reject each one, and nothing is ever invented." />
      <NewTailoring />

      <section aria-labelledby="recent" className="mt-14">
        <h2 id="recent" className="text-xl text-ink">Your tailored resumes</h2>
        {items.length === 0 ? (
          <EmptyState className="mt-4" icon={<Sparkles aria-hidden="true" />} title="Nothing here yet" description="Your first tailored resume will appear here." />
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {items.map((t) => (
              <li key={t.id}>
                <Link href={`/tailor/${t.id}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{t.title || "Untitled role"}</p>
                    <p className="truncate text-sm text-ink-muted">{t.company || "Unknown company"} · {fmt.format(t.updatedAt)}{t.version > 1 ? ` · v${t.version}` : ""}</p>
                  </div>
                  {t.matchScore !== null && <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-sm font-semibold text-brand-soft-ink" title="Match score"><span className="sr-only">Match score </span>{t.matchScore}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
