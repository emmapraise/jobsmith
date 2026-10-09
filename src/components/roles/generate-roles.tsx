"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Compass, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { generateInsightsAction } from "@/app/(app)/roles/actions";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";

export function GenerateRoles({ force = false, label, variant = "default" }: { force?: boolean; label: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  return (
    <div>
      <Button
        size={force ? "default" : "lg"}
        variant={variant}
        className={force ? "" : "h-11 px-5 text-base"}
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await generateInsightsAction(force);
            if (r.ok) router.refresh();
            // Compact (header) placement has no room for an inline error block: use a toast there.
            else if (force) toast.error(r.message);
            else setError({ message: r.message, code: r.code });
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : force ? <RefreshCw data-icon="inline-start" aria-hidden="true" /> : <Compass data-icon="inline-start" aria-hidden="true" />}
        {pending ? "Analysing your resume…" : label}
      </Button>
      {pending && !force && <p role="status" className="mt-3 text-sm text-ink-muted">Matching your experience to roles. This takes 15–30 seconds.</p>}
      {error && <ErrorState className="mt-4 max-w-xl" title={error.code === "ai_not_configured" ? "AI isn’t set up yet" : "Couldn’t analyse your resume"} message={error.message} />}
    </div>
  );
}
