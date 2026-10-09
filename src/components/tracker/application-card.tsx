"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, FileText } from "lucide-react";
import { toast } from "sonner";
import { moveApplicationAction } from "@/app/(app)/tracker/actions";
import { NativeSelect } from "@/components/native-select";
import { offerPrep } from "./prep-toast";
import { describeFollowUp } from "@/lib/tracker/due";
import { STAGES, STAGE_LABEL } from "@/lib/tracker/stages";
import { ago, type AppView } from "@/lib/tracker/view";
import { cn } from "@/lib/utils";

export function resumeLabel(r: AppView["resume"]): string | null {
  if (!r) return null;
  return r.kind === "tailored" ? `Tailored CV v${r.version}` : `Master v${r.version}`;
}

export function ApplicationCard({ app, now }: { app: AppView; now: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const follow = app.nextFollowUpAt && ["applied", "screening", "interview"].includes(app.status) ? describeFollowUp(new Date(app.nextFollowUpAt), new Date(now)) : null;
  const label = resumeLabel(app.resume);

  return (
    <li className={cn("rounded-xl border border-line bg-surface p-3.5 shadow-card transition-opacity", pending && "opacity-60")}>
      <p className="truncate text-sm text-ink-muted">{app.company || "Unknown company"}</p>
      <Link href={`/tracker/${app.id}`} className="mt-0.5 block font-medium leading-snug text-ink underline-offset-4 hover:underline">
        {app.title || "Untitled role"}
      </Link>
      <p className="mt-1 text-xs text-ink-muted">
        {[app.location, app.appliedAt ? `Applied ${ago(app.appliedAt, now)}` : `Added ${ago(app.statusChangedAt, now)}`].filter(Boolean).join(" · ")}
      </p>

      {(follow || label) && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {follow && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", follow.overdue ? "bg-change-soft text-change-ink" : "bg-surface-sunken text-ink-muted")}>
              <BellRing className="size-3" aria-hidden="true" /> Follow up {follow.text}
            </span>
          )}
          {label && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-soft-ink">
              <FileText className="size-3" aria-hidden="true" /> {label}
            </span>
          )}
        </p>
      )}

      <label className="sr-only" htmlFor={`move-${app.id}`}>Move {app.title} to another stage</label>
      <NativeSelect
        id={`move-${app.id}`}
        value={app.status}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await moveApplicationAction(app.id, e.target.value);
            if (!r.ok) toast.error(r.message);
            else if (e.target.value === "offer") toast.success("Congratulations on the offer!");
            else if (e.target.value === "interview") offerPrep(app.jobId, (href) => router.push(href));
            router.refresh();
          })
        }
        className="mt-3 h-9 text-sm"
      >
        {STAGES.map((s) => <option key={s} value={s}>{s === app.status ? STAGE_LABEL[s] : `Move to ${STAGE_LABEL[s]}`}</option>)}
      </NativeSelect>
    </li>
  );
}
