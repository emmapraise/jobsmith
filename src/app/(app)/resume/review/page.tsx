import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ResumeEditor } from "@/components/resume/resume-editor";
import { requireUser } from "@/lib/auth/session";
import { getMasterResume } from "@/lib/resume/repo";

export const metadata = { title: "Review your resume" };

export default async function ReviewPage() {
  const user = await requireUser();
  const master = await getMasterResume(user.id);
  if (!master) redirect("/resume");

  return (
    <div className="page max-w-4xl">
      <PageHeader
        eyebrow="Review"
        title="Check what we read"
        description="This is the structured version of your resume, and it’s the source of truth for everything Jobsmith generates. Correct anything that’s wrong."
      />
      <ResumeEditor key={master.version} initial={master.content} alreadyReviewed={master.reviewed} />
    </div>
  );
}
