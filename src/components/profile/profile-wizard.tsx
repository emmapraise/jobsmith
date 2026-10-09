"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { saveProfileStepAction } from "@/app/(app)/profile/actions";
import { NativeSelect } from "@/components/native-select";
import { ErrorState } from "@/components/states";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { AUTH_STATUS, SENIORITY, WORK_MODES, type ProfileData } from "@/lib/profile/schema";
import { cn } from "@/lib/utils";

const ROLE_SUGGESTIONS = ["Backend Engineer", "Full-stack Engineer", "Frontend Engineer", "AI Engineer", "Machine Learning Engineer", "Data Engineer", "Platform Engineer", "DevOps / SRE", "Engineering Manager"];
const COUNTRY_SUGGESTIONS = ["United Kingdom", "Ireland", "Germany", "Netherlands", "France", "Spain", "Portugal", "Sweden", "Poland", "Remote (anywhere)"];

const SENIORITY_LABEL: Record<(typeof SENIORITY)[number], string> = {
  intern: "Intern", junior: "Junior", mid: "Mid-level", senior: "Senior", staff: "Staff", principal: "Principal", manager: "Engineering manager", director: "Director or above",
};
const WORK_MODE_LABEL: Record<(typeof WORK_MODES)[number], string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const AUTH_LABEL: Record<(typeof AUTH_STATUS)[number], string> = {
  citizen_or_settled: "I’m a citizen or permanent resident of the country I’m targeting",
  work_visa: "I already hold a work visa for a target country",
  need_sponsorship: "I’ll need a visa and an employer to sponsor it",
  student_visa: "I’m on a student or graduate visa",
  unsure: "I’m not sure yet",
};

type StepDef = { id: string; title: string; hint: string; optional?: boolean };
const STEPS: StepDef[] = [
  { id: "career", title: "Where are you in your career?", hint: "This sets the level of roles we suggest." },
  { id: "goal", title: "What do you want next?", hint: "In your own words. Roles you’d like to target help us focus." },
  { id: "where", title: "Where would you like to work?", hint: "Countries, relocation and work mode." },
  { id: "salary", title: "What salary are you aiming for?", hint: "Optional. Used only to filter and rank, never shared.", optional: true },
  { id: "auth", title: "Work authorization and visa", hint: "So we can tell you which roles are realistic." },
  { id: "deal", title: "Anything that’s a deal-breaker?", hint: "Optional. E.g. “no on-call”, “no crypto”, “need 4-day weeks”.", optional: true },
];

