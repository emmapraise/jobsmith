"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { restoreVersionAction } from "@/app/(app)/resume/actions";

type V = { version: number; source: string; note: string | null; createdAt: string };

const LABEL: Record<string, string> = { upload: "Upload", manual_edit: "Edit", qa: "Q&A", restore: "Restore" };
const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function VersionHistory({ versions, current }: { versions: V[]; current: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<number | null>(null);

  if (versions.length === 0) return <p className="mt-2 text-sm text-ink-muted">No versions yet.</p>;

  return (
    <ul className="mt-3 space-y-1">
      {versions.map((v) => (
        <li key={v.version} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-sunken">
          <History className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-ink">
              v{v.version} · {LABEL[v.source] ?? v.source}
              {v.version === current && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-ink">Current</span>}
            </p>
            <p className="truncate text-xs text-ink-muted">{fmt.format(new Date(v.createdAt))}{v.note ? ` · ${v.note}` : ""}</p>
          </div>
          {v.version !== current && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setTarget(v.version);
                start(async () => {
                  const r = await restoreVersionAction(v.version);
                  if (r.ok) {
                    toast.success(`Restored v${v.version} as a new version`);
                    router.refresh();
                  } else toast.error(r.message);
                  setTarget(null);
                });
              }}
              aria-label={`Restore version ${v.version}`}
            >
              {pending && target === v.version ? "Restoring…" : "Restore"}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
