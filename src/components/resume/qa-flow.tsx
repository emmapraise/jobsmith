"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { abandonQaAction, answerQuestionAction, applyQaAction, decideChangeAction, finishQuestionsAction, startQaAction } from "@/app/(app)/resume/actions";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Change } from "@/lib/resume/apply-change";
import { cn } from "@/lib/utils";

export type QaView = {
  id: string;
  status: "active" | "review";
  questions: { id: string; question: string; why: string; kind: "text" | "yes_no" | "choice"; choices?: string[] }[];
  answers: { questionId: string; answer: string; skipped: boolean }[];
  changes: { id: string; description: string; reason: string; patch: Change; decision: "pending" | "accepted" | "rejected" }[];
};

/* ───────────── Intro / start ───────────── */

export function QaStart({ hasPrevious }: { hasPrevious: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-title text-ink">{hasPrevious ? "Another quick refresh?" : "A short chat to bring it up to date"}</h2>
        <ul className="mt-5 space-y-3 text-ink-muted">
          <li className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" /> About 5 questions, one at a time, based on your actual resume.</li>
          <li className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" /> Skip anything. You can stop and come back.</li>
          <li className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" /> Nothing changes until you review each suggested edit and accept it.</li>
        </ul>
        <Button
          size="lg"
          className="mt-8 h-11 px-5 text-base"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await startQaAction();
              if (r.ok) router.refresh();
              else setError({ message: r.message, code: r.code });
            });
          }}
        >
          {pending ? <><Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> Preparing your questions…</> : <>Start <ArrowRight data-icon="inline-end" aria-hidden="true" /></>}
        </Button>
        {pending && <p role="status" className="mt-3 text-sm text-ink-muted">Reading your resume to decide what to ask. This takes 10–20 seconds.</p>}
      </div>
      {error && <ErrorState className="mt-4" title={error.code === "no_questions" ? "Nothing to ask right now" : "Couldn’t start"} message={error.message} />}
    </div>
  );
}

/* ───────────── The conversation ───────────── */

