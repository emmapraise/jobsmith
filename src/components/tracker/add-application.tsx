"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addApplicationAction } from "@/app/(app)/tracker/actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/tracker/stages";

export type ResumeOption = { value: string; label: string };

export function AddApplication({ resumeOptions, label = "Add application" }: { resumeOptions: ResumeOption[]; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ company: "", title: "", url: "", location: "", status: "applied" as Stage, appliedOn: new Date().toISOString().slice(0, 10), resume: "none", notes: "" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  function submit() {
    setError(null);
    start(async () => {
      const r = await addApplicationAction({ ...f, appliedOn: f.status === "saved" ? "" : f.appliedOn });
      if (!r.ok) return setError(r.message);
      toast.success("Added to your tracker");
      setOpen(false);
      setF((s) => ({ ...s, company: "", title: "", url: "", location: "", notes: "" }));
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" aria-hidden="true" /> {label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add an application</DialogTitle>
            <DialogDescription>Track a job you found elsewhere. For jobs you tailored in Jobsmith, use “Save to tracker” on the tailored resume instead.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company *" id="a-company"><Input id="a-company" value={f.company} onChange={(e) => set("company", e.target.value)} required maxLength={120} autoComplete="organization" /></Field>
              <Field label="Job title *" id="a-title"><Input id="a-title" value={f.title} onChange={(e) => set("title", e.target.value)} required maxLength={160} /></Field>
            </div>
            <Field label="Link to the posting" id="a-url"><Input id="a-url" type="url" inputMode="url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location" id="a-loc"><Input id="a-loc" value={f.location} onChange={(e) => set("location", e.target.value)} maxLength={120} /></Field>
              <Field label="Stage" id="a-stage">
                <NativeSelect id="a-stage" value={f.status} onChange={(e) => set("status", e.target.value as Stage)}>
                  {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                </NativeSelect>
              </Field>
            </div>
            {f.status !== "saved" && <Field label="Date applied" id="a-date"><Input id="a-date" type="date" value={f.appliedOn} onChange={(e) => set("appliedOn", e.target.value)} className="sm:max-w-48" /></Field>}
            <Field label="Resume you used" id="a-resume">
              <NativeSelect id="a-resume" value={f.resume} onChange={(e) => set("resume", e.target.value)}>
                <option value="none">Not recorded</option>
                {resumeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </NativeSelect>
              <p className="mt-1 text-xs text-ink-muted">We save that exact version, so you can always see and download what you sent.</p>
            </Field>
            <Field label="Notes" id="a-notes"><Textarea id="a-notes" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={5000} /></Field>
            {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-ink">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !f.company.trim() || !f.title.trim()}>{pending ? "Adding…" : "Add"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</Label>
      {children}
    </div>
  );
}
