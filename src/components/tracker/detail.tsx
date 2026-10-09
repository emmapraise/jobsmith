"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Download, ExternalLink, FileText, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteApplicationAction, exportApplicationResumeAction, followedUpAction, moveApplicationAction, setResumeAction, updateApplicationAction,
} from "@/app/(app)/tracker/actions";
import { NativeSelect } from "@/components/native-select";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { startDownload } from "@/lib/download";
import { describeFollowUp } from "@/lib/tracker/due";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/tracker/stages";
import type { AppView } from "@/lib/tracker/view";
import type { ResumeOption } from "./add-application";

export type EventView = { from: Stage | null; to: Stage; at: string };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function ApplicationDetail({ app, events, resumeOptions, now }: { app: AppView; events: EventView[]; resumeOptions: ResumeOption[]; now: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(app.notes);
  const [appliedOn, setAppliedOn] = useState(day(app.appliedAt));
  const [followUpOn, setFollowUpOn] = useState(day(app.nextFollowUpAt));
  const dirty = notes !== app.notes || appliedOn !== day(app.appliedAt) || followUpOn !== day(app.nextFollowUpAt);
  const follow = app.nextFollowUpAt ? describeFollowUp(new Date(app.nextFollowUpAt), new Date(now)) : null;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.message ?? "Something went wrong");
      else if (ok) toast.success(ok);
      router.refresh();
    });

  const dl = (format: "pdf" | "docx") =>
    start(async () => {
      const r = await exportApplicationResumeAction(app.id, format);
      if (r.ok) startDownload(r.url, r.fileName);
      else toast.error(r.message);
    });

  const current = app.resume ? (app.resume.kind === "tailored" ? `tailored:${app.resume.tailoredId}` : "master") : "none";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <section aria-labelledby="status" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 id="status" className="text-xl text-ink">Status</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="stage" className="mb-1.5 block text-sm font-medium text-ink">Stage</Label>
              <NativeSelect id="stage" value={app.status} disabled={pending} onChange={(e) => run(() => moveApplicationAction(app.id, e.target.value), e.target.value === "offer" ? "Congratulations on the offer!" : undefined)}>
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="applied" className="mb-1.5 block text-sm font-medium text-ink">Date applied</Label>
              <Input id="applied" type="date" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} className="h-11" />
            </div>
            <div>
              <Label htmlFor="follow" className="mb-1.5 block text-sm font-medium text-ink">Follow up on</Label>
              <Input id="follow" type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} className="h-11" />
            </div>
          </div>
          {follow && app.status !== "offer" && app.status !== "rejected" && (
            <p className={`mt-3 flex items-center gap-1.5 text-sm ${follow.overdue ? "text-change-ink" : "text-ink-muted"}`}><BellRing className="size-4" aria-hidden="true" /> Follow-up {follow.text}.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => followedUpAction(app.id, 7), "We’ll remind you again in a week")}>I followed up (remind me in a week)</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => followedUpAction(app.id, null), "Reminder cleared")}>Clear reminder</Button>
          </div>
        </section>

        <section aria-labelledby="notes" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 id="notes" className="text-xl text-ink">Notes</h2>
          <Label htmlFor="notes-box" className="sr-only">Notes</Label>
          <Textarea id="notes-box" rows={6} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} className="mt-3" placeholder="Contacts, what was said, questions to ask, salary range…" />
          <div className="mt-3 flex items-center gap-3">
            <Button disabled={pending || !dirty} onClick={() => run(() => updateApplicationAction(app.id, { notes, appliedOn, followUpOn }), "Saved")}>{pending ? "Saving…" : "Save changes"}</Button>
            {dirty && <span className="text-sm text-ink-muted" role="status">Unsaved changes</span>}
          </div>
        </section>

        <section aria-labelledby="timeline" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 id="timeline" className="text-xl text-ink">Timeline</h2>
          <ol className="mt-3 space-y-3 border-l border-line-strong pl-4">
            {events.map((e, i) => (
              <li key={i} className="relative text-sm">
                <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-brand" aria-hidden="true" />
                <span className="font-medium text-ink">{e.from ? `${STAGE_LABEL[e.from]} → ${STAGE_LABEL[e.to]}` : `Added as ${STAGE_LABEL[e.to]}`}</span>
                <span className="ml-2 text-ink-muted">{fmt.format(new Date(e.at))}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="space-y-6">
        <section aria-labelledby="resume" className="rounded-2xl border border-line bg-surface p-5">
          <h2 id="resume" className="flex items-center gap-2 text-xl text-ink"><FileText className="size-5 text-brand" aria-hidden="true" /> Resume used</h2>
          {app.resume ? (
            <>
              <p className="mt-3 font-medium text-ink">{app.resume.kind === "tailored" ? `Tailored CV, version ${app.resume.version}` : `Master resume, version ${app.resume.version}`}</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-muted"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> This exact version is saved, so later edits never change what you sent.</p>
              {app.resume.kind === "tailored" && app.resume.matchScore !== null && <p className="mt-1 text-sm text-ink-muted">Match score at the time: {app.resume.matchScore}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => dl("pdf")}><Download data-icon="inline-start" aria-hidden="true" /> PDF</Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => dl("docx")}><Download data-icon="inline-start" aria-hidden="true" /> DOCX</Button>
                {app.resume.kind === "tailored" && <Button size="sm" variant="ghost" render={<Link href={`/tailor/${app.resume.tailoredId}`} />}>Open tailoring</Button>}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">No resume recorded for this application.</p>
          )}
          <Label htmlFor="swap" className="mb-1.5 mt-4 block text-sm font-medium text-ink">{app.resume ? "Change resume used" : "Record the resume you used"}</Label>
          <NativeSelect id="swap" value={current} disabled={pending} onChange={(e) => run(() => setResumeAction(app.id, e.target.value), "Resume updated")} className="h-9 text-sm">
            <option value="none">Not recorded</option>
            {resumeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </section>

        {app.url && (
          <a href={app.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-sm font-medium text-brand underline-offset-4 hover:underline">
            <ExternalLink className="size-4" aria-hidden="true" /> Original job posting
          </a>
        )}

        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}><Trash2 data-icon="inline-start" aria-hidden="true" /> Delete application</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this application?</AlertDialogTitle>
              <AlertDialogDescription>Its notes and timeline are removed. Your resumes, including the tailored one, are not affected.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={async () => { const r = await deleteApplicationAction(app.id); if (r.ok) router.push("/tracker"); else toast.error(r.message); }}>Delete</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </aside>
    </div>
  );
}
