import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TailorWorkspace } from "@/components/tailor/workspace";
import { requireUser } from "@/lib/auth/session";
import { getMasterResume, getVersionContent } from "@/lib/resume/repo";
import { getTailored } from "@/lib/tailor/repo";

export const metadata = { title: "Tailored resume" };

export default async function TailoredPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await getTailored(user.id, id);
  if (!view) notFound();

  const [master, base] = await Promise.all([getMasterResume(user.id), getVersionContent(user.id, view.baseMasterVersion)]);
  const parsed = view.job.parsed;

  return (
    <div className="page pt-6 md:pt-10">
      <Link href="/tailor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="size-4" aria-hidden="true" /> All tailored resumes</Link>
      <TailorWorkspace
        key={`${view.id}:${view.version}:${view.updatedAt.getTime()}`}
        id={view.id}
        variant={view.variant}
        version={view.version}
        job={{ title: view.job.title, company: view.job.company, location: view.job.location, url: view.job.url, requirements: parsed?.requirements ?? [], keywords: parsed?.keywords ?? [] }}
        content={view.content}
        masterContent={base ?? view.content}
        masterMoved={Boolean(master && master.version > view.baseMasterVersion)}
        changes={view.changes}
        gaps={view.gaps}
        analysis={view.analysis}
        matchScore={view.matchScore}
      />
    </div>
  );
}
