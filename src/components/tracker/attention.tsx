"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { followedUpAction, moveApplicationAction, noNewsAction } from "@/app/(app)/tracker/actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { describeFollowUp } from "@/lib/tracker/due";
import { STAGE_LABEL, type Stage } from "@/lib/tracker/stages";
import type { AppView } from "@/lib/tracker/view";

const NEWS: Stage[] = ["screening", "interview", "offer", "rejected"];

/** Follow-ups that have arrived and "any news?" prompts. Each has one-tap answers. */
export function Attention({ items, now, compact = false }: { items: AppView[]; now: string; compact?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="attention" className="rounded-2xl border border-change-line bg-change-soft p-4 sm:p-5">
      <h2 id="attention" className="flex items-center gap-2 text-lg text-change-ink">
        <BellRing className="size-5" aria-hidden="true" /> Needs your attention <span className="rounded-full bg-surface px-2 py-0.5 text-sm font-medium">{items.length}</span>
      </h2>
      <ul className="mt-3 space-y-3">
        {(compact ? items.slice(0, 3) : items).map((a) => <Item key={a.id} app={a} now={now} />)}
      </ul>
      {compact && items.length > 3 && <Link href="/tracker" className="mt-3 inline-block text-sm font-medium text-change-ink underline underline-offset-4">See all {items.length}</Link>}
    </section>
  );
}

function Item({ app, now }: { app: AppView; now: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const due = app.due!;
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.message ?? "Something went wrong");
      else if (ok) toast.success(ok);
      router.refresh();
    });
  const follow = due.followUpDue ? describeFollowUp(new Date(due.followUpDue), new Date(now)) : null;

  return (
    <li className="rounded-xl bg-surface p-3.5">
      <p className="text-sm text-ink-muted">{app.company}</p>
      <Link href={`/tracker/${app.id}`} className="font-medium text-ink underline-offset-4 hover:underline">{app.title}</Link>
      <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">{STAGE_LABEL[app.status]}</span>

      <div className="mt-2 space-y-1 text-sm text-ink">
        {follow && <p className="flex items-center gap-1.5"><BellRing className="size-4 text-change-ink" aria-hidden="true" /> Time to follow up ({follow.text}).</p>}
        {due.promptDue && (
          <p className="flex items-center gap-1.5">
            <MessageCircleQuestion className="size-4 text-change-ink" aria-hidden="true" />
            {app.status === "saved" ? `You saved this ${due.daysInStage} days ago. Still planning to apply?` : `No update for ${due.daysInStage} days. Any news?`}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {app.status === "saved" ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => moveApplicationAction(app.id, "applied"), "Marked as applied")}>I’ve applied</Button>
        ) : (
          <>
            {follow && <Button size="sm" disabled={pending} onClick={() => run(() => followedUpAction(app.id, 7), "Nice. We’ll remind you again in a week.")}>I followed up</Button>}
            <label className="sr-only" htmlFor={`news-${app.id}`}>Update the status of {app.title}</label>
            <NativeSelect id={`news-${app.id}`} defaultValue="" disabled={pending} className="h-8 w-auto text-sm"
              onChange={(e) => e.target.value && run(() => moveApplicationAction(app.id, e.target.value))}>
              <option value="">I have news…</option>
              {NEWS.filter((s) => s !== app.status).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </NativeSelect>
          </>
        )}
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => noNewsAction(app.id), `OK, we’ll ask again in a week.`)}>
          {app.status === "saved" ? "Not yet" : "No news yet"}
        </Button>
      </div>
    </li>
  );
}
