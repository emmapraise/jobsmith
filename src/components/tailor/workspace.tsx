"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCheck, CircleCheck, CircleDashed, CircleX, Download, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  decideAllAction, decideChangeAction, deleteTailoringAction, exportTailoredAction, retailorAction, saveTailoredContentAction, setVariantAction,
} from "@/app/(app)/tailor/actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { ResumeContent } from "@/lib/resume/schema";
import { changeState, changeTargets, withPending } from "@/lib/tailor/changes";
import { keywordsPresent } from "@/lib/tailor/factcheck";
import type { Analysis, Decision, Gap, TailorChange } from "@/lib/tailor/types";
import { startDownload } from "@/lib/download";
import { cn } from "@/lib/utils";
import { ChangeCard } from "./change-card";
import { TrackControl, type Tracked } from "./track-control";
import { GapsPanel } from "./gaps-panel";
import { ResumeDoc, type Marks } from "./resume-doc";

export type WorkspaceProps = {
  id: string;
  variant: "uk_eu" | "us";
  version: number;
  job: { title: string; company: string; location: string; url: string | null; requirements: { id: string; text: string; importance: "must" | "nice" }[]; keywords: string[] };
  content: ResumeContent;
  /** The master as it was when this was tailored (left pane). */
  masterContent: ResumeContent;
  masterMoved: boolean;
  changes: TailorChange[];
  gaps: Gap[];
  analysis: Analysis | null;
  matchScore: number | null;
  tracked: Tracked;
};

type Tab = "compare" | "changes" | "gaps";