export function ProfileWizard({ initial, suggestedYears }: { initial: ProfileData; suggestedYears: number | null }) {
  const router = useRouter();
  const [p, setP] = useState<ProfileData>(initial);
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const set = <K extends keyof ProfileData>(k: K, v: ProfileData[K]) => setP((s) => ({ ...s, [k]: v }));

  const def = STEPS[step];
  const last = step === STEPS.length - 1;

  function patchFor(id: string): Partial<ProfileData> {
    switch (id) {
      case "career": return { seniority: p.seniority, yearsExperience: p.yearsExperience, currentCountry: p.currentCountry };
      case "goal": return { headlineGoal: p.headlineGoal, targetRoles: p.targetRoles };
      case "where": return { preferredCountries: p.preferredCountries, openToRelocation: p.openToRelocation, workModes: p.workModes };
      case "salary": return { salaryMin: p.salaryMin, salaryCurrency: p.salaryMin ? p.salaryCurrency ?? "GBP" : null, salaryPeriod: p.salaryMin ? p.salaryPeriod ?? "year" : null };
      case "auth": return { authorizationStatus: p.authorizationStatus, needsVisaSponsorship: p.needsVisaSponsorship, authorizationNotes: p.authorizationNotes };
      default: return { dealBreakers: p.dealBreakers };
    }
  }

  function next() {
    setError(null);
    start(async () => {
      const r = await saveProfileStepAction(patchFor(def.id), last);
      if (!r.ok) return setError(r.message);
      if (last) {
        router.push("/roles");
        router.refresh();
        return;
      }
      setStep((s) => s + 1);
      setTimeout(() => headingRef.current?.focus(), 0);
    });
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
    setError(null);
    setTimeout(() => headingRef.current?.focus(), 0);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between text-sm text-ink-muted">
        <span>Step {step + 1} of {STEPS.length}</span>
        {def.optional && <span>Optional</span>}
      </div>
      <Progress value={((step + 1) / STEPS.length) * 100} aria-label={`Step ${step + 1} of ${STEPS.length}`} />

      <section aria-labelledby="step-title" className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-title text-ink outline-none">{def.title}</h2>
        <p className="mt-2 text-ink-muted">{def.hint}</p>

        <div className="mt-6 space-y-6">
          {def.id === "career" && (
            <>
              <F label="Your level" id="seniority">
                <NativeSelect id="seniority" value={p.seniority ?? ""} onChange={(e) => set("seniority", (e.target.value || null) as ProfileData["seniority"])}>
                  <option value="">Choose…</option>
                  {SENIORITY.map((s) => <option key={s} value={s}>{SENIORITY_LABEL[s]}</option>)}
                </NativeSelect>
              </F>
              <F label="Years of professional experience" id="years" hint={suggestedYears !== null ? `Your resume suggests about ${suggestedYears}` : undefined}>
                <Input id="years" type="number" inputMode="decimal" min={0} max={60} step={0.5} value={p.yearsExperience ?? ""} className="h-11 text-base sm:max-w-40"
                  onChange={(e) => set("yearsExperience", e.target.value === "" ? null : Math.min(60, Math.max(0, Number(e.target.value))))} />
                {suggestedYears !== null && p.yearsExperience === null && (
                  <button type="button" className="mt-2 text-sm text-brand underline underline-offset-4" onClick={() => set("yearsExperience", suggestedYears)}>Use {suggestedYears}</button>
                )}
              </F>
              <F label="Country you live in now" id="country">
                <Input id="country" value={p.currentCountry} autoComplete="country-name" className="h-11 text-base" onChange={(e) => set("currentCountry", e.target.value)} placeholder="e.g. Nigeria" />
              </F>
            </>
          )}

          {def.id === "goal" && (
            <>
              <F label="What are you looking for?" id="goal">
                <Textarea id="goal" rows={4} maxLength={500} value={p.headlineGoal} onChange={(e) => set("headlineGoal", e.target.value)} placeholder="e.g. A backend or AI engineering role at a product company where I can own services end to end." />
              </F>
              <F label="Roles you’d like to target" id="roles">
                <TagInput id="roles" label="Add a target role" value={p.targetRoles} onChange={(v) => set("targetRoles", v)} suggestions={ROLE_SUGGESTIONS} max={10} placeholder="Type a role, press Enter" />
              </F>
            </>
          )}

          {def.id === "where" && (
            <>
              <F label="Preferred countries" id="countries">
                <TagInput id="countries" label="Add a country" value={p.preferredCountries} onChange={(v) => set("preferredCountries", v)} suggestions={COUNTRY_SUGGESTIONS} max={20} placeholder="Type a country, press Enter" />
              </F>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Would you relocate for the right role?</legend>
                <RadioGroup value={p.openToRelocation === null ? "" : p.openToRelocation ? "yes" : "no"} onValueChange={(v) => set("openToRelocation", v === "yes")} className="flex flex-wrap gap-2">
                  {[["yes", "Yes"], ["no", "No, remote only"]].map(([v, l]) => (
                    <Label key={v} htmlFor={`rel-${v}`} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-strong px-4 py-2.5 text-base text-ink", (p.openToRelocation === (v === "yes")) && p.openToRelocation !== null && "border-brand bg-brand-soft")}>
                      <RadioGroupItem id={`rel-${v}`} value={v} /> {l}
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Work mode (choose any)</legend>
                <div className="flex flex-wrap gap-2">
                  {WORK_MODES.map((m) => (
                    <Label key={m} htmlFor={`wm-${m}`} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-strong px-4 py-2.5 text-base text-ink", p.workModes.includes(m) && "border-brand bg-brand-soft")}>
                      <Checkbox id={`wm-${m}`} checked={p.workModes.includes(m)} onCheckedChange={(c) => set("workModes", c ? [...p.workModes, m] : p.workModes.filter((x) => x !== m))} />
                      {WORK_MODE_LABEL[m]}
                    </Label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {def.id === "salary" && (
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem]">
              <F label="Minimum you’d accept" id="salary">
                <Input id="salary" type="number" inputMode="numeric" min={0} step={1000} value={p.salaryMin ?? ""} className="h-11 text-base" onChange={(e) => set("salaryMin", e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))))} placeholder="e.g. 60000" />
              </F>
              <F label="Currency" id="cur">
                <NativeSelect id="cur" value={p.salaryCurrency ?? "GBP"} onChange={(e) => set("salaryCurrency", e.target.value)}>
                  {["GBP", "EUR", "USD", "NGN"].map((c) => <option key={c}>{c}</option>)}
                </NativeSelect>
              </F>
              <F label="Per" id="per">
                <NativeSelect id="per" value={p.salaryPeriod ?? "year"} onChange={(e) => set("salaryPeriod", e.target.value as "year" | "month")}>
                  <option value="year">year</option>
                  <option value="month">month</option>
                </NativeSelect>
              </F>
            </div>
          )}

          {def.id === "auth" && (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Which describes you best?</legend>
                <RadioGroup value={p.authorizationStatus ?? ""} onValueChange={(v) => set("authorizationStatus", v as ProfileData["authorizationStatus"])} className="gap-2">
                  {AUTH_STATUS.map((s) => (
                    <Label key={s} htmlFor={`auth-${s}`} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border border-line-strong px-4 py-3 text-base leading-snug text-ink", p.authorizationStatus === s && "border-brand bg-brand-soft")}>
                      <RadioGroupItem id={`auth-${s}`} value={s} className="mt-0.5" /> {AUTH_LABEL[s]}
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Do you need an employer to sponsor your visa?</legend>
                <RadioGroup value={p.needsVisaSponsorship === null ? "" : p.needsVisaSponsorship ? "yes" : "no"} onValueChange={(v) => set("needsVisaSponsorship", v === "yes")} className="flex flex-wrap gap-2">
                  {[["yes", "Yes, I need sponsorship"], ["no", "No"]].map(([v, l]) => (
                    <Label key={v} htmlFor={`sp-${v}`} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-strong px-4 py-2.5 text-base text-ink", p.needsVisaSponsorship !== null && p.needsVisaSponsorship === (v === "yes") && "border-brand bg-brand-soft")}>
                      <RadioGroupItem id={`sp-${v}`} value={v} /> {l}
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>
              <F label="Anything to add? (optional)" id="auth-notes">
                <Textarea id="auth-notes" rows={2} maxLength={500} value={p.authorizationNotes} onChange={(e) => set("authorizationNotes", e.target.value)} placeholder="e.g. Nigerian citizen. Interested in UK Skilled Worker sponsorship." />
              </F>
            </>
          )}

          {def.id === "deal" && (
            <F label="Deal-breakers" id="deal">
              <Textarea id="deal" rows={4} maxLength={500} value={p.dealBreakers} onChange={(e) => set("dealBreakers", e.target.value)} />
            </F>
          )}
        </div>

        {error && <ErrorState className="mt-6" message={error} />}

        <div className="mt-8 flex items-center gap-2">
          <Button variant="ghost" onClick={back} disabled={step === 0 || pending}>
            <ArrowLeft data-icon="inline-start" aria-hidden="true" /> Back
          </Button>
          <Button className="ml-auto" onClick={next} disabled={pending}>
            {pending ? "Saving…" : last ? <><Check data-icon="inline-start" aria-hidden="true" /> Finish</> : <>{def.optional ? "Save & continue" : "Continue"} <ArrowRight data-icon="inline-end" aria-hidden="true" /></>}
          </Button>
        </div>
      </section>
    </div>
  );
}

function F({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {hint && <span className="ml-2 font-normal text-ink-muted">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}
