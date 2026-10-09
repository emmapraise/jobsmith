"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChangeState } from "@/lib/tailor/changes";
import { diffWords, similarity } from "@/lib/tailor/diff";
import type { Decision, TailorChange } from "@/lib/tailor/types";
import { cn } from "@/lib/utils";

const LABEL: Record<TailorChange["kind"], string> = {
  bullet_text: "Reworded bullet",
  bullets_order: "Reordered bullets",
  summary: "Summary",
  headline: "Headline",
  skills_order: "Reordered skills",
  skills_add: "Added skills from your resume",
};

export function ChangeCard({
  change,
  state,
  requirements,
  bulletText,
  busy,
  onDecide,
  onFocus,
}: {
  change: TailorChange;
  state: ChangeState;
  requirements: { id: string; text: string }[];
  /** bullet id → current text, to describe reorders */
  bulletText: (id: string) => string;
  busy: boolean;
  onDecide: (d: Decision) => void;
  onFocus: () => void;
}) {
  const d = change.decision;
  const stale = state === "stale";
  const reqs = change.requirementIds.map((id) => requirements.find((r) => r.id === id)?.text).filter(Boolean) as string[];

  return (
    <li
      className={cn(
        "rounded-xl border bg-surface p-4 transition-colors",
        d === "accepted" && !stale && "border-success/50",
        d === "rejected" && "border-line opacity-70",
        (d === "pending" || stale) && "border-line",
      )}
    >
      <button type="button" onClick={onFocus} className="text-left">
        <span className="eyebrow">{LABEL[change.kind]}</span>
      </button>

      <div className="mt-2 text-[0.9rem] leading-relaxed">
        {(change.kind === "bullet_text" || change.kind === "summary" || change.kind === "headline") && <TextDiff before={change.before} after={change.after} />}
        {change.kind === "bullets_order" && (
          <ol className="list-decimal space-y-1 pl-5 text-ink">
            {change.after.map((id) => <li key={id}><span className="line-clamp-2">{bulletText(id)}</span></li>)}
          </ol>
        )}
        {change.kind === "skills_order" && (
          <p className="flex flex-wrap gap-1">{change.after.map((s) => <span key={s} className="rounded bg-surface-sunken px-1.5 py-0.5 text-[0.8rem]">{s}</span>)}</p>
        )}
        {change.kind === "skills_add" && (
          <p className="flex flex-wrap gap-1">{change.items.map((s) => <span key={s} className="rounded bg-success-soft px-1.5 py-0.5 text-[0.8rem]">+ {s}</span>)}</p>
        )}
      </div>

      <p className="mt-2 text-sm text-ink-muted"><span className="font-medium text-ink">Why:</span> {change.reason}</p>
      {reqs.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1" aria-label="Job requirements this addresses">
          {reqs.map((r) => <span key={r} className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-ink-muted">{r}</span>)}
        </p>
      )}

      {stale ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-change-ink">
          You edited this text, so the suggestion no longer fits.
          {d !== "rejected" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide("rejected")}>Dismiss</Button>}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Decision for this suggestion">
          <Button className="h-10 px-4" variant={d === "accepted" ? "default" : "outline"} aria-pressed={d === "accepted"} disabled={busy} onClick={() => onDecide(d === "accepted" ? "pending" : "accepted")}>
            <Check data-icon="inline-start" aria-hidden="true" /> {d === "accepted" ? "Accepted" : "Accept"}
          </Button>
          <Button className="h-10 px-4" variant={d === "rejected" ? "secondary" : "outline"} aria-pressed={d === "rejected"} disabled={busy} onClick={() => onDecide(d === "rejected" ? "pending" : "rejected")}>
            <X data-icon="inline-start" aria-hidden="true" /> {d === "rejected" ? "Rejected" : "Reject"}
          </Button>
          {d !== "pending" && (
            <Button className="h-10" variant="ghost" disabled={busy} onClick={() => onDecide("pending")} aria-label="Undo decision">
              <RotateCcw data-icon="inline-start" aria-hidden="true" /> Undo
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Inline diff for light edits; stacked before/after when the text was mostly rewritten (inline would be unreadable). */
function TextDiff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  if (similarity(parts) < 0.5) {
    return (
      <div className="space-y-2">
        <p className="text-ink-muted"><span className="eyebrow mr-1.5">Before</span><span className="line-through decoration-danger/50">{before}</span></p>
        <p className="text-ink"><span className="eyebrow mr-1.5">After</span><span className="rounded-sm bg-success-soft px-0.5">{after}</span></p>
      </div>
    );
  }
  return (
    <p>
      <span className="sr-only">Changed from: {before}. To: {after}.</span>
      <span aria-hidden="true">
        {parts.map((p, i) =>
          p.type === "same" ? <span key={i}>{p.text}</span>
          : p.type === "add" ? <ins key={i} className="rounded-sm bg-success-soft text-ink no-underline">{p.text}</ins>
          : <del key={i} className="text-ink-muted decoration-danger/70">{p.text}</del>,
        )}
      </span>
    </p>
  );
}