export function QaConversation({ qa }: { qa: QaView }) {
  const router = useRouter();
  const total = qa.questions.length;
  const [answers, setAnswers] = useState(qa.answers);
  const answered = new Map(answers.map((a) => [a.questionId, a]));
  const firstOpen = qa.questions.findIndex((q) => !answered.has(q.id));
  const [index, setIndex] = useState(firstOpen === -1 ? total - 1 : firstOpen);
  const [saving, startSave] = useTransition();
  const [finishing, startFinish] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const q = qa.questions[index];
  const prev = answered.get(q.id);
  const [choice, setChoice] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load saved answer into local fields when the question changes.
  if (loadedFor !== q.id) {
    setLoadedFor(q.id);
    const a = prev && !prev.skipped ? prev.answer : "";
    if (q.kind === "text") {
      setChoice("");
      setText(a);
    } else {
      const opts = q.kind === "yes_no" ? ["Yes", "No"] : (q.choices ?? []);
      const hit = opts.find((o) => a === o || a.startsWith(`${o} — `));
      setChoice(hit ?? "");
      setText(hit && a.length > hit.length ? a.slice(hit.length + 3) : "");
    }
  }

  const isLast = index === total - 1;
  const composed = q.kind === "text" ? text.trim() : choice ? (text.trim() ? `${choice} — ${text.trim()}` : choice) : text.trim();
  const canNext = composed.length > 0;
  const answeredCount = answers.filter((a) => !a.skipped).length;

  function go(next: number) {
    setIndex(next);
    setError(null);
    setTimeout(() => headingRef.current?.focus(), 0);
  }

  function submit(skipped: boolean) {
    setError(null);
    startSave(async () => {
      const r = await answerQuestionAction({ qaId: qa.id, questionId: q.id, answer: skipped ? "" : composed, skipped });
      if (!r.ok) return setError(r.message);
      // Mirror locally so Back/Next reflect it without waiting for a refresh.
      setAnswers((prev) => [...prev.filter((a) => a.questionId !== q.id), { questionId: q.id, answer: skipped ? "" : composed, skipped }]);
      if (!isLast) return go(index + 1);
      startFinish(async () => {
        const f = await finishQuestionsAction(qa.id);
        if (!f.ok) return setError(f.message);
        router.refresh();
      });
    });
  }

  const busy = saving || finishing;

  if (finishing) {
    return (
      <div role="status" aria-live="polite" className="max-w-2xl rounded-2xl border border-line bg-surface p-8 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-brand" aria-hidden="true" />
        <p className="mt-4 font-medium text-ink">Working out what to update…</p>
        <p className="mt-1 text-sm text-ink-muted">We’ll show every suggested edit with its reason. Nothing is applied yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between text-sm text-ink-muted">
        <span aria-live="polite">Question {index + 1} of {total}</span>
        <span>{answeredCount} answered</span>
      </div>
      <Progress value={((index + 1) / total) * 100} aria-label={`Question ${index + 1} of ${total}`} />

      <section aria-labelledby="q" className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 id="q" ref={headingRef} tabIndex={-1} className="text-title text-ink outline-none">{q.question}</h2>
        <p className="mt-3 text-sm text-ink-muted"><span className="font-medium text-ink">Why we’re asking:</span> {q.why}</p>

        <div className="mt-6 space-y-4">
          {q.kind !== "text" && (
            <RadioGroup value={choice} onValueChange={(v) => setChoice(String(v))} aria-label="Your answer" className="gap-2">
              {(q.kind === "yes_no" ? ["Yes", "No"] : (q.choices ?? [])).map((o) => (
                <Label key={o} htmlFor={`o-${q.id}-${o}`} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border border-line-strong px-4 py-3 text-base text-ink", choice === o && "border-brand bg-brand-soft")}>
                  <RadioGroupItem id={`o-${q.id}-${o}`} value={o} /> {o}
                </Label>
              ))}
            </RadioGroup>
          )}
          <div>
            <Label htmlFor="answer" className={cn("mb-1.5 block text-sm font-medium text-ink", q.kind === "text" && "sr-only")}>
              {q.kind === "text" ? "Your answer" : "Add detail (optional)"}
            </Label>
            <Textarea id="answer" rows={q.kind === "text" ? 5 : 3} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder={q.kind === "text" ? "Type your answer…" : ""} />
            <p className="mt-1.5 text-xs text-ink-muted">Only facts you state here are used. We never fill gaps with guesses.</p>
          </div>
        </div>

        {error && <ErrorState className="mt-5" message={error} />}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Button variant="ghost" disabled={index === 0 || busy} onClick={() => go(index - 1)}>
            <ArrowLeft data-icon="inline-start" aria-hidden="true" /> Back
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => submit(true)}>
              <SkipForward data-icon="inline-start" aria-hidden="true" /> Skip
            </Button>
            <Button disabled={!canNext || busy} onClick={() => submit(false)}>
              {saving ? "Saving…" : isLast ? "Finish" : "Next"} {!saving && <ArrowRight data-icon="inline-end" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="mt-5 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
        onClick={async () => {
          await abandonQaAction(qa.id);
          router.refresh();
        }}
      >
        Stop and discard this conversation
      </button>
    </div>
  );
}

/* ───────────── Review proposed changes ───────────── */

function preview(c: Change): string[] {
  switch (c.op) {
    case "add_bullet":
    case "replace_bullet":
    case "set_summary":
    case "set_headline":
      return c.text ? [c.text] : [];
    case "add_skills":
      return [c.items.join(", ")];
    case "set_role_end":
      return [`End date: ${c.text}`];
    case "mark_role_current":
      return ["Marked as your current role"];
    case "add_experience":
      return c.role ? [`${c.role.title} at ${c.role.company} (${c.role.start || "?"} – ${c.role.current ? "Present" : c.role.end || "?"})`, ...(c.text ? [c.text] : [])] : [];
    case "add_certification":
      return c.cert ? [`${c.cert.name}${c.cert.issuer ? `, ${c.cert.issuer}` : ""}${c.cert.date ? ` (${c.cert.date})` : ""}`] : [];
  }
}

export function QaReview({ qa }: { qa: QaView }) {
  const router = useRouter();
  const [decisions, setDecisions] = useState(() => Object.fromEntries(qa.changes.map((c) => [c.id, c.decision])));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const accepted = Object.values(decisions).filter((d) => d === "accepted").length;
  const undecided = Object.values(decisions).filter((d) => d === "pending").length;

  function decide(id: string, d: "accepted" | "rejected") {
    const before = decisions[id];
    const next = before === d ? "pending" : d;
    setDecisions((s) => ({ ...s, [id]: next }));
    decideChangeAction(qa.id, id, next).then((r) => {
      if (!r.ok) {
        setDecisions((s) => ({ ...s, [id]: before }));
        toast.error(r.message);
      }
    });
  }

  function setAll(d: "accepted" | "rejected") {
    for (const c of qa.changes) if (decisions[c.id] !== d) decide(c.id, d);
  }

  return (
    <div className="max-w-3xl">
      <p className="text-ink-muted">
        Here’s what we’d change, based only on your answers. Each edit has a reason. Accept the ones you want; reject the rest.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setAll("accepted")}>Accept all</Button>
        <Button size="sm" variant="outline" onClick={() => setAll("rejected")}>Reject all</Button>
      </div>

      <ul className="mt-6 space-y-4">
        {qa.changes.map((c) => {
          const d = decisions[c.id];
          return (
            <li key={c.id} className={cn("rounded-2xl border bg-surface p-5 transition-colors", d === "accepted" && "border-success/50", d === "rejected" && "border-line opacity-70", d === "pending" && "border-line")}>
              <p className="font-medium text-ink">{c.description}</p>
              <div className="mt-3 space-y-1.5 text-[0.95rem] leading-relaxed">
                {preview(c.patch).map((line, i) => (
                  <p key={i}><span className="changed">{line}</span></p>
                ))}
              </div>
              <p className="mt-3 text-sm text-ink-muted"><span className="font-medium text-ink">Why:</span> {c.reason}</p>
              <div className="mt-4 flex gap-2" role="group" aria-label={`Decision for: ${c.description}`}>
                <Button className="h-10 px-4" variant={d === "accepted" ? "default" : "outline"} aria-pressed={d === "accepted"} onClick={() => decide(c.id, "accepted")}>
                  <Check data-icon="inline-start" aria-hidden="true" /> Accept
                </Button>
                <Button className="h-10 px-4" variant={d === "rejected" ? "secondary" : "outline"} aria-pressed={d === "rejected"} onClick={() => decide(c.id, "rejected")}>
                  <X data-icon="inline-start" aria-hidden="true" /> Reject
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <ErrorState className="mt-5" message={error} />}

      <div className="sticky bottom-20 mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 p-4 shadow-pop backdrop-blur md:bottom-6">
        <p className="mr-auto text-sm text-ink-muted" role="status">
          {accepted} accepted{undecided ? ` · ${undecided} undecided (won’t be applied)` : ""}
        </p>
        <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await abandonQaAction(qa.id); router.refresh(); })}>
          Discard
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await applyQaAction(qa.id);
              if (!r.ok) return setError(r.message);
              toast.success(r.applied ? `Applied ${r.applied} change${r.applied === 1 ? "" : "s"}` : "Nothing was changed");
              router.push("/resume");
              router.refresh();
            })
          }
        >
          {pending ? "Applying…" : accepted ? `Apply ${accepted} change${accepted === 1 ? "" : "s"}` : "Finish without changes"}
        </Button>
      </div>
    </div>
  );
}
