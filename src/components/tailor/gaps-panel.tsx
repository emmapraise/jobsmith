"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { answerGapAction, applyGapAction, decideGapProposalAction } from "@/app/(app)/tailor/actions";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Gap } from "@/lib/tailor/types";
import { cn } from "@/lib/utils";

/**
 * Things the job asks for that your master resume doesn't show. We never add them ourselves: you tell us what you
 * did, we propose an edit to your MASTER resume, and you approve it. Then re-tailor.
 */
export function GapsPanel({ tailoredId, gaps, flush }: { tailoredId: string; gaps: Gap[]; flush: () => Promise<boolean> }) {
  if (gaps.length === 0) {
    return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">No gaps found. Your master resume covers what this job asks for.</p>;
  }
  return (
    <div>
      <p className="mb-3 text-sm text-ink-muted">
        The job asks for these, and your resume doesn’t show them. <span className="font-medium text-ink">We won’t add anything you haven’t told us.</span> If you have the experience, say so and we’ll suggest an edit for you to approve.
      </p>
      <ul className="space-y-3">
        {gaps.map((g) => <GapCard key={g.id} tailoredId={tailoredId} gap={g} flush={flush} />)}
      </ul>
    </div>
  );
}

function GapCard({ tailoredId, gap, flush }: { tailoredId: string; gap: Gap; flush: () => Promise<boolean> }) {
  const router = useRouter();
  const [text, setText] = useState(gap.answer ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState(() => Object.fromEntries(gap.proposals.map((p) => [p.id, p.decision])));
  const acceptedCount = Object.values(decisions).filter((d) => d === "accepted").length;

  const run = (fn: () => Promise<void>) => start(async () => { setError(null); if (!(await flush())) return; await fn(); });

  return (
    <li className={cn("rounded-xl border bg-surface p-4", gap.resolved ? "border-line opacity-70" : gap.importance === "must" ? "border-change-line" : "border-line")}>
      <p className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", gap.importance === "must" ? "bg-change-soft text-change-ink" : "bg-surface-sunken text-ink-muted")}>{gap.importance === "must" ? "Required" : "Nice to have"}</span>
        <span className="font-medium text-ink">{gap.requirement}</span>
      </p>

      {gap.resolved ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-success"><Check className="size-4" aria-hidden="true" /> Handled. Re-tailor to use your updated master resume.</p>
      ) : gap.proposals.length === 0 ? (
        <div className="mt-3">
          <Label htmlFor={`gap-${gap.id}`} className="mb-1.5 block text-sm text-ink">{gap.question}</Label>
          <Textarea id={`gap-${gap.id}`} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="What you did, where, and any real numbers. Leave it if you haven’t done this." />
          {error && <ErrorState className="mt-3" message={error} />}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={pending || !text.trim()}
              onClick={() => run(async () => {
                const r = await answerGapAction(tailoredId, gap.id, text);
                if (!r.ok) return setError(r.message);
                router.refresh();
              })}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : null}
              {pending ? "Working…" : "Suggest an edit to my master resume"}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(async () => {
              const r = await applyGapAction(tailoredId, gap.id);
              if (!r.ok) return setError(r.message);
              toast.message("Marked as not applicable");
              router.refresh();
            })}>I don’t have this</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">Based on your answer, we’d add this to your <span className="font-medium text-ink">master</span> resume:</p>
          <ul className="mt-2 space-y-2">
            {gap.proposals.map((p) => {
              const d = decisions[p.id];
              const t = (p.patch as { text?: string | null; items?: string[] }) ?? {};
              return (
                <li key={p.id} className={cn("rounded-lg border p-3", d === "accepted" ? "border-success/50" : "border-line")}>
                  <p className="text-sm font-medium text-ink">{p.description}</p>
                  <p className="mt-1 text-sm"><span className="changed">{t.text ?? t.items?.join(", ")}</span></p>
                  <p className="mt-1 text-xs text-ink-muted">Why: {p.reason}</p>
                  <div className="mt-2 flex gap-2">
                    {(["accepted", "rejected"] as const).map((v) => (
                      <Button key={v} size="sm" variant={d === v ? (v === "accepted" ? "default" : "secondary") : "outline"} aria-pressed={d === v} disabled={pending}
                        onClick={() => run(async () => {
                          const next = d === v ? "pending" : v;
                          setDecisions((s) => ({ ...s, [p.id]: next }));
                          const r = await decideGapProposalAction(tailoredId, gap.id, p.id, next);
                          if (!r.ok) { setDecisions((s) => ({ ...s, [p.id]: d })); setError(r.message); }
                        })}>
                        {v === "accepted" ? <Check data-icon="inline-start" aria-hidden="true" /> : <X data-icon="inline-start" aria-hidden="true" />}{v === "accepted" ? "Accept" : "Reject"}
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {error && <ErrorState className="mt-3" message={error} />}
          <Button className="mt-3" disabled={pending} onClick={() => run(async () => {
            const r = await applyGapAction(tailoredId, gap.id);
            if (!r.ok) return setError(r.message);
            toast.success(r.applied ? `Added ${r.applied} change${r.applied === 1 ? "" : "s"} to your master resume. Re-tailor to use it.` : "Nothing added");
            router.refresh();
          })}>
            {acceptedCount ? `Add ${acceptedCount} to my master resume` : "Done without adding"}
          </Button>
        </div>
      )}
    </li>
  );
}
