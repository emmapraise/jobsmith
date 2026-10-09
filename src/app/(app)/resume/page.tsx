import Link from "next/link";
import { Briefcase, GraduationCap, MessageCircleQuestion, PencilLine, Wrench } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { UploadResume } from "@/components/resume/upload-resume";
import { ReplaceUpload } from "@/components/resume/replace-upload";
import { VersionHistory } from "@/components/resume/version-history";
import { ExportMaster } from "@/components/resume/export-master";
import { OriginalDownload } from "@/components/resume/original-download";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { reviewFlags } from "@/lib/resume/checks";
import { getMasterResume, listVersions } from "@/lib/resume/repo";

export const metadata = { title: "Master resume" };

export default async function ResumePage() {
  const user = await requireUser();
  const master = await getMasterResume(user.id);

  if (!master) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Master resume"
          title="Start with one resume"
          description="Upload your most complete resume. Everything Jobsmith does is built from it, and we never add anything you haven’t told us."
        />
        <div className="max-w-2xl">
          <UploadResume />
        </div>
      </div>
    );
  }

  const versions = await listVersions(user.id);
  const flags = reviewFlags(master.content);
  const c = master.content;
  const needsFix = flags.filter((f) => f.severity === "fix").length;
  const skillCount = c.skills.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Master resume"
        title={c.contact.fullName || "Your master resume"}
        description={c.contact.headline || "Your single source of truth. Every tailored version is derived from this."}
        actions={
          <>
            <Button variant="outline" render={<Link href="/resume/review" />}>
              <PencilLine data-icon="inline-start" aria-hidden="true" /> Review &amp; edit
            </Button>
            <Button render={<Link href="/resume/update" />}>
              <MessageCircleQuestion data-icon="inline-start" aria-hidden="true" /> Update with questions
            </Button>
          </>
        }
      />

      {!master.reviewed && (
        <div className="mb-6 rounded-xl border border-change-line bg-change-soft p-4 text-change-ink">
          <p className="font-medium">Not reviewed yet</p>
          <p className="mt-1 text-sm">
            Check what we read from your file before you rely on it.{" "}
            <Link href="/resume/review" className="font-medium underline underline-offset-4">
              Review now
            </Link>
          </p>
        </div>
      )}
      {needsFix > 0 && (
        <p className="mb-6 text-sm text-ink-muted">
          {needsFix} thing{needsFix === 1 ? "" : "s"} to fix in your resume.{" "}
          <Link href="/resume/review" className="font-medium text-brand underline underline-offset-4">
            See what
          </Link>
        </p>
      )}

      <section aria-label="Resume summary" className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Briefcase aria-hidden="true" />} label="Roles" value={c.experience.length} />
        <Stat icon={<GraduationCap aria-hidden="true" />} label="Education" value={c.education.length} />
        <Stat icon={<Wrench aria-hidden="true" />} label="Skills listed" value={skillCount} />
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <h2 className="text-xl text-ink">Latest roles</h2>
          {c.experience.length === 0 ? (
            <p className="mt-3 text-ink-muted">No roles found yet. Open the editor to add them.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
              {c.experience.slice(0, 4).map((e) => (
                <li key={e.id} className="p-4 sm:p-5">
                  <p className="font-medium text-ink">{e.title || "Untitled role"}</p>
                  <p className="text-sm text-ink-muted">
                    {[e.company, e.location].filter(Boolean).join(" · ")}
                    {e.start && ` · ${e.start} – ${e.current ? "Present" : e.end || "?"}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-8">
          <div>
            <h2 className="text-xl text-ink">Your files</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {master.sourceFileName ? <>Original: <span className="text-ink">{master.sourceFileName}</span></> : "No original file on record."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {master.sourceFileName && <OriginalDownload />}
              <ReplaceUpload />
            </div>
          </div>
          <div>
            <h2 className="text-xl text-ink">Export</h2>
            <ExportMaster />
          </div>
          <div>
            <h2 className="text-xl text-ink">Version history</h2>
            <VersionHistory versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))} current={master.version} />
          </div>
        </aside>
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand [&_svg]:size-5">{icon}</div>
      <div>
        <p className="font-heading text-2xl text-ink">{value}</p>
        <p className="text-sm text-ink-muted">{label}</p>
      </div>
    </div>
  );
}
