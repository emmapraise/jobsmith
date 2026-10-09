import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PrepWorkspace } from "@/components/prep/workspace";
import { requireUser } from "@/lib/auth/session";
import { resolvePrepResume } from "@/lib/prep/context";
import { getPrep } from "@/lib/prep/repo";

export const metadata = { title: "Interview prep" };
export const maxDuration = 120;

export default async function PrepWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const prep = await getPrep(user.id, id);
  if (!prep) notFound();

  // Names for the "draw on this experience" chips (the resume the questions were written against).
  const resume = await resolvePrepResume(user.id, prep.jobId);
  const refNames: Record<string, string> = {};
  for (const e of resume?.content.experience ?? []) refNames[e.id] = [e.title, e.company].filter(Boolean).join(" at ");
  for (const p of resume?.content.projects ?? []) refNames[p.id] = p.name;

  return (
    <div className="page">
      <Link href="/prep" className="mt-6 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink md:mt-10"><ArrowLeft className="size-4" aria-hidden="true" /> All prep packs</Link>
      <PageHeader className="pt-4 md:pt-4" eyebrow="Interview prep" title={prep.title || "Untitled role"} description={[prep.company, prep.location].filter(Boolean).join(" · ")}
        actions={prep.applicationId ? <Link href={`/tracker/${prep.applicationId}`} className="text-sm font-medium text-brand underline underline-offset-4">Open application</Link> : undefined} />
      <PrepWorkspace key={`${prep.id}:${prep.data.generatedAt}`} prepId={prep.id} jobId={prep.jobId} data={prep.data} refNames={refNames} generatedLabel={prep.data.basis.resume} />
    </div>
  );
}
