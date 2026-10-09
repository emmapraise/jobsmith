import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApplicationDetail } from "@/components/tracker/detail";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { resumeOptions } from "@/lib/tracker/options";
import { getApplication, getEvents } from "@/lib/tracker/repo";
import { STAGE_LABEL } from "@/lib/tracker/stages";
import { toView } from "@/lib/tracker/view";

export const metadata = { title: "Application" };

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [app, events, options] = await Promise.all([getApplication(user.id, id), getEvents(user.id, id), resumeOptions(user.id)]);
  if (!app) notFound();

  return (
    <div className="page">
      <Link href="/tracker" className="mt-6 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink md:mt-10"><ArrowLeft className="size-4" aria-hidden="true" /> All applications</Link>
      <PageHeader
        className="pt-4 md:pt-4"
        eyebrow={STAGE_LABEL[app.status]}
        title={app.title || "Untitled role"}
        description={[app.company, app.location].filter(Boolean).join(" · ")}
      />
      <ApplicationDetail
        key={`${app.id}:${app.statusChangedAt.getTime()}:${app.nextFollowUpAt?.getTime() ?? 0}:${app.appliedAt?.getTime() ?? 0}:${app.notes}`}
        app={toView(app)}
        events={events.map((e) => ({ from: e.from as never, to: e.to as never, at: e.at.toISOString() }))}
        resumeOptions={options}
        now={new Date().toISOString()}
      />
    </div>
  );
}
