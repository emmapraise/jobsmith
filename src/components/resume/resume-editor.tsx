"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveResumeAction } from "@/app/(app)/resume/actions";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewFlags } from "@/lib/resume/checks";
import { newId, type Bullet, type ResumeContent } from "@/lib/resume/schema";
import { cn } from "@/lib/utils";

type Draft = (r: ResumeContent) => void;

function move<T>(arr: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function ResumeEditor({ initial, alreadyReviewed }: { initial: ResumeContent; alreadyReviewed: boolean }) {
  const router = useRouter();
  const [r, setR] = useState<ResumeContent>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(r) !== baseline, [r, baseline]);
  const flags = useMemo(() => reviewFlags(r), [r]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const update = (fn: Draft) =>
    setR((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  function save(confirm: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await saveResumeAction(r, confirm);
      if (!res.ok) {
        setError(res.message);
        toast.error(res.message);
        return;
      }
      setBaseline(JSON.stringify(r));
      if (confirm) {
        toast.success("Resume confirmed");
        router.push("/resume");
        router.refresh();
      } else {
        toast.success("Saved");
        router.refresh();
      }
    });
  }

  const fixCount = flags.filter((f) => f.severity === "fix").length;

  return (
    <div className="pb-28">
      {flags.length > 0 && (
        <section aria-labelledby="flags" className="mb-8 rounded-2xl border border-change-line bg-change-soft p-5 text-change-ink">
          <h2 id="flags" className="flex items-center gap-2 text-lg">
            <AlertCircle className="size-5" aria-hidden="true" />
            {fixCount ? `${fixCount} to fix` : "A few things to check"}
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {flags.map((f) => (
              <li key={f.id}>
                <a
                  href={`#${f.targetId ? `item-${f.targetId}` : `sec-${f.section}`}`}
                  className="underline underline-offset-4 hover:no-underline"
                >
                  {f.message}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-8">
        <Section id="contact" title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" id="c-name">
              <Input id="c-name" value={r.contact.fullName} onChange={(e) => update((d) => void (d.contact.fullName = e.target.value))} autoComplete="name" />
            </Field>
            <Field label="Headline" id="c-headline" hint="e.g. Senior Backend Engineer">
              <Input id="c-headline" value={r.contact.headline} onChange={(e) => update((d) => void (d.contact.headline = e.target.value))} />
            </Field>
            <Field label="Email" id="c-email">
              <Input id="c-email" type="email" value={r.contact.email} onChange={(e) => update((d) => void (d.contact.email = e.target.value))} autoComplete="email" />
            </Field>
            <Field label="Phone" id="c-phone">
              <Input id="c-phone" type="tel" value={r.contact.phone} onChange={(e) => update((d) => void (d.contact.phone = e.target.value))} autoComplete="tel" />
            </Field>
            <Field label="Location" id="c-loc" hint="City, Country" className="sm:col-span-2">
              <Input id="c-loc" value={r.contact.location} onChange={(e) => update((d) => void (d.contact.location = e.target.value))} />
            </Field>
          </div>
          <div className="mt-6">
            <p className="text-sm font-medium text-ink">Links</p>
            <div className="mt-2 space-y-3">
              {r.contact.links.map((l, i) => (
                <div key={l.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[10rem_1fr_auto]">
                  <Input aria-label={`Link ${i + 1} label`} placeholder="GitHub" value={l.label} onChange={(e) => update((d) => void (d.contact.links[i].label = e.target.value))} className="col-span-2 sm:col-span-1" />
                  <Input aria-label={`Link ${i + 1} URL`} placeholder="https://" value={l.url} onChange={(e) => update((d) => void (d.contact.links[i].url = e.target.value))} />
                  <IconBtn label={`Remove link ${i + 1}`} onClick={() => update((d) => void d.contact.links.splice(i, 1))}>
                    <Trash2 aria-hidden="true" />
                  </IconBtn>
                </div>
              ))}
            </div>
            <AddBtn onClick={() => update((d) => void d.contact.links.push({ id: newId(), label: "", url: "" }))}>Add link</AddBtn>
          </div>
        </Section>

        <Section id="summary" title="Summary" hint="Two to four sentences. Optional.">
          <Label htmlFor="summary" className="sr-only">Summary</Label>
          <Textarea id="summary" rows={4} value={r.summary} onChange={(e) => update((d) => void (d.summary = e.target.value))} />
        </Section>

        <Section id="experience" title="Experience">
          <div className="space-y-5">
            {r.experience.map((e, i) => (
              <Card key={e.id} id={`item-${e.id}`} title={e.title || e.company || `Role ${i + 1}`}
                onUp={i > 0 ? () => update((d) => move(d.experience, i, -1)) : undefined}
                onDown={i < r.experience.length - 1 ? () => update((d) => move(d.experience, i, 1)) : undefined}
                onRemove={() => update((d) => void d.experience.splice(i, 1))}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Job title" id={`e-${e.id}-t`}>
                    <Input id={`e-${e.id}-t`} value={e.title} onChange={(ev) => update((d) => void (d.experience[i].title = ev.target.value))} />
                  </Field>
                  <Field label="Company" id={`e-${e.id}-c`}>
                    <Input id={`e-${e.id}-c`} value={e.company} onChange={(ev) => update((d) => void (d.experience[i].company = ev.target.value))} />
                  </Field>
                  <Field label="Location" id={`e-${e.id}-l`}>
                    <Input id={`e-${e.id}-l`} value={e.location} onChange={(ev) => update((d) => void (d.experience[i].location = ev.target.value))} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start" id={`e-${e.id}-s`}>
                      <Input id={`e-${e.id}-s`} value={e.start} placeholder="YYYY-MM" onChange={(ev) => update((d) => void (d.experience[i].start = ev.target.value))} />
                    </Field>
                    <Field label="End" id={`e-${e.id}-e`}>
                      <Input id={`e-${e.id}-e`} value={e.current ? "" : e.end} disabled={e.current} placeholder={e.current ? "Present" : "YYYY-MM"} onChange={(ev) => update((d) => void (d.experience[i].end = ev.target.value))} />
                    </Field>
                  </div>
                </div>
                <label className="mt-3 flex w-fit items-center gap-2 text-sm text-ink">
                  <Checkbox checked={e.current} onCheckedChange={(v) => update((d) => { d.experience[i].current = Boolean(v); if (v) d.experience[i].end = ""; })} />
                  I currently work here
                </label>
                <Bullets label="Bullet points" items={e.bullets} idPrefix={`e-${e.id}`}
                  onChange={(fn) => update((d) => fn(d.experience[i].bullets))} />
              </Card>
            ))}
          </div>
          <AddBtn onClick={() => update((d) => void d.experience.push({ id: newId(), company: "", title: "", location: "", start: "", end: "", current: false, bullets: [] }))}>Add role</AddBtn>
        </Section>

        <Section id="education" title="Education">
          <div className="space-y-5">
            {r.education.map((e, i) => (
              <Card key={e.id} id={`item-${e.id}`} title={e.institution || `Education ${i + 1}`}
                onRemove={() => update((d) => void d.education.splice(i, 1))}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Institution" id={`ed-${e.id}-i`}><Input id={`ed-${e.id}-i`} value={e.institution} onChange={(ev) => update((d) => void (d.education[i].institution = ev.target.value))} /></Field>
                  <Field label="Degree" id={`ed-${e.id}-d`}><Input id={`ed-${e.id}-d`} value={e.degree} onChange={(ev) => update((d) => void (d.education[i].degree = ev.target.value))} /></Field>
                  <Field label="Field of study" id={`ed-${e.id}-f`}><Input id={`ed-${e.id}-f`} value={e.field} onChange={(ev) => update((d) => void (d.education[i].field = ev.target.value))} /></Field>
                  <Field label="Location" id={`ed-${e.id}-l`}><Input id={`ed-${e.id}-l`} value={e.location} onChange={(ev) => update((d) => void (d.education[i].location = ev.target.value))} /></Field>
                  <Field label="Start" id={`ed-${e.id}-s`}><Input id={`ed-${e.id}-s`} value={e.start} placeholder="YYYY" onChange={(ev) => update((d) => void (d.education[i].start = ev.target.value))} /></Field>
                  <Field label="End" id={`ed-${e.id}-e`}><Input id={`ed-${e.id}-e`} value={e.end} placeholder="YYYY" onChange={(ev) => update((d) => void (d.education[i].end = ev.target.value))} /></Field>
                </div>
                <Bullets label="Details (optional)" items={e.details} idPrefix={`ed-${e.id}`} onChange={(fn) => update((d) => fn(d.education[i].details))} />
              </Card>
            ))}
          </div>
          <AddBtn onClick={() => update((d) => void d.education.push({ id: newId(), institution: "", degree: "", field: "", location: "", start: "", end: "", details: [] }))}>Add education</AddBtn>
        </Section>

        <Section id="skills" title="Skills" hint="Group related skills. Press Enter or comma to add each one.">
          <div className="space-y-5">
            {r.skills.map((g, i) => (
              <Card key={g.id} id={`item-${g.id}`} title={g.name || `Group ${i + 1}`} onRemove={() => update((d) => void d.skills.splice(i, 1))}>
                <Field label="Group name" id={`s-${g.id}-n`}><Input id={`s-${g.id}-n`} value={g.name} onChange={(ev) => update((d) => void (d.skills[i].name = ev.target.value))} /></Field>
                <div className="mt-4">
                  <Label htmlFor={`s-${g.id}-i`} className="mb-2 block text-sm font-medium text-ink">Skills</Label>
                  <TagInput id={`s-${g.id}-i`} label={`Add skill to ${g.name || "group"}`} value={g.items} onChange={(items) => update((d) => void (d.skills[i].items = items))} placeholder="TypeScript, Postgres…" />
                </div>
              </Card>
            ))}
          </div>
          <AddBtn onClick={() => update((d) => void d.skills.push({ id: newId(), name: "", items: [] }))}>Add skill group</AddBtn>
        </Section>

        <Section id="projects" title="Projects" hint="Optional.">
          <div className="space-y-5">
            {r.projects.map((p, i) => (
              <Card key={p.id} id={`item-${p.id}`} title={p.name || `Project ${i + 1}`} onRemove={() => update((d) => void d.projects.splice(i, 1))}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" id={`p-${p.id}-n`}><Input id={`p-${p.id}-n`} value={p.name} onChange={(ev) => update((d) => void (d.projects[i].name = ev.target.value))} /></Field>
                  <Field label="URL" id={`p-${p.id}-u`}><Input id={`p-${p.id}-u`} value={p.url} onChange={(ev) => update((d) => void (d.projects[i].url = ev.target.value))} /></Field>
                  <Field label="Description" id={`p-${p.id}-d`} className="sm:col-span-2"><Textarea id={`p-${p.id}-d`} rows={2} value={p.description} onChange={(ev) => update((d) => void (d.projects[i].description = ev.target.value))} /></Field>
                </div>
                <div className="mt-4">
                  <Label htmlFor={`p-${p.id}-t`} className="mb-2 block text-sm font-medium text-ink">Technologies</Label>
                  <TagInput id={`p-${p.id}-t`} label="Add technology" value={p.technologies} onChange={(v) => update((d) => void (d.projects[i].technologies = v))} />
                </div>
                <Bullets label="Bullet points" items={p.bullets} idPrefix={`p-${p.id}`} onChange={(fn) => update((d) => fn(d.projects[i].bullets))} />
              </Card>
            ))}
          </div>
          <AddBtn onClick={() => update((d) => void d.projects.push({ id: newId(), name: "", url: "", description: "", technologies: [], bullets: [] }))}>Add project</AddBtn>
        </Section>

        <Section id="certifications" title="Certifications" hint="Optional.">
          <div className="space-y-3">
            {r.certifications.map((c, i) => (
              <div key={c.id} id={`item-${c.id}`} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_12rem_8rem_auto]">
                <Input aria-label={`Certification ${i + 1} name`} placeholder="Name" value={c.name} onChange={(ev) => update((d) => void (d.certifications[i].name = ev.target.value))} className="col-span-2 sm:col-span-1" />
                <Input aria-label={`Certification ${i + 1} issuer`} placeholder="Issuer" value={c.issuer} onChange={(ev) => update((d) => void (d.certifications[i].issuer = ev.target.value))} />
                <Input aria-label={`Certification ${i + 1} date`} placeholder="YYYY" value={c.date} onChange={(ev) => update((d) => void (d.certifications[i].date = ev.target.value))} />
                <IconBtn label={`Remove certification ${i + 1}`} onClick={() => update((d) => void d.certifications.splice(i, 1))}><Trash2 aria-hidden="true" /></IconBtn>
              </div>
            ))}
          </div>
          <AddBtn onClick={() => update((d) => void d.certifications.push({ id: newId(), name: "", issuer: "", date: "" }))}>Add certification</AddBtn>
        </Section>

        <Section id="languages" title="Languages" hint="Spoken languages. Optional.">
          <div className="space-y-3">
            {r.languages.map((l, i) => (
              <div key={l.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_12rem_auto]">
                <Input aria-label={`Language ${i + 1}`} placeholder="English" value={l.name} onChange={(ev) => update((d) => void (d.languages[i].name = ev.target.value))} className="col-span-2 sm:col-span-1" />
                <Input aria-label={`Language ${i + 1} level`} placeholder="Fluent" value={l.level} onChange={(ev) => update((d) => void (d.languages[i].level = ev.target.value))} />
                <IconBtn label={`Remove language ${i + 1}`} onClick={() => update((d) => void d.languages.splice(i, 1))}><Trash2 aria-hidden="true" /></IconBtn>
              </div>
            ))}
          </div>
          <AddBtn onClick={() => update((d) => void d.languages.push({ id: newId(), name: "", level: "" }))}>Add language</AddBtn>
        </Section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-surface/95 backdrop-blur md:bottom-0 md:left-64">
        <div className="page flex items-center gap-2 py-2.5 sm:gap-3 sm:py-3">
          <p className="mr-auto min-w-0 truncate text-sm text-ink-muted" role="status">
            {error ? <span className="text-danger">{error}</span> : dirty ? "Unsaved changes" : "All changes saved"}
          </p>
          <Button variant="outline" disabled={!dirty || pending} onClick={() => save(false)}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button disabled={pending || (!dirty && alreadyReviewed)} onClick={() => save(true)}>
            <Check data-icon="inline-start" aria-hidden="true" />
            <span>{alreadyReviewed ? "Save & done" : <><span className="hidden sm:inline">Looks right — confirm</span><span className="sm:hidden">Confirm</span></>}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── small building blocks ───────────── */

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={`sec-${id}`} aria-labelledby={`h-${id}`} className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id={`h-${id}`} className="text-xl text-ink">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, id, hint, children, className }: { label: string; id: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {hint && <span className="ml-2 font-normal text-ink-muted">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

function Card({ id, title, children, onRemove, onUp, onDown }: { id: string; title: string; children: React.ReactNode; onRemove: () => void; onUp?: () => void; onDown?: () => void }) {
  return (
    <div id={id} className="scroll-mt-20 rounded-xl border border-line bg-paper p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="mr-auto truncate font-sans text-base font-semibold text-ink">{title}</h3>
        {onUp && <IconBtn label="Move up" onClick={onUp}><ArrowUp aria-hidden="true" /></IconBtn>}
        {onDown && <IconBtn label="Move down" onClick={onDown}><ArrowDown aria-hidden="true" /></IconBtn>}
        <IconBtn label={`Remove ${title}`} onClick={onRemove}><Trash2 aria-hidden="true" /></IconBtn>
      </div>
      {children}
    </div>
  );
}

function Bullets({ label, items, idPrefix, onChange }: { label: string; items: Bullet[]; idPrefix: string; onChange: (fn: (list: Bullet[]) => void) => void }) {
  return (
    <div className="mt-5">
      <p className="text-sm font-medium text-ink">{label}</p>
      <ul className="mt-2 space-y-2">
        {items.map((b, i) => (
          <li key={b.id} className="flex items-start gap-2">
            <Textarea
              aria-label={`${label} ${i + 1}`}
              id={`${idPrefix}-b-${b.id}`}
              rows={2}
              value={b.text}
              onChange={(ev) => onChange((l) => void (l[i].text = ev.target.value))}
              className="min-h-0 flex-1"
            />
            <div className="flex flex-col">
              {i > 0 && <IconBtn label="Move bullet up" onClick={() => onChange((l) => move(l, i, -1))}><ArrowUp aria-hidden="true" /></IconBtn>}
              <IconBtn label={`Remove bullet ${i + 1}`} onClick={() => onChange((l) => void l.splice(i, 1))}><Trash2 aria-hidden="true" /></IconBtn>
            </div>
          </li>
        ))}
      </ul>
      <AddBtn onClick={() => onChange((l) => void l.push({ id: newId(), text: "" }))}>Add bullet</AddBtn>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label} className="text-ink-muted hover:text-ink [&_svg]:size-4">
      {children}
    </Button>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} className={cn("mt-4")}>
      <Plus data-icon="inline-start" aria-hidden="true" /> {children}
    </Button>
  );
}
