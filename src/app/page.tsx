import Link from "next/link";
import { ArrowRight, Check, FileSearch, Lock, ShieldCheck, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

const steps = [
  { n: "01", title: "Upload one master resume", body: "PDF or DOCX. We read it into clean, editable sections. You fix anything we got wrong." },
  { n: "02", title: "Answer a few short questions", body: "One at a time. We learn what changed since you last updated it, and what you want next." },
  { n: "03", title: "See the roles you fit", body: "Best-fit and adjacent roles, with the evidence from your own resume and the gaps to close." },
  { n: "04", title: "Tailor to any job", body: "Paste a link or description. Every edit comes with a reason, and you accept or reject each one." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const [user, { deleted }] = await Promise.all([getCurrentUser(), searchParams]);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="page flex h-16 items-center justify-between">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Account">
          {user ? (
            <Button render={<Link href="/dashboard" />}>Open Jobsmith</Button>
          ) : (
            <Button variant="ghost" render={<Link href="/sign-in" />}>
              Sign in
            </Button>
          )}
        </nav>
      </header>

      <main id="main" className="flex-1">
        {deleted === "1" && (
          <div role="status" className="page">
            <p className="rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-ink">
              Your account and all of its data have been permanently deleted.
            </p>
          </div>
        )}
        {/* Hero */}
        <section className="page grid gap-12 pb-20 pt-10 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div>
            <p className="eyebrow mb-5">Free · for tech people applying worldwide</p>
            <h1 className="text-display text-ink">
              A resume that fits the job,
              <br />
              <em className="font-normal text-brand">without a single invented line.</em>
            </h1>
            <p className="prose-measure mt-6 text-lg text-ink-muted">
              Jobsmith keeps one master resume, shows you the roles you genuinely fit, and rewrites it for each job using only
              facts you gave us. Anything the job asks for that you haven&apos;t shown becomes a question, never a guess.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" className="h-11 px-5 text-base" render={<Link href={user ? "/dashboard" : "/sign-in"} />}>
                {user ? "Continue" : "Get started — it’s free"} <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
              <p className="text-sm text-ink-muted">No card. No payments code at all.</p>
            </div>
          </div>

          <DiffCard />
        </section>

        {/* Principles */}
        <section className="border-y border-line bg-surface">
          <div className="page grid gap-10 py-14 md:grid-cols-3">
            <Principle icon={<ShieldCheck aria-hidden="true" />} title="Truthful by construction">
              Tailoring may only use facts in your profile. Missing skills are flagged as gaps and turned into questions for you.
            </Principle>
            <Principle icon={<FileSearch aria-hidden="true" />} title="Every change explained">
              Each AI edit shows a short reason. Accept or reject them one by one; nothing is applied behind your back.
            </Principle>
            <Principle icon={<Lock aria-hidden="true" />} title="Your data stays yours">
              Encrypted in transit, never used to train models, never written to logs, and fully deletable in one click.
            </Principle>
          </div>
        </section>

        {/* How it works */}
        <section className="page py-20">
          <h2 className="text-title max-w-xl text-ink">From one upload to a tailored application</h2>
          <ol className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-5 border-t border-line pt-6">
                <span className="font-heading text-2xl text-brand" aria-hidden="true">
                  {s.n}
                </span>
                <div>
                  <h3 className="text-lg text-ink">{s.title}</h3>
                  <p className="mt-1.5 text-ink-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="page flex flex-col gap-2 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Jobsmith. Free to use.</p>
          <p>We never sell your data or use it to train AI models.</p>
        </div>
      </footer>
    </div>
  );
}

function Principle({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand [&_svg]:size-5">{icon}</div>
      <h3 className="text-lg text-ink">{title}</h3>
      <p className="mt-2 text-ink-muted">{children}</p>
    </div>
  );
}

/** Static illustration of the core promise: a change with a reason, and an honest gap. */
function DiffCard() {
  return (
    <div aria-label="Example of a tailoring suggestion" role="img" className="relative">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-pop sm:p-6">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Backend Engineer · Acme</p>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-soft-ink">Match 82</span>
        </div>

        <div className="mt-5 space-y-3 text-[0.95rem] leading-relaxed">
          <p className="text-ink-muted line-through decoration-line-strong">Worked on APIs for the payments team.</p>
          <p className="text-ink">
            <span className="changed">Built and maintained Node.js payment APIs serving 40k daily users</span> for the payments team.
          </p>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          <span className="font-medium text-ink">Why:</span> the job asks for Node.js API experience; your master resume states the 40k figure.
        </p>
        <div className="mt-4 flex gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft px-3 py-1.5 text-sm font-medium text-success">
            <Check className="size-4" aria-hidden="true" /> Accept
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-ink-muted">
            <X className="size-4" aria-hidden="true" /> Reject
          </span>
        </div>
      </div>

      <div className="-mt-3 ml-6 rounded-xl border border-change-line bg-change-soft p-4 shadow-card sm:ml-10">
        <p className="text-sm font-medium text-change-ink">Gap — not added to your resume</p>
        <p className="mt-1 text-sm text-change-ink">
          The job mentions Kubernetes. It isn&apos;t in your profile. Have you used it? We&apos;ll only add it if you tell us.
        </p>
      </div>
    </div>
  );
}
