"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";
import { updateBriefAction } from "@/app/(app)/prep/actions";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyBrief } from "@/lib/prep/schema";

const checkKey = (prepId: string) => `jobsmith:prep:${prepId}:research`;
const loadChecked = (prepId: string): number[] => {
  try { return JSON.parse(localStorage.getItem(checkKey(prepId)) ?? "[]") as number[]; } catch { return []; }
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-lg text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}
const Bullets = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1.5 pl-5 text-[0.95rem] text-ink marker:text-brand">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;

export function BriefPanel({ prepId, brief, companyUrl }: { prepId: string; brief: CompanyBrief; companyUrl: string | null }) {
  const router = useRouter();
  const [checked, setChecked] = useState<number[]>(() => loadChecked(prepId));
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (i: number) => {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i];
    setChecked(next);
    try { localStorage.setItem(checkKey(prepId), JSON.stringify(next)); } catch { /* storage blocked */ }
  };

  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-paper p-3 text-sm text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <span>Built only from {brief.sources.includes("company_page") ? <>the job posting and the company page you added{companyUrl && <> (<a href={companyUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-brand underline underline-offset-4">link <ExternalLink className="size-3" aria-hidden="true" /></a>)</>}</> : "the job posting"}. We can’t browse the web, so nothing here comes from memory. Research the rest yourself using the checklist.</span>
      </p>

      <Card title="At a glance"><p className="text-[0.95rem] leading-relaxed text-ink">{brief.summary || "The posting says very little about the company."}</p></Card>

      {brief.whatTheyDo.length > 0 && <Card title="What the role and team do"><Bullets items={brief.whatTheyDo} /></Card>}
      {brief.techAndTools.length > 0 && (
        <Card title="Tools and technologies named">
          <ul className="flex flex-wrap gap-1.5">{brief.techAndTools.map((t) => <li key={t} className="rounded-full bg-brand-soft px-2.5 py-1 text-sm text-brand-soft-ink">{t}</li>)}</ul>
        </Card>
      )}
      {brief.cultureSignals.length > 0 && <Card title="How they describe working there"><Bullets items={brief.cultureSignals} /></Card>}

      <Card title="Settle these early">
        <Bullets items={brief.clarifyEarly} />
        <p className="mt-3 text-xs text-ink-muted">Based on your profile and what the posting says.</p>
      </Card>

      <Card title="Research before the interview">
        <ul className="space-y-2">
          {brief.researchChecklist.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <input id={`rc-${i}`} type="checkbox" checked={checked.includes(i)} onChange={() => toggle(i)} className="mt-1 size-4 accent-[var(--brand)]" />
              <label htmlFor={`rc-${i}`} className={checked.includes(i) ? "text-[0.95rem] text-ink-muted line-through" : "text-[0.95rem] text-ink"}>{item}</label>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Questions to ask them"><Bullets items={brief.questionsToAsk} /></Card>

      <details className="rounded-2xl border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-medium text-brand">{brief.sources.includes("company_page") ? "Use a different company page" : "Add a company page for a richer brief"}</summary>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="co-url" className="mb-1.5 block text-sm text-ink">Link to the company’s About or careers page</Label>
            <Input id="co-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://company.com/about" className="h-11" />
          </div>
          <div>
            <Label htmlFor="co-text" className="mb-1.5 block text-sm text-ink">…or paste text from it</Label>
            <Textarea id="co-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={40000} />
          </div>
          {error && <ErrorState message={error} />}
          <Button disabled={pending || (!url.trim() && text.trim().length < 80)} onClick={() => start(async () => {
            setError(null);
            const r = await updateBriefAction({ prepId, companyUrl: url.trim() || undefined, companyText: text.trim() || undefined });
            if (!r.ok) return setError(r.message);
            toast.success("Brief updated. Your questions and practice are untouched.");
            setUrl(""); setText("");
            router.refresh();
          })}>{pending ? "Updating…" : "Update the brief"}</Button>
        </div>
      </details>
    </div>
  );
}