export function TailorWorkspace(p: WorkspaceProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(p.content);
  const [baseline, setBaseline] = useState(() => JSON.stringify(p.content));
  const [tab, setTab] = useState<Tab>("compare");
  const [busy, startBusy] = useTransition();
  const [variant, setVariant] = useState(p.variant);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = useMemo(() => JSON.stringify(draft) !== baseline, [draft, baseline]);

  const pending = p.changes.filter((c) => c.decision === "pending" && changeState(draft, c) !== "stale");
  const accepted = p.changes.filter((c) => c.decision === "accepted");
  const openGaps = p.gaps.filter((g) => !g.resolved);

  const bulletIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of [...draft.experience.map((e) => e.bullets), ...draft.projects.map((x) => x.bullets)]) for (const b of l) m.set(b.id, b.text);
    return m;
  }, [draft]);

  const rightMarks: Marks = {};
  const leftMarks: Marks = {};
  for (const c of p.changes) {
    if (c.decision === "rejected") continue;
    const st = changeState(draft, c);
    for (const k of changeTargets(c)) {
      if (c.decision === "pending" && st !== "stale") { rightMarks[k] = "pending"; leftMarks[k] = "pending"; }
      else if (c.decision === "accepted" && st === "applied") { rightMarks[k] = "accepted"; leftMarks[k] = "accepted"; }
    }
  }

  const kwNow = keywordsPresent(draft, p.job.keywords).present.length;
  const kwAll = keywordsPresent(withPending(draft, p.changes), p.job.keywords).present.length;
  const kwMaster = p.analysis?.keywords.master.length ?? 0;

  /** Save manual edits first so server-side decisions/exports see exactly what the user sees. */
  async function flush(): Promise<boolean> {
    if (!dirty) return true;
    const r = await saveTailoredContentAction(p.id, draft);
    if (!r.ok) { setSaveError(r.message); toast.error(r.message); return false; }
    setSaveError(null);
    setBaseline(JSON.stringify(draft));
    return true;
  }

  const run = (fn: () => Promise<void>) => startBusy(async () => { if (await flush()) await fn(); });

  const decide = (changeId: string, d: Decision) =>
    run(async () => {
      const r = await decideChangeAction(p.id, changeId, d);
      if (!r.ok) toast.error(r.message);
      router.refresh();
    });

  const doExport = (format: "pdf" | "docx") =>
    run(async () => {
      const r = await exportTailoredAction(p.id, format);
      if (!r.ok) return void toast.error(r.message);
      if (r.pending > 0) toast.message(`${r.pending} suggestion${r.pending === 1 ? "" : "s"} not reviewed yet, so not included in this file.`);
      startDownload(r.url, r.fileName); // no navigation, no refresh: both abort the download in Safari
    });

  const score = p.matchScore;
  const cov = p.analysis?.coverage ?? [];

  return (
    <div className="pb-28">
      {/* Summary bar */}
      <section aria-label="Job summary" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Tailored for</p>
            <h2 className="mt-1 text-2xl text-ink">{p.job.title || "Untitled role"}</h2>
            <p className="mt-1 text-ink-muted">
              {[p.job.company, p.job.location].filter(Boolean).join(" · ")}
              {p.job.url && (
                <> · <a href={p.job.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-brand underline underline-offset-4">Original posting <ExternalLink className="size-3" aria-hidden="true" /></a></>
              )}
            </p>
          </div>
          {score !== null && (
            <div className="text-right" title="How well your master resume covers the job's requirements. Required items count triple.">
              <p className={cn("font-heading text-5xl leading-none", score >= 75 ? "text-success" : score >= 50 ? "text-brand" : "text-change-ink")}>{score}</p>
              <p className="mt-1 text-sm text-ink-muted">Match score</p>
            </div>
          )}
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <Stat label="Requirements covered" value={`${cov.filter((c) => c.status === "matched").length} of ${p.job.requirements.length}`} hint={`${cov.filter((c) => c.status === "partial").length} partly, ${cov.filter((c) => c.status === "gap").length} not shown`} />
          <Stat label="Job keywords in your resume" value={`${kwNow} of ${p.job.keywords.length}`} hint={kwAll > kwNow ? `${kwAll} if you accept every suggestion (was ${kwMaster})` : `was ${kwMaster} before tailoring`} />
          <Stat label="Suggestions" value={`${accepted.length} accepted`} hint={pending.length ? `${pending.length} waiting for your decision` : "all reviewed"} />
        </dl>

        <TrackControl tailoredId={p.id} version={p.version} tracked={p.tracked} flush={flush} />

        {cov.length > 0 && (
          <details className="mt-4 rounded-lg border border-line bg-paper p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">How each requirement is covered</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {p.job.requirements.map((r) => {
                const c = cov.find((x) => x.requirementId === r.id);
                const s = c?.status ?? "gap";
                return (
                  <li key={r.id} className="flex items-start gap-2">
                    {s === "matched" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Matched" /> : s === "partial" ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-brand" aria-label="Partly" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-change-ink" aria-label="Not shown in your resume" />}
                    <span><span className="text-ink">{r.text}</span>{r.importance === "must" && <span className="ml-1.5 text-xs text-ink-muted">(required)</span>}{c?.evidence && <span className="block text-ink-muted">{c.evidence}</span>}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </section>

      {p.masterMoved && (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-change-line bg-change-soft p-4 text-sm text-change-ink">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">Your master resume has changed since this was tailored.</span>
          <Button size="sm" disabled={busy} onClick={() => run(async () => { const r = await retailorAction(p.id); if (!r.ok) toast.error(r.message); else toast.success("Re-tailored against your updated master"); router.refresh(); })}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" /> Re-tailor now
          </Button>
        </div>
      )}

      {/* Tabs (below xl) */}
      <div role="tablist" aria-label="Sections" className="mt-6 flex gap-1 rounded-xl border border-line bg-surface p-1 xl:hidden">
        {([["compare", "Compare"], ["changes", `Suggestions (${pending.length})`], ["gaps", `Gaps (${openGaps.length})`]] as [Tab, string][]).map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("flex-1 rounded-lg px-2 py-2 text-sm font-medium", tab === t ? "bg-brand-soft text-brand-soft-ink" : "text-ink-muted")}>{l}</button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr_22rem]">
        <section aria-label="Master resume" className={cn(tab !== "compare" && "hidden xl:block")}>
          <h3 className="mb-2 font-sans text-sm font-semibold text-ink-muted">Master (unchanged)</h3>
          <ResumeDoc label="Master resume" content={p.masterContent} marks={leftMarks} />
        </section>
        <section aria-label="Tailored resume" className={cn(tab !== "compare" && "hidden xl:block")}>
          <h3 className="mb-2 font-sans text-sm font-semibold text-ink">Tailored <span className="font-normal text-ink-muted">— edit the wording directly</span></h3>
          <ResumeDoc label="Tailored resume" content={draft} marks={rightMarks} edit onChange={(fn) => setDraft((d) => { const n = structuredClone(d); fn(n); return n; })} />
        </section>

        <aside aria-label="Suggestions and gaps" className={cn(tab === "compare" && "hidden xl:block")}>
          <div role="tablist" aria-label="Rail" className="mb-3 hidden gap-1 rounded-xl border border-line bg-surface p-1 xl:flex">
            {([["changes", `Suggestions (${pending.length})`], ["gaps", `Gaps (${openGaps.length})`]] as [Tab, string][]).map(([t, l]) => (
              <button key={t} role="tab" aria-selected={(tab === "gaps") === (t === "gaps")} onClick={() => setTab(t)} className={cn("flex-1 rounded-lg px-2 py-1.5 text-sm font-medium", (tab === "gaps") === (t === "gaps") ? "bg-brand-soft text-brand-soft-ink" : "text-ink-muted")}>{l}</button>
            ))}
          </div>

          {tab !== "gaps" ? (
            <div>
              {p.changes.length === 0 ? (
                <p className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">We found nothing to improve without adding facts you haven’t shown. Your resume already reads well for this job.</p>
              ) : (
                <>
                  {pending.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await decideAllAction(p.id, "accepted"); if (r.ok) toast.success(`Accepted ${r.changed}${r.skipped ? ` (${r.skipped} skipped: you edited them)` : ""}`); else toast.error(r.message); router.refresh(); })}><CheckCheck data-icon="inline-start" aria-hidden="true" /> Accept all</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await decideAllAction(p.id, "rejected"); if (!r.ok) toast.error(r.message); router.refresh(); })}>Reject all</Button>
                    </div>
                  )}
                  <ul className="space-y-3">
                    {p.changes.map((c) => (
                      <ChangeCard key={c.id} change={c} state={changeState(draft, c)} requirements={p.job.requirements} bulletText={(id) => bulletIndex.get(id) ?? ""} busy={busy}
                        onDecide={(d) => decide(c.id, d)} onFocus={() => setTab("compare")} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <GapsPanel tailoredId={p.id} gaps={p.gaps} flush={flush} />
          )}
        </aside>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-surface/95 backdrop-blur md:bottom-0 md:left-64">
        <div className="page flex items-center gap-2 py-2.5 sm:gap-3">
          <p className={cn("mr-auto min-w-0 text-sm", saveError ? "text-danger" : "truncate text-ink-muted", !dirty && !saveError && "hidden sm:block", (dirty || saveError) && "flex-1")} role="status">{saveError ? `Couldn't save: ${saveError}` : dirty ? "Unsaved edits" : pending.length ? `${pending.length} to review` : "Up to date"}{p.version > 1 && ` · v${p.version}`}</p>
          {dirty && <Button variant="outline" disabled={busy} onClick={() => run(async () => { toast.success("Saved"); router.refresh(); })}>Save</Button>}
          <label className="sr-only" htmlFor="variant">Template</label>
          <NativeSelect id="variant" value={variant} onChange={(e) => { const v = e.target.value as "uk_eu" | "us"; setVariant(v); void setVariantAction(p.id, v); }} className="ml-auto h-9 w-auto min-w-0 flex-1 text-sm sm:ml-0 sm:flex-none">
            <option value="uk_eu">UK/EU CV (A4)</option>
            <option value="us">US résumé</option>
          </NativeSelect>
          <Button variant="outline" disabled={busy} onClick={() => doExport("docx")}><Download data-icon="inline-start" aria-hidden="true" /> DOCX</Button>
          <Button disabled={busy} onClick={() => doExport("pdf")}><Download data-icon="inline-start" aria-hidden="true" /> PDF</Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-6">
        <Button variant="outline" disabled={busy} onClick={() => run(async () => { const r = await retailorAction(p.id); if (!r.ok) toast.error(r.message); else toast.success("Re-tailored"); router.refresh(); })}>
          <RefreshCw data-icon="inline-start" aria-hidden="true" /> Re-tailor
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}><Trash2 data-icon="inline-start" aria-hidden="true" /> Delete this tailoring</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this tailored resume?</AlertDialogTitle>
              <AlertDialogDescription>The job and every version of this tailored resume will be removed. Your master resume is not affected.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={async () => { const r = await deleteTailoringAction(p.id); if (r.ok) router.push("/tailor"); else toast.error(r.message); }}>Delete</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-heading text-xl text-ink">{value}</dd>
      <dd className="text-xs text-ink-muted">{hint}</dd>
    </div>
  );
}
