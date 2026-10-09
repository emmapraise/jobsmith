"use client";

import { ChevronDown, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { progressByQuestion } from "@/lib/prep/build";
import { CATEGORIES, CATEGORY_HINT, CATEGORY_LABEL, type Attempt, type Category, type PrepQuestion } from "@/lib/prep/schema";
import { cn } from "@/lib/utils";

export type CategoryFilter = Category | "all";

export function QuestionList({ questions, attempts, filter, onFilter, onPractice, refNames }: {
  questions: PrepQuestion[];
  attempts: Attempt[];
  filter: CategoryFilter;
  onFilter: (f: CategoryFilter) => void;
  onPractice: (id: string) => void;
  refNames: Record<string, string>;
}) {
  const progress = progressByQuestion(attempts);
  const present = CATEGORIES.filter((c) => questions.some((q) => q.category === c));
  const groups = present.filter((c) => filter === "all" || filter === c);

  return (
    <div>
      <div role="group" aria-label="Filter by type" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
        {(["all", ...present] as CategoryFilter[]).map((c) => {
          const count = c === "all" ? questions.length : questions.filter((q) => q.category === c).length;
          return (
            <button key={c} type="button" aria-pressed={filter === c} onClick={() => onFilter(c)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium", filter === c ? "border-brand bg-brand-soft text-brand-soft-ink" : "border-line-strong text-ink-muted hover:text-ink")}>
              {c === "all" ? "All" : CATEGORY_LABEL[c]} <span className="ml-0.5 text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-8">
        {groups.map((c) => (
          <section key={c} aria-labelledby={`cat-${c}`}>
            <h3 id={`cat-${c}`} className="text-xl text-ink">{CATEGORY_LABEL[c]}</h3>
            <p className="mt-1 text-sm text-ink-muted">{CATEGORY_HINT[c]}</p>
            <ul className="mt-3 space-y-2.5">
              {questions.filter((q) => q.category === c).map((q) => {
                const p = progress.get(q.id);
                return (
                  <li key={q.id}>
                    <details className="group rounded-xl border border-line bg-surface open:shadow-card">
                      <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
                        <ChevronDown className="mt-1 size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug text-ink">{q.question}</span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-ink-muted">{q.difficulty}</span>
                            {p ? (
                              <span className={cn("rounded-full px-2 py-0.5 font-medium", (p.best ?? 0) >= 4 ? "bg-success-soft text-success" : "bg-brand-soft text-brand-soft-ink")}>
                                practised {p.attempts}×{p.best !== null ? ` · best ${p.best.toFixed(1)}` : ""}
                              </span>
                            ) : <span className="text-ink-faint">not practised yet</span>}
                          </span>
                        </span>
                      </summary>
                      <div className="space-y-4 border-t border-line px-4 pb-4 pt-3 text-[0.95rem]">
                        <p className="text-ink-muted"><span className="font-medium text-ink">What they’re probing:</span> {q.why}</p>
                        <div>
                          <p className="font-medium text-ink">A strong answer covers</p>
                          <ul className="mt-1.5 list-disc space-y-1 pl-6 text-ink-muted marker:text-brand">{q.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
                        </div>
                        {q.followUps.length > 0 && (
                          <div>
                            <p className="font-medium text-ink">Likely follow-ups</p>
                            <ul className="mt-1.5 list-disc space-y-1 pl-6 text-ink-muted">{q.followUps.map((k, i) => <li key={i}>{k}</li>)}</ul>
                          </div>
                        )}
                        {q.resumeRefs.length > 0 && (
                          <p className="text-ink-muted"><span className="font-medium text-ink">Draw on this experience from your resume:</span>{" "}
                            {q.resumeRefs.map((id) => refNames[id]).filter(Boolean).join(" · ")}</p>
                        )}
                        <Button onClick={() => onPractice(q.id)}><Dumbbell data-icon="inline-start" aria-hidden="true" /> Practise this question</Button>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
