"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, ClipboardPlus } from "lucide-react";
import { toast } from "sonner";
import { trackTailoredAction } from "@/app/(app)/tracker/actions";
import { Button } from "@/components/ui/button";
import { STAGE_LABEL, type Stage } from "@/lib/tracker/stages";

export type Tracked = { id: string; status: Stage; pinnedVersion: number | null } | null;

/** Adds this job to the application tracker, pinning the version of the resume that's current right now. */
export function TrackControl({ tailoredId, version, tracked, flush }: { tailoredId: string; version: number; tracked: Tracked; flush: () => Promise<boolean> }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (tracked) {
    const newer = tracked.pinnedVersion !== null && version > tracked.pinnedVersion;
    return (
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-success-soft p-3 text-sm text-ink">
        <ClipboardCheck className="size-4 text-success" aria-hidden="true" />
        <span>In your tracker as <strong>{STAGE_LABEL[tracked.status]}</strong>{tracked.pinnedVersion !== null && <> with CV v{tracked.pinnedVersion}</>}.</span>
        {newer && <span className="text-ink-muted">You’ve made newer edits (v{version}) since; the application keeps the version you sent.</span>}
        <Link href={`/tracker/${tracked.id}`} className="ml-auto font-medium text-brand underline underline-offset-4">Open in tracker</Link>
      </div>
    );
  }

  const track = (status: "saved" | "applied") =>
    start(async () => {
      if (!(await flush())) return;
      const r = await trackTailoredAction(tailoredId, status);
      if (!r.ok) return void toast.error(r.message);
      toast.success(status === "applied" ? "Tracked as applied. We’ll remind you to follow up." : "Saved to your tracker");
      router.refresh();
    });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-paper p-3">
      <ClipboardPlus className="size-4 text-brand" aria-hidden="true" />
      <span className="mr-auto text-sm text-ink-muted">Track this application. We’ll save this exact version of your CV.</span>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => track("saved")}>Save to tracker</Button>
      <Button size="sm" disabled={pending} onClick={() => track("applied")}>I’ve applied</Button>
    </div>
  );
}
