"use client";

import { Check, Lightbulb, ListChecks, MessageSquareQuote, TriangleAlert } from "lucide-react";
import { RUBRIC, type Category, type Feedback } from "@/lib/prep/schema";
import { cn } from "@/lib/utils";

const tone = (v: number) => (v >= 4 ? "bg-success" : v >= 3 ? "bg-brand" : "bg-change-line");

export function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_2.25rem]">
      <span className="text-ink-muted">{label}</span>
      <div role="meter" aria-label={label} aria-valuemin={1} aria-valuemax={5} aria-valuenow={value} className="h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div className={cn("h-full rounded-full", tone(value))} style={{ width: `${(value / 5) * 100}%` }} />
      </div>
      <span className="text-right font-medium text-ink">{value % 1 ? value.toFixed(1) : value}</span>
    </div>
  );
}

export function FeedbackCard({ feedback, category, keyPoints }: { feedback: Feedback; category: Category; keyPoints: string[] }) {
  return (
    <div className="space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Feedback</p>
          <p className="mt-1 text-ink">{feedback.verdict}</p>
        </div>
        <div className="text-right" title="Average of the scores below, out of 5">
          <p className={cn("font-heading text-4xl leading-none", feedback.overall >= 4 ? "text-success" : feedback.overall >= 3 ? "text-brand" : "text-change-ink")}>{feedback.overall.toFixed(1)}</p>
          <p className="mt-1 text-xs text-ink-muted">out of 5</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {RUBRIC[category].filter((d) => feedback.scores[d.key] !== undefined).map((d) => <ScoreRow key={d.key} label={d.label} value={feedback.scores[d.key]} />)}
      </div>

      {feedback.strengths.length > 0 && (
        <section>
          <h4 className="flex items-center gap-2 font-sans text-sm font-semibold text-ink"><Check className="size-4 text-success" aria-hidden="true" /> What worked</h4>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-[0.95rem] text-ink marker:text-success">{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}
      {feedback.improvements.length > 0 && (
        <section>
          <h4 className="flex items-center gap-2 font-sans text-sm font-semibold text-ink"><TriangleAlert className="size-4 text-change-ink" aria-hidden="true" /> To improve</h4>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-[0.95rem] text-ink marker:text-change-ink">{feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}
      {feedback.suggestedOutline.length > 0 && (
        <section>
          <h4 className="flex items-center gap-2 font-sans text-sm font-semibold text-ink"><ListChecks className="size-4 text-brand" aria-hidden="true" /> A stronger structure</h4>
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-[0.95rem] text-ink marker:text-brand">{feedback.suggestedOutline.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <p className="mt-2 text-xs text-ink-muted">Fill any [placeholders] with your own real details. Never use a number or story you can’t back up.</p>
        </section>
      )}
      {feedback.resumeTips.length > 0 && (
        <section>
          <h4 className="flex items-center gap-2 font-sans text-sm font-semibold text-ink"><Lightbulb className="size-4 text-brand" aria-hidden="true" /> From your resume, you could mention</h4>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-[0.95rem] text-ink marker:text-brand">{feedback.resumeTips.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}
      <details className="rounded-xl bg-paper p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink"><MessageSquareQuote className="size-4 text-brand" aria-hidden="true" /> What a strong answer covers</summary>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-ink-muted">{keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
      </details>
    </div>
  );
}
