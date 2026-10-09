import Link from "next/link";
import { Compass, FileText } from "lucide-react";
import { GenerateRoles } from "@/components/roles/generate-roles";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/profile/repo";
import { getLatestInsights, insightsInputHash, type RoleInsights } from "@/lib/resume/insights";
import { getMasterResume } from "@/lib/resume/repo";
import { cn } from "@/lib/utils";

export const metadata = { title: "Roles you fit" };

type Role = RoleInsights["roles"][number];

export default async function RolesPage() {
  const user = await requireUser();
  const master = await getMasterResume(user.id);

  if (!master) {
    return (
      <div className="page">
        <PageHeader eyebrow="Roles" title="Roles you fit" />
        <EmptyState
          icon={<FileText aria-hidden="true" />}
          title="Upload a resume first"
          description="We find your best-fit and adjacent roles from the evidence in your master resume."
          action={<Button render={<Link href="/resume" />}>Upload resume</Button>}
        />
      </div>
    );
  }

  const profile = await getProfile(user.id);
  const latest = await getLatestInsights(master.id);
  const currentHash = insightsInputHash(master.content, profile.data);
  const stale = latest ? latest.hash !== currentHash : false;

  if (!latest) {
    return (
      <div className="page">
        <PageHeader eyebrow="Roles" title="Roles you fit" description="Your best-fit roles now, and adjacent roles one step away, each with the evidence from your resume and the gaps to close." />
        {!profile.completed && <ProfileNudge />}
        <EmptyState
          icon={<Compass aria-hidden="true" />}
          title="Ready when you are"
          description="We’ll read your master resume and your preferences, then suggest roles with honest fit estimates."
          action={<GenerateRoles label="Find my roles" />}
        />
      </div>
    );
  }

  const best = latest.data.roles.filter((r) => r.category === "best_fit");
  const adjacent = latest.data.roles.filter((r) => r.category === "adjacent");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Roles"
        title="Roles you fit"
        description={latest.data.positioning}
        actions={<GenerateRoles force label={stale ? "Refresh with latest changes" : "Re-run analysis"} variant={stale ? "default" : "outline"} />}
      />

      {stale && (
        <p className="mb-6 rounded-xl border border-change-line bg-change-soft p-4 text-sm text-change-ink">
          Your resume or profile changed since this analysis. Refresh to see up-to-date roles.
        </p>
      )}
      {!profile.completed && <ProfileNudge />}

      {latest.data.strengths.length > 0 && (
        <section aria-labelledby="strengths" className="mb-10">
          <h2 id="strengths" className="text-xl text-ink">Your strengths</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {latest.data.strengths.map((s) => (
              <li key={s} className="rounded-full bg-brand-soft px-3 py-1.5 text-sm text-brand-soft-ink">{s}</li>
            ))}
          </ul>
        </section>
      )}

      <RoleSection id="best" title="Best fit now" blurb="Roles you can credibly be hired into today." roles={best} />
      <RoleSection id="adjacent" title="Adjacent roles" blurb="One step away: a different specialism, level or domain." roles={adjacent} />

      <p className="mt-10 max-w-2xl text-sm text-ink-muted">
        Fit scores are estimates from your resume against typical postings, not guarantees. Tailoring a resume to a specific job comes next.
      </p>
    </div>
  );
}

function ProfileNudge() {
  return (
    <p className="mb-6 rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">
      Better matches with your goals, countries and visa needs.{" "}
      <Link href="/profile" className="font-medium text-brand underline underline-offset-4">Finish your profile</Link>
    </p>
  );
}

function RoleSection({ id, title, blurb, roles }: { id: string; title: string; blurb: string; roles: Role[] }) {
  if (roles.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mb-12">
      <h2 id={id} className="text-2xl text-ink">{title}</h2>
      <p className="mt-1 text-ink-muted">{blurb}</p>
      <ul className="mt-5 grid gap-5 md:grid-cols-2">
        {roles.map((r) => (
          <li key={r.title} className="flex flex-col rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-sans text-lg font-semibold text-ink">{r.title}</h3>
              <FitBadge score={r.fitScore} />
            </div>
            <p className="mt-3 text-[0.95rem] text-ink-muted">{r.whyFit}</p>
            {r.evidence.length > 0 && (
              <div className="mt-4">
                <p className="eyebrow">Evidence from your resume</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink marker:text-brand">
                  {r.evidence.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            )}
            {r.gaps.length > 0 && (
              <div className="mt-4 rounded-lg bg-change-soft p-3">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-change-ink">Gaps to close</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-change-ink">
                  {r.gaps.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            )}
            {r.searchKeywords.length > 0 && (
              <p className="mt-4 text-xs text-ink-muted">
                <span className="font-medium">Search for:</span> {r.searchKeywords.join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FitBadge({ score }: { score: number }) {
  const tone = score >= 75 ? "bg-success-soft text-success" : score >= 50 ? "bg-brand-soft text-brand-soft-ink" : "bg-surface-sunken text-ink-muted";
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", tone)} title="Estimated fit, 0–100">
      <span className="sr-only">Estimated fit </span>{score}
    </span>
  );
}
