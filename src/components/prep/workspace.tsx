"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createPrepAction, deletePrepAction, resetPracticeAction } from "@/app/(app)/prep/actions";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { progressByQuestion } from "@/lib/prep/build";
import type { Attempt, PrepData } from "@/lib/prep/schema";
import { cn } from "@/lib/utils";
import { BriefPanel } from "./brief";
import { PracticeQuestion } from "./practice";
import { QuestionList, type CategoryFilter } from "./question-list";

type Tab = "questions" | "practice" | "brief";

export function PrepWorkspace({ prepId, jobId, data, refNames, generatedLabel }: { prepId: string; jobId: string; data: PrepData; refNames: Record<string, string>; generatedLabel: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("questions");
  const [attempts, setAttempts] = useState<Attempt[]>(data.attempts);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const progress = progressByQuestion(attempts);
  const practised = data.questions.filter((q) => progress.has(q.id)).length;
  const scores = [...progress.values()].map((p) => p.best).filter((x): x is number => x !== null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const pool = () => data.questions.filter((q) => filter === "all" || q.category === filter);
  function nextFrom(afterId: string | null) {
    const list = pool();
    const unpractised = list.filter((q) => !progress.has(q.id) && q.id !== afterId);
    return (unpractised[0] ?? list.find((q) => q.id !== afterId) ?? list[0])?.id ?? null;
  }
  const practise = (id: string | null) => { setCurrent(id); setTab("practice"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const question = data.questions.find((q) => q.id === current) ?? null;

  const tabs: [Tab, string][] = [["questions", `Questions (${data.questions.length})`], ["practice", "Practise"], ["brief", "Company brief"]];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface p-4 text-sm">
        <div><span className="font-heading text-2xl text-ink">{practised}</span><span className="text-ink-muted"> of {data.questions.length} practised</span></div>
        {avg !== null && <div><span className="font-heading text-2xl text-ink">{avg.toFixed(1)}</span><span className="text-ink-muted"> average best score</span></div>}
        <p className="basis-full text-xs text-ink-muted sm:ml-auto sm:basis-auto">Based on: {generatedLabel}</p>
      </div>

      <div role="tablist" aria-label="Prep sections" className="mt-5 flex gap-1 rounded-xl border border-line bg-surface p-1">
        {tabs.map(([t, l]) => (
          <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => { setTab(t); if (t === "practice" && !current) setCurrent(nextFrom(null)); }}
            className={cn("flex-1 rounded-lg px-2 py-2 text-sm font-medium", tab === t ? "bg-brand-soft text-brand-soft-ink" : "text-ink-muted hover:text-ink")}>{l}</button>
        ))}
      </div>

      <div className="mt-6" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "questions" && <QuestionList questions={data.questions} attempts={attempts} filter={filter} onFilter={setFilter} onPractice={practise} refNames={refNames} />}

        {tab === "practice" && (
          question ? (
            <PracticeQuestion key={question.id} prepId={prepId} question={question} attempts={attempts}
              onAttempt={(a) => setAttempts((prev) => [...prev, a])}
              onNext={() => setCurrent(nextFrom(question.id))}
              onBack={() => setTab("questions")} />
          ) : (
            <p className="text-ink-muted">No questions in this category.</p>
          )
        )}

        {tab === "brief" && <BriefPanel prepId={prepId} brief={data.brief} companyUrl={data.basis.companyUrl} />}
      </div>

      <div className="mt-12 flex flex-wrap gap-2 border-t border-line pt-6">
        {attempts.length > 0 && (
          <Button variant="outline" disabled={busy} onClick={() => start(async () => { const r = await resetPracticeAction(prepId); if (r.ok) { setAttempts([]); toast.success("Practice history cleared"); } else toast.error(r.message); })}>Clear practice history</Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" />}><RefreshCw data-icon="inline-start" aria-hidden="true" /> Regenerate questions</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate the questions?</AlertDialogTitle>
              <AlertDialogDescription>You’ll get a fresh set of questions and brief, and your practice history for the current ones is removed.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button onClick={() => start(async () => { const r = await createPrepAction({ jobId }); if (r.ok) { toast.success("New questions ready"); router.refresh(); window.location.reload(); } else toast.error(r.message); })}>{busy ? "Working…" : "Regenerate"}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}><Trash2 data-icon="inline-start" aria-hidden="true" /> Delete this prep</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this prep pack?</AlertDialogTitle>
              <AlertDialogDescription>The questions, your practice answers and feedback are removed. Your application and resumes are not affected.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={async () => { const r = await deletePrepAction(prepId); if (r.ok) router.push("/prep"); else toast.error(r.message); }}>Delete</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
