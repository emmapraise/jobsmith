import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { QaConversation, QaReview, QaStart, type QaView } from "@/components/resume/qa-flow";
import { requireUser } from "@/lib/auth/session";
import { changeSchema } from "@/lib/resume/apply-change";
import { getOpenQa, lastCompletedQaAt } from "@/lib/resume/qa-repo";
import { getMasterResume } from "@/lib/resume/repo";

export const metadata = { title: "Update your resume" };

export default async function UpdatePage() {
  const user = await requireUser();
  const master = await getMasterResume(user.id);
  if (!master) redirect("/resume");
  const [open, last] = await Promise.all([getOpenQa(user.id), lastCompletedQaAt(user.id)]);

  let view: QaView | null = null;
  if (open) {
    view = {
      id: open.id,
      status: open.status === "review" ? "review" : "active",
      questions: open.questions,
      answers: open.answers,
      changes: open.proposedChanges.flatMap((c) => {
        const p = changeSchema.safeParse(c.patch);
        return p.success ? [{ id: c.id, description: c.description, reason: c.reason, patch: p.data, decision: c.decision }] : [];
      }),
    };
  }

  const title = !view ? "Bring your resume up to date" : view.status === "review" ? "Review suggested changes" : "A few quick questions";

  return (
    <div className="page">
      <PageHeader eyebrow="Update" title={title} />
      {!view && <QaStart hasPrevious={Boolean(last)} />}
      {view?.status === "active" && view.questions.length > 0 && <QaConversation key={view.id} qa={view} />}
      {view?.status === "review" && <QaReview key={view.id} qa={view} />}
    </div>
  );
}
