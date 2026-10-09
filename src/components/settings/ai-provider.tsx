"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeApiKeyAction, saveAiSelectionAction, saveApiKeyAction, testAiAction } from "@/app/(app)/settings/actions";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDER_INFO, PROVIDERS, type Provider } from "@/lib/llm/catalog";
import { cn } from "@/lib/utils";

type Status = { provider: Provider; keySource: "own" | "server" | "none"; keyLast4: string | null };
export type AiView = { provider: Provider; model: string; providers: Status[] };

export function AiProviderSettings({ view }: { view: AiView }) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(view.provider);
  const [model, setModel] = useState(view.model);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const info = PROVIDER_INFO[provider];
  const status = view.providers.find((p) => p.provider === provider)!;
  const dirty = provider !== view.provider || model.trim() !== view.model;

  function choose(p: Provider) {
    setProvider(p);
    // Keep the saved model when returning to the saved provider; otherwise suggest that provider's default.
    setModel(p === view.provider ? view.model : PROVIDER_INFO[p].defaultModel);
    setResult(null);
  }

  function save(thenTest: boolean) {
    setResult(null);
    start(async () => {
      const r = await saveAiSelectionAction(provider, model);
      if (!r.ok) return setResult({ ok: false, message: r.message });
      router.refresh();
      if (!thenTest) {
        toast.success("AI provider saved");
        return;
      }
      const t = await testAiAction();
      setResult(t.ok ? { ok: true, message: `Working: ${t.provider} · ${t.model}` } : { ok: false, message: t.message });
    });
  }

  return (
    <div>
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-ink">Provider</legend>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="AI provider">
          {PROVIDERS.map((p) => {
            const st = view.providers.find((x) => x.provider === p)!;
            const selected = provider === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(p)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors hover:border-brand",
                  selected ? "border-brand bg-brand-soft" : "border-line-strong bg-surface",
                )}
              >
                <span className="block font-medium text-ink">{PROVIDER_INFO[p].label}</span>
                <span className={cn("mt-1 block text-sm", st.keySource === "none" ? "text-change-ink" : "text-ink-muted")}>
                  {st.keySource === "own" ? `Your key ••••${st.keyLast4}` : st.keySource === "server" ? "Server key available" : "No key yet"}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6">
        <Label htmlFor="model" className="mb-1.5 block text-sm font-medium text-ink">Model</Label>
        <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} list="model-suggestions" className="h-11 text-base sm:max-w-sm" autoComplete="off" spellCheck={false} />
        <datalist id="model-suggestions">
          {info.models.map((m) => <option key={m.id} value={m.id}>{m.note}</option>)}
        </datalist>
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested models">
          {info.models.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setModel(m.id)} title={m.note} className={cn("rounded-full border px-2.5 py-1 text-xs hover:border-brand hover:text-brand", model === m.id ? "border-brand text-brand" : "border-line-strong text-ink-muted")}>
                {m.id}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-ink-muted">Type any model your account can use. The model must support structured (JSON) output.</p>
      </div>

      <KeyEditor key={provider} provider={provider} status={status} />

      <div className="mt-6 flex flex-wrap gap-2">
        <Button disabled={pending || status.keySource === "none" || !dirty} onClick={() => save(false)} variant="outline">Save</Button>
        <Button disabled={pending || status.keySource === "none"} onClick={() => save(true)}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <CheckCircle2 data-icon="inline-start" aria-hidden="true" />}
          {pending ? "Checking…" : "Save & test"}
        </Button>
      </div>
      {status.keySource === "none" && <p className="mt-3 text-sm text-ink-muted">Add a key for {info.label} above to use it.</p>}

      {result && (
        result.ok
          ? <p role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-ink"><CheckCircle2 className="size-4 text-success" aria-hidden="true" />{result.message}</p>
          : <ErrorState className="mt-4" title="That didn’t work" message={result.message} />
      )}
    </div>
  );
}

function KeyEditor({ provider, status }: { provider: Provider; status: Status }) {
  const router = useRouter();
  const info = PROVIDER_INFO[provider];
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6 rounded-xl border border-line bg-paper p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-brand" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">{info.label} API key</p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {status.keySource === "own" && <>Using your saved key ending in {status.keyLast4}. </>}
        {status.keySource === "server" && <>This server has a key configured; saving your own overrides it for your account. </>}
        {status.keySource === "none" && <>No key set. </>}
        Stored encrypted and never shown again.{" "}
        <a href={info.keysUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand underline underline-offset-4">
          Get a key <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={status.keySource === "own" ? "Paste a new key to replace it" : info.keyHint}
          aria-label={`${info.label} API key`}
          autoComplete="off"
          spellCheck={false}
          className="h-11 flex-1 text-base"
        />
        <Button
          disabled={pending || !key.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await saveApiKeyAction(provider, key);
              if (!r.ok) return setError(r.message);
              setKey("");
              toast.success("Key saved");
              router.refresh();
            })
          }
          className="h-11"
        >
          Save key
        </Button>
        {status.keySource === "own" && (
          <Button
            variant="outline"
            disabled={pending}
            className="h-11"
            onClick={() =>
              start(async () => {
                const r = await removeApiKeyAction(provider);
                if (!r.ok) return setError(r.message);
                toast.success("Key removed");
                router.refresh();
              })
            }
          >
            <Trash2 data-icon="inline-start" aria-hidden="true" /> Remove
          </Button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
