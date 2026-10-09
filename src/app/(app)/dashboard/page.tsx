import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { InstallBanner } from "@/components/pwa/install-prompt";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/profile/repo";
import { getLatestInsights } from "@/lib/resume/insights";
import { getOpenQa, lastCompletedQaAt } from "@/lib/resume/qa-repo";
import { getMasterResume } from "@/lib/resume/repo";
import { listTailored } from "@/lib/tailor/repo";
import { Attention } from "@/components/tracker/attention";
import { dueForUser, listApplications } from "@/lib/tracker/repo";
import { toView } from "@/lib/tracker/view";
import { listPreps } from "@/lib/prep/repo";
import { cn } from "@/lib/utils";

export const metadata = { title: "Home" };

type Step = { key: string; title: string; body: string; href: string; cta: string; done: boolean; note?: string };

export default async function DashboardPage() {
  const user = await requireUser();
  const [master, profile, openQa, lastQa] = await Promise.all([
    getMasterResume(user.id),
    getProfile(user.id),
    getOpenQa(user.id),
    lastCompletedQaAt(user.id),
  ]);
  const insights = master ? await getLatestInsights(master.id) : null;
  const tailored = await listTailored(user.id, 1);
  const now = new Date();
  const [due, apps, preps] = await Promise.all([dueForUser(user.id, now), listApplications(user.id), listPreps(user.id)]);
  const needPrep = apps.filter((a) => a.status === "interview" && !preps.some((p) => p.jobId === a.jobId));

  const steps: Step[] = [
    {
      key: "upload",
      title: "Upload your master resume",
      body: "One PDF or DOCX is all we need to start.",
      href: "/resume",
      cta: "Upload resume",
      done: Boolean(master),
    },
    {
      key: "review",
      title: "Review what we read",
      body: "Check each section and correct anything we parsed wrongly.",
      href: "/resume/review",
      cta: "Review & correct",
      done: Boolean(master?.reviewed),
    },
    {
      key: "qa",
      title: "Bring it up to date",
      body: "A few short questions about what’s changed since you last updated it.",
      href: "/resume/update",
      cta: openQa ? "Continue questions" : "Start questions",
      done: Boolean(lastQa),
      note: openQa ? "In progress" : undefined,
    },
    {
      key: "profile",
      title: "Tell us what you want next",
      body: "Goals, salary, countries, work mode and work authorization.",
      href: "/profile",
      cta: "Answer profile questions",
      done: profile.completed,
    },
    {
      key: "roles",
      title: "See the roles you fit",
      body: "Best-fit and adjacent roles, with evidence and gaps.",
      href: "/roles",
      cta: insights ? "View roles" : "Find my roles",
      done: Boolean(insights),
    },
    {
      key: "tailor",
      title: "Tailor your resume to a job",
      body: "Paste a job link or description. Review every suggested edit and download a PDF or DOCX.",
      href: "/tailor",
      cta: "Tailor to a job",
      done: tailored.length > 0,
    },
    {
      key: "track",
      title: "Track your applications",
      body: "Keep every application in one place with the exact resume you sent, and get nudges to follow up.",
      href: "/tracker",
      cta: "Open tracker",
      done: apps.length > 0,
    },
  ];

  const next = steps.find((s) => !s.done);
  const firstName = user.name?.split(" ")[0];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Home"
        title={firstName ? `Welcome, ${firstName}` : "Welcome to Jobsmith"}
        description={next ? "Here’s the quickest path to a resume that fits the roles you want." : "Your profile is ready. Tailoring to specific jobs comes next."}
      />

      {needPrep.length > 0 && (
        <section aria-label="Interview prep" className="mb-6 rounded-2xl border border-brand/20 bg-brand-soft p-4 sm:p-5">
          <h2 className="text-lg text-brand-soft-ink">You have {needPrep.length === 1 ? "an interview" : `${needPrep.length} interviews`} coming up</h2>
          <ul className="mt-2 space-y-1.5">
            {needPrep.slice(0, 3).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-brand-soft-ink">
                <span className="min-w-0 truncate">{a.title} at {a.company}</span>
                <Link href={`/prep?job=${a.jobId}`} className="font-medium underline underline-offset-4">Prepare</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <InstallBanner />
      {due.length > 0 && <div className="mb-6"><Attention items={due.map(toView)} now={now.toISOString()} compact /></div>}

      {next ? (
        <section aria-labelledby="next-step" className="rounded-2xl border border-brand/20 bg-brand-soft p-6 sm:p-8">
          <p className="eyebrow text-brand-soft-ink">Your next step</p>
          <h2 id="next-step" className="mt-2 text-title text-brand-soft-ink">
            {next.title}
          </h2>
          <p className="mt-2 max-w-xl text-brand-soft-ink/80">{next.body}</p>
          <Button size="lg" className="mt-6 h-11 px-5 text-base" render={<Link href={next.href} />}>
            {next.cta} <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </section>
      ) : (
        <section className="rounded-2xl border border-success/20 bg-success-soft p-6 sm:p-8">
          <h2 className="text-title text-ink">You’re set up</h2>
          <p className="mt-2 max-w-xl text-ink-muted">
            Your master resume, profile, tailored resumes and tracker are all set up. Interview prep is next.
          </p>
        </section>
      )}

      <section aria-labelledby="progress" className="mt-10">
        <h2 id="progress" className="text-xl text-ink">
          Your setup
        </h2>
        <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-start gap-4 p-4 sm:p-5">
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
                  s.done ? "border-success bg-success text-brand-fg" : "border-line-strong text-ink-faint",
                )}
              >
                {s.done ? <Check className="size-4" aria-label="Done" /> : <Circle className="size-3" aria-label={`Step ${i + 1}, to do`} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {s.title}
                  {s.note && <span className="ml-2 rounded-full bg-change-soft px-2 py-0.5 text-xs font-medium text-change-ink">{s.note}</span>}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{s.body}</p>
              </div>
              <Link
                href={s.href}
                className="shrink-0 self-center text-sm font-medium text-brand underline-offset-4 hover:underline"
                aria-label={`${s.done ? "Open" : s.cta}: ${s.title}`}
              >
                {s.done ? "Open" : "Start"}
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
