"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Link2, Loader2, Sparkles } from "lucide-react";
import { createTailoringAction } from "@/app/(app)/tailor/actions";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Mode = "url" | "paste";

export function NewTailoring() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const ready = mode === "url" ? url.trim().length > 6 : text.trim().length > 0;

  function submit() {
    setError(null);
    start(async () => {
      const r = await createTailoringAction({ mode, url: mode === "url" ? url.trim() : undefined, text: mode === "paste" ? text : undefined });
      if (r.ok) return router.push(`/tailor/${r.id}`);
      // A link we can't read is never a dead end: switch to the paste box with the reason.
      if (r.code === "paste_fallback") setMode("paste");
      setError({ message: r.message, code: r.code });
    });
  }

  if (pending) {
    return (
      <div role="status" aria-live="polite" className="max-w-2xl rounded-2xl border border-line bg-surface p-8 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-brand" aria-hidden="true" />
        <p className="mt-4 font-medium text-ink">Tailoring your resume…</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">Usually 20 to 40 seconds. We read the job, check each requirement against your resume, suggest edits, then double-check every edit for accuracy. Nothing is applied until you accept it.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div role="tablist" aria-label="How to add the job" className="inline-flex rounded-xl border border-line bg-surface p-1">
        {([["url", "Job link", Link2], ["paste", "Paste description", ClipboardPaste]] as const).map(([m, label, Icon]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium", mode === m ? "bg-brand-soft text-brand-soft-ink" : "text-ink-muted hover:text-ink")}>
            <Icon className="size-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        {mode === "url" ? (
          <>
            <Label htmlFor="job-url" className="mb-1.5 block text-sm font-medium text-ink">Link to the job posting</Label>
            <Input id="job-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://company.com/careers/backend-engineer" className="h-11 text-base" autoComplete="off" onKeyDown={(e) => { if (e.key === "Enter" && ready) submit(); }} />
            <p className="mt-2 text-sm text-ink-muted">Works with most company career pages and boards like Greenhouse, Lever and Ashby. LinkedIn, Indeed and Glassdoor don’t allow automated access, so for those, paste the description instead.</p>
          </>
        ) : (
          <>
            <Label htmlFor="job-text" className="mb-1.5 block text-sm font-medium text-ink">Job description</Label>
            <Textarea id="job-text" rows={12} value={text} maxLength={60000} onChange={(e) => setText(e.target.value)} placeholder="Paste the full job posting here: responsibilities, requirements, everything." />
            <p className="mt-2 text-sm text-ink-muted">Copy the whole posting from the page. More detail means better tailoring.</p>
          </>
        )}

        {error && (
          <ErrorState
            className="mt-4"
            title={error.code === "paste_fallback" ? "We couldn’t read that link" : error.code === "ai_not_configured" ? "AI isn’t set up yet" : "That didn’t work"}
            message={error.code === "paste_fallback" ? `${error.message} We’ve switched you to the paste box.` : error.message}
          />
        )}

        <Button size="lg" className="mt-5 h-11 px-5 text-base" disabled={!ready} onClick={submit}>
          <Sparkles data-icon="inline-start" aria-hidden="true" /> Tailor my resume
        </Button>
      </div>
    </div>
  );
}
