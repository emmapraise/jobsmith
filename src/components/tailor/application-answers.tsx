"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { draftAnswersAction } from "@/app/(app)/tailor/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Questions the application form asks, with answers drafted from your resume. You edit and copy; nothing is sent anywhere. */
export function ApplicationAnswers({ tailoredId, questions, answers }: { tailoredId: string; questions: string[]; answers: { question: string; answer: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const drafted = new Map(answers.map((a) => [a.question, a.answer]));
  const value = (q: string) => edits[q] ?? drafted.get(q) ?? "";

  return (
    <section aria-labelledby="app-questions" className="mt-8 rounded-xl border border-line bg-surface p-4">
      <h3 id="app-questions" className="font-sans text-base font-semibold text-ink">Application questions ({questions.length})</h3>
      <p className="mt-1 text-sm text-ink-muted">This application asks these. Leave a box empty and we’ll draft it from your resume and profile. Type your own answer or rough notes and we’ll reword it to fit the question and the job. Fill in any [bracketed] parts yourself.</p>
      <Button className="mt-3" variant={answers.length ? "outline" : "default"} disabled={pending} onClick={() => start(async () => {
        const typed = Object.fromEntries(Object.entries(edits).filter(([, v]) => v.trim()));
        const r = await draftAnswersAction(tailoredId, typed);
        if (!r.ok) toast.error(r.message);
        else { setEdits({}); router.refresh(); }
      })}>
        {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <Sparkles data-icon="inline-start" aria-hidden="true" />}
        {Object.values(edits).some((v) => v.trim()) ? "Draft empty ones, polish mine" : answers.length ? "Redraft answers" : "Draft answers"}
      </Button>
      <ul className="mt-4 space-y-4">
        {questions.map((q, i) => (
          <li key={q}>
            <label htmlFor={`aq-${i}`} className="block text-sm font-medium text-ink">{q}</label>
            {drafted.has(q) && !value(q) && <p className="mt-1 text-sm text-ink-muted">We couldn’t draft this without adding details your resume doesn’t show. Write it yourself.</p>}
            <Textarea id={`aq-${i}`} rows={5} className="mt-1.5" value={value(q)} onChange={(e) => setEdits((d) => ({ ...d, [q]: e.target.value }))} placeholder="Empty: we’ll draft it. Or type your answer or notes and we’ll reword it." />
            <Button size="sm" variant="outline" className="mt-1.5" disabled={!value(q)} onClick={() => navigator.clipboard.writeText(value(q)).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"))}>
              <Copy data-icon="inline-start" aria-hidden="true" /> Copy
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
