"use client";

import { useState } from "react";
import { STAGES, STAGE_HINT, STAGE_LABEL, type Stage } from "@/lib/tracker/stages";
import type { AppView } from "@/lib/tracker/view";
import { cn } from "@/lib/utils";
import { ApplicationCard } from "./application-card";

/** Six stage columns on large screens; one stage at a time (with counts) on phones. */
export function Board({ apps, now }: { apps: AppView[]; now: string }) {
  const [mobileStage, setMobileStage] = useState<Stage>(() => STAGES.find((s) => apps.some((a) => a.status === s)) ?? "saved");
  const by = (s: Stage) => apps.filter((a) => a.status === s);

  return (
    <div>
      <div role="tablist" aria-label="Stages" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 lg:hidden">
        {STAGES.map((s) => (
          <button key={s} role="tab" aria-selected={mobileStage === s} onClick={() => setMobileStage(s)}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium", mobileStage === s ? "border-brand bg-brand-soft text-brand-soft-ink" : "border-line-strong text-ink-muted")}>
            {STAGE_LABEL[s]} <span className="ml-0.5 text-xs">{by(s).length}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 lg:flex lg:gap-4 lg:overflow-x-auto lg:pb-4">
        {STAGES.map((s) => (
          <section key={s} aria-label={`${STAGE_LABEL[s]} applications`} className={cn("lg:block lg:w-72 lg:shrink-0 lg:rounded-2xl lg:bg-surface-sunken lg:p-3", mobileStage !== s && "hidden")}>
            <h3 className="hidden items-baseline justify-between px-1 font-sans lg:flex">
              <span className="text-sm font-semibold text-ink">{STAGE_LABEL[s]}</span>
              <span className="text-xs text-ink-muted">{by(s).length}</span>
            </h3>
            <p className="hidden px-1 text-xs text-ink-muted lg:block">{STAGE_HINT[s]}</p>
            {by(s).length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-ink-muted lg:mt-3">{STAGE_HINT[s]}. Nothing here yet.</p>
            ) : (
              <ul className="space-y-3 lg:mt-3">{by(s).map((a) => <ApplicationCard key={a.id} app={a} now={now} />)}</ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
