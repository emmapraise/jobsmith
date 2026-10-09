import Link from "next/link";
import { Briefcase, GraduationCap } from "lucide-react";
import { NewPrep } from "@/components/prep/new-prep";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { progressByQuestion } from "@/lib/prep/build";
import { listJobsForPrep, listPreps } from "@/lib/prep/repo";
import { CATEGORY_LABEL } from "@/lib/prep/schema";
import { getMasterResume } from "@/lib/resume/repo";

export const metadata = { title: "Interview prep" };
// Building a prep runs several AI calls in parallel; allow up to two minutes.
export const maxDuration = 120;

export default async function PrepPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job } = await searchParams;
  const user = await requireUser();
  const [master, preps, jobs] = await Promise.all([getMasterResume(user.id), listPreps(user.id), listJobsForPrep(user.id)]);

  if (!master) {
    return (
      <div className="page">
        <PageHeader eyebrow="Interview prep" title="Interview prep" />
        <EmptyState icon={<GraduationCap aria-hidden="true" />} title="Upload a master resume first" description="Your questions are based on your own experience and the job you’re going for." action={<Button render={<Link href="/resume" />}>Upload resume</Button>} />
      </div>
    );
  }

  const available = jobs.filter((j) => !j.hasPrep);

  return (
    <div className="page">
      <PageHeader eyebrow="Interview prep" title="Get ready for the interview" description="Likely technical, behavioural and system-design questions for the role, a place to practise with feedback, and a short company brief." />

      {available.length > 0 ? (
        <NewPrep jobs={available} initialJobId={job} />
      ) : jobs.length === 0 ? (
        <EmptyState icon={<Briefcase aria-hidden="true" />} title="Add a job first" description="Tailor your resume to a job or add an application in your tracker, then come back to prepare for it." action={<div className="flex flex-wrap justify-center gap-2"><Button render={<Link href="/tailor" />}>Tailor to a job</Button><Button variant="outline" render={<Link href="/tracker" />}>Open tracker</Button></div>} />
      ) : null}

      {preps.length > 0 && (
        <section aria-labelledby="mine" className="mt-12">
          <h2 id="mine" className="text-xl text-ink">Your prep packs</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {preps.map((p) => {
              const prog = progressByQuestion(p.data.attempts);
              const practised = p.data.questions.filter((q) => prog.has(q.id)).length;
              const scores = [...prog.values()].map((x) => x.best).filter((x): x is number => x !== null);
              const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
              return (
                <li key={p.id}>
                  <Link href={`/prep/${p.id}`} className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand">
                    <p className="truncate text-sm text-ink-muted">{p.company || "Unknown company"}</p>
                    <p className="truncate font-medium text-ink">{p.title || "Untitled role"}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      {p.data.questions.length} questions ({(["technical", "behavioural", "system_design"] as const).map((c) => `${p.data.questions.filter((q) => q.category === c).length} ${CATEGORY_LABEL[c].toLowerCase()}`).join(", ")})
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label="Questions practised" aria-valuemin={0} aria-valuemax={p.data.questions.length} aria-valuenow={practised}>
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(practised / Math.max(p.data.questions.length, 1)) * 100}%` }} />
                      </div>
                      <span className="text-xs text-ink-muted">{practised}/{p.data.questions.length} practised{avg !== null ? ` · avg ${avg.toFixed(1)}` : ""}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
