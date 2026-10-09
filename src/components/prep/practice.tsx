"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Clock, Lightbulb, RotateCcw, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { submitAnswerAction } from "@/app/(app)/prep/actions";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABEL, MAX_ANSWER_CHARS, type Attempt, type PrepQuestion } from "@/lib/prep/schema";
import { cn } from "@/lib/utils";
import { FeedbackCard } from "./feedback-card";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const draftKey = (prepId: string, qId: string) => `jobsmith:draft:${prepId}:${qId}`;
const loadDraft = (prepId: string, qId: string) => {
  try { return localStorage.getItem(draftKey(prepId, qId)) ?? ""; } catch { return ""; }
};
const saveDraft = (prepId: string, qId: string, v: string) => {
  try {
    if (v) localStorage.setItem(draftKey(prepId, qId), v);
    else localStorage.removeItem(draftKey(prepId, qId));
  } catch { /* storage blocked */ }
};

/** One question at a time. Remounted (via key) for each question so the timer and draft start fresh. */
export function PracticeQuestion({ prepId, question, attempts, onAttempt, onNext, onBack }: {
  prepId: string;
  question: PrepQuestion;
  attempts: Attempt[];
  onAttempt: (a: Attempt) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [answer, setAnswer] = useState(() => loadDraft(prepId, question.id));
  const [seconds, setSeconds] = useState(0);
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const [viewing, setViewing] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (result) return; // stop the clock once answered
    startedAt.current ??= Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(t);
  }, [result]);

  const shown = viewing ?? result;
  const mine = attempts.filter((a) => a.questionId === question.id).slice().reverse();
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  function submit() {
    setError(null);
    start(async () => {
      const r = await submitAnswerAction({ prepId, questionId: question.id, answer, seconds });
      if (!r.ok) { setError(r.message); return; }
      saveDraft(prepId, question.id, "");
      setResult(r.attempt);
      onAttempt(r.attempt);
    });
  }

  function again() {
    setResult(null);
    setViewing(null);
    setAnswer("");
    setSeconds(0);
    startedAt.current = null; // restarted by the effect
    setHint(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-brand-soft px-2.5 py-1 font-medium text-brand-soft-ink">{CATEGORY_LABEL[question.category]}</span>
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-ink-muted">{question.difficulty}</span>
        {!shown && <span className="ml-auto inline-flex items-center gap-1 text-ink-muted" aria-label={`Time spent: ${fmtTime(seconds)}`}><Clock className="size-3.5" aria-hidden="true" /> {fmtTime(seconds)}</span>}
      </div>
      <h3 className="mt-3 font-heading text-2xl leading-snug text-ink sm:text-3xl">{question.question}</h3>

      {!shown ? (
        <div className="mt-5">
          <Label htmlFor="answer" className="mb-1.5 block text-sm font-medium text-ink">Your answer</Label>
          <Textarea
            id="answer" rows={10} value={answer} maxLength={MAX_ANSWER_CHARS}
            onChange={(e) => { setAnswer(e.target.value); saveDraft(prepId, question.id, e.target.value); }}
            placeholder={question.category === "behavioural" ? "Answer out loud first if you can, then type it. Use a real story: Situation, Task, Action, Result." : "Answer as you would in the interview."}
          />
          <p className="mt-1.5 flex justify-between text-xs text-ink-muted"><span>{words} words · a spoken answer is usually 150–300 words</span><span>{answer.length}/{MAX_ANSWER_CHARS}</span></p>

          {hint && <p className="mt-3 rounded-xl bg-brand-soft p-3 text-sm text-brand-soft-ink"><span className="font-medium">What they’re probing:</span> {question.why}</p>}
          {error && <ErrorState className="mt-4" message={error} />}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="lg" className="h-11 px-5 text-base" disabled={pending || answer.trim().length < 15} onClick={submit}>{pending ? "Scoring your answer…" : "Get feedback"}</Button>
            <Button variant="ghost" disabled={pending} onClick={() => setHint(true)}><Lightbulb data-icon="inline-start" aria-hidden="true" /> Hint</Button>
            <Button variant="ghost" disabled={pending} onClick={onNext}><SkipForward data-icon="inline-start" aria-hidden="true" /> Skip</Button>
          </div>
          {pending && <p role="status" className="mt-3 text-sm text-ink-muted">Reading your answer against the question and your resume. A few seconds.</p>}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl bg-paper p-4">
            <p className="eyebrow">Your answer{viewing ? ` · ${fmtDate.format(new Date(viewing.at))}` : ""}</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[0.95rem] text-ink">{shown.answer}</p>
            {shown.seconds !== null && <p className="mt-2 text-xs text-ink-muted">Took {fmtTime(shown.seconds)}</p>}
          </div>
          {shown.feedback && <FeedbackCard feedback={shown.feedback} category={question.category} keyPoints={question.keyPoints} />}
          <div className="flex flex-wrap gap-2">
            <Button onClick={again}><RotateCcw data-icon="inline-start" aria-hidden="true" /> Try again</Button>
            <Button variant="outline" onClick={onNext}>Next question <ArrowRight data-icon="inline-end" aria-hidden="true" /></Button>
            <Button variant="ghost" onClick={onBack}>Back to questions</Button>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <details className="mt-8 rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">Your earlier attempts ({mine.length})</summary>
          <ul className="mt-3 divide-y divide-line">
            {mine.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink-muted">{fmtDate.format(new Date(a.at))}</span>
                <span className={cn("font-medium", (a.feedback?.overall ?? 0) >= 4 ? "text-success" : "text-ink")}>{a.feedback ? `${a.feedback.overall.toFixed(1)} / 5` : "no score"}</span>
                <Button size="sm" variant="ghost" onClick={() => { setViewing(a); toast.message("Showing an earlier attempt"); }}>View</Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
