"use client";

import { ArrowDownUp, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { dateRange } from "@/lib/export/model";
import type { Bullet, ResumeContent } from "@/lib/resume/schema";
import { cn } from "@/lib/utils";

export type Mark = "pending" | "accepted";
/** keys: "summary" | "headline" | `bullet:${id}` | `bullets:${parentId}` | `skills:${groupId}` */
export type Marks = Record<string, Mark>;

const markClass = (m?: Mark) =>
  m === "pending" ? "bg-change-soft ring-1 ring-change-line" : m === "accepted" ? "bg-success-soft ring-1 ring-success/40" : "";

/**
 * Renders a resume as a readable document. `edit` mode makes text editable in place (wording only: facts like
 * employers, titles and dates are never editable here, and the server enforces that too).
 */
export function ResumeDoc({
  content,
  marks = {},
  edit = false,
  onChange,
  label,
}: {
  content: ResumeContent;
  marks?: Marks;
  edit?: boolean;
  onChange?: (fn: (draft: ResumeContent) => void) => void;
  label: string;
}) {
  const c = content;
  const update = (fn: (d: ResumeContent) => void) => onChange?.(fn);

  const bullets = (list: Bullet[], parentId: string, setList: (d: ResumeContent) => Bullet[]) => (
    <ul className="mt-1.5 space-y-1.5">
      {list.map((b) => (
        <li key={b.id} className="flex items-start gap-2 text-[0.9rem] leading-relaxed">
          <span className="mt-[0.2rem] text-ink-faint" aria-hidden="true">•</span>
          {edit ? (
            <div className="flex min-w-0 flex-1 items-start gap-1">
              <Textarea
                aria-label="Bullet point"
                value={b.text}
                rows={2}
                onChange={(e) => update((d) => { const x = setList(d).find((y) => y.id === b.id); if (x) x.text = e.target.value; })}
                className={cn("min-h-0 flex-1 px-2 py-1 text-[0.9rem] md:text-[0.9rem]", markClass(marks[`bullet:${b.id}`]))}
              />
              <button type="button" aria-label="Remove this bullet" title="Remove this bullet" onClick={() => update((d) => { const l = setList(d); const i = l.findIndex((y) => y.id === b.id); if (i >= 0) l.splice(i, 1); })} className="mt-1 rounded p-1 text-ink-faint hover:bg-surface-sunken hover:text-danger">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <span className={cn("rounded-sm px-1", markClass(marks[`bullet:${b.id}`]))}>{b.text}</span>
          )}
        </li>
      ))}
      {marks[`bullets:${parentId}`] && (
        <li className="ml-4"><span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", markClass(marks[`bullets:${parentId}`]))}><ArrowDownUp className="size-3" aria-hidden="true" /> bullet order {marks[`bullets:${parentId}`] === "pending" ? "suggested" : "changed"}</span></li>
      )}
    </ul>
  );

  return (
    <article aria-label={label} className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <header>
        <h3 className="font-heading text-2xl text-ink">{c.contact.fullName || "Your name"}</h3>
        {edit ? (
          <Input aria-label="Headline" value={c.contact.headline} onChange={(e) => update((d) => { d.contact.headline = e.target.value; })} placeholder="Headline" className={cn("mt-1 h-9", markClass(marks.headline))} />
        ) : (
          c.contact.headline && <p className={cn("mt-0.5 inline-block rounded-sm px-1 text-ink-muted", markClass(marks.headline))}>{c.contact.headline}</p>
        )}
        <p className="mt-1 text-xs text-ink-muted">{[c.contact.email, c.contact.phone, c.contact.location].filter(Boolean).join("  ·  ")}</p>
      </header>

      {(c.summary || edit) && (
        <Section title="Summary">
          {edit ? (
            <Textarea aria-label="Summary" value={c.summary} rows={4} onChange={(e) => update((d) => { d.summary = e.target.value; })} className={cn("text-[0.9rem] md:text-[0.9rem]", markClass(marks.summary))} />
          ) : (
            <p className={cn("rounded-sm px-1 text-[0.9rem] leading-relaxed", markClass(marks.summary))}>{c.summary}</p>
          )}
        </Section>
      )}

      {c.experience.length > 0 && (
        <Section title="Experience">
          <div className="space-y-4">
            {c.experience.map((e) => (
              <div key={e.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-medium text-ink">{[e.title, e.company].filter(Boolean).join(" — ")}</p>
                  <p className="text-xs text-ink-muted">{dateRange(e.start, e.end, e.current, "uk_eu")}</p>
                </div>
                {bullets(e.bullets, e.id, (d) => d.experience.find((x) => x.id === e.id)!.bullets)}
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.projects.length > 0 && (
        <Section title="Projects">
          <div className="space-y-3">
            {c.projects.map((p) => (
              <div key={p.id}>
                <p className="font-medium text-ink">{p.name}</p>
                {bullets(p.bullets, p.id, (d) => d.projects.find((x) => x.id === p.id)!.bullets)}
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.skills.length > 0 && (
        <Section title="Skills">
          <div className="space-y-2">
            {c.skills.map((g) => (
              <div key={g.id} className="text-[0.9rem]">
                <span className="font-medium text-ink">{g.name}: </span>
                <span className={cn("inline-flex flex-wrap gap-1 rounded-sm px-1 align-middle", markClass(marks[`skills:${g.id}`]))}>
                  {g.items.map((s) => (
                    <span key={s} className="inline-flex items-center gap-0.5 rounded bg-surface-sunken px-1.5 py-0.5 text-[0.8rem] text-ink">
                      {s}
                      {edit && (
                        <button type="button" aria-label={`Remove ${s}`} onClick={() => update((d) => { const grp = d.skills.find((x) => x.id === g.id)!; grp.items = grp.items.filter((i) => i !== s); })} className="rounded p-0.5 text-ink-faint hover:text-danger">
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.education.length > 0 && (
        <Section title="Education">
          <ul className="space-y-1 text-[0.9rem]">
            {c.education.map((e) => (
              <li key={e.id}>{[[e.degree, e.field].filter(Boolean).join(" in "), e.institution].filter(Boolean).join(" — ")}{e.end && <span className="text-ink-muted"> · {e.end}</span>}</li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="eyebrow border-b border-line pb-1">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}
