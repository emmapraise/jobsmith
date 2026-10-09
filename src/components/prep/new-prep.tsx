"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2 } from "lucide-react";
import { createPrepAction } from "@/app/(app)/prep/actions";
import { NativeSelect } from "@/components/native-select";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STAGE_LABEL, isStage } from "@/lib/tracker/stages";

export type JobOption = { id: string; title: string; company: string; status: string | null; needsDescription: boolean };

export function NewPrep({ jobs, initialJobId }: { jobs: JobOption[]; initialJobId?: string }) {
  const router = useRouter();
  const [jobId, setJobId] = useState(jobs.find((j) => j.id === initialJobId)?.id ?? jobs[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const job = jobs.find((j) => j.id === jobId);
  const askDescription = Boolean(job?.needsDescription) || error?.code === "need_description";

  if (jobs.length === 0) return null;

  if (pending) {
    return (
      <div role="status" aria-live="polite" className="max-w-2xl rounded-2xl border border-line bg-surface p-8 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-brand" aria-hidden="true" />
        <p className="mt-4 font-medium text-ink">Preparing your interview pack…</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">About 20 to 40 seconds. We’re writing technical, behavioural and system-design questions for this role, plus questions about gaps in your resume and a short company brief.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <Label htmlFor="prep-job" className="mb-1.5 block text-sm font-medium text-ink">Which job are you preparing for?</Label>
      <NativeSelect id="prep-job" value={jobId} onChange={(e) => { setJobId(e.target.value); setError(null); }}>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {[j.title || "Untitled role", j.company].filter(Boolean).join(" at ")}{j.status && isStage(j.status) ? ` · ${STAGE_LABEL[j.status]}` : ""}
          </option>
        ))}
      </NativeSelect>

      {askDescription && (
        <div className="mt-4">
          <Label htmlFor="prep-desc" className="mb-1.5 block text-sm font-medium text-ink">Paste the job description</Label>
          <Textarea id="prep-desc" rows={8} value={description} maxLength={60000} onChange={(e) => setDescription(e.target.value)} placeholder="We haven’t read this job yet. Paste the full posting so the questions fit the role." />
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-brand">Add a company page for a richer brief (optional)</summary>
        <Label htmlFor="prep-co" className="mb-1.5 mt-3 block text-sm text-ink">Link to the company’s About or careers page</Label>
        <Input id="prep-co" type="url" inputMode="url" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} placeholder="https://company.com/about" className="h-11" />
        <p className="mt-1 text-xs text-ink-muted">We can’t browse the web, so the company brief only uses the job posting and any page you add here. It never guesses facts about the company.</p>
      </details>

      {error && <ErrorState className="mt-4" title={error.code === "need_description" ? "We need the job description" : "That didn’t work"} message={error.message} />}

      <Button size="lg" className="mt-5 h-11 px-5 text-base" disabled={!jobId || (askDescription && description.trim().length < 200 && Boolean(job?.needsDescription))}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await createPrepAction({ jobId, description: description.trim() || undefined, companyUrl: companyUrl.trim() || undefined });
            if (r.ok) router.push(`/prep/${r.id}`);
            else setError({ message: r.message, code: r.code });
          });
        }}>
        <GraduationCap data-icon="inline-start" aria-hidden="true" /> Prepare me
      </Button>
    </div>
  );
}
