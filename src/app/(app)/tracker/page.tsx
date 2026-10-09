import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { AddApplication } from "@/components/tracker/add-application";
import { Attention } from "@/components/tracker/attention";
import { Board } from "@/components/tracker/board";
import { requireUser } from "@/lib/auth/session";
import { dueForUser, listApplications } from "@/lib/tracker/repo";
import { resumeOptions } from "@/lib/tracker/options";
import { toView } from "@/lib/tracker/view";

export const metadata = { title: "Applications" };

export default async function TrackerPage() {
  const user = await requireUser();
  const now = new Date();
  const [apps, due, options] = await Promise.all([listApplications(user.id), dueForUser(user.id, now), resumeOptions(user.id)]);
  const nowIso = now.toISOString();
  const active = apps.filter((a) => ["applied", "screening", "interview"].includes(a.status)).length;
  const interviews = apps.filter((a) => a.status === "interview").length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Tracker"
        title="Your applications"
        description="Every application, the exact resume you sent, and a nudge when it’s time to follow up."
        actions={<AddApplication resumeOptions={options} />}
      />

      {apps.length === 0 ? (
        <EmptyState
          icon={<ClipboardList aria-hidden="true" />}
          title="No applications yet"
          description="Tailor a resume to a job and choose “Save to tracker”, or add an application you’ve already sent."
          action={<AddApplication resumeOptions={options} label="Add your first application" />}
        />
      ) : (
        <>
          <dl className="mb-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Stat label="Total" value={apps.length} />
            <Stat label="Waiting on a reply" value={active} />
            <Stat label="In interview" value={interviews} />
          </dl>
          {due.length > 0 && <div className="mb-8"><Attention items={due.map(toView)} now={nowIso} /></div>}
          <Board apps={apps.map(toView)} now={nowIso} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dd className="font-heading text-2xl text-ink">{value}</dd>
      <dt className="text-ink-muted">{label}</dt>
    </div>
  );
}
