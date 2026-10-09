import "server-only";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db, tables } from "@/lib/db";
import { env } from "@/lib/env";
import { LlmNotConfiguredError, type LlmConfig } from "./index";
import { isProvider, PROVIDER_INFO, PROVIDERS, type Provider } from "./catalog";

const ENV_KEY = (p: Provider): string | undefined => env()[PROVIDER_INFO[p].envVar as keyof ReturnType<typeof env>] as string | undefined;

async function row(userId: string) {
  const [r] = await db().select().from(tables.userAiSettings).where(eq(tables.userAiSettings.userId, userId)).limit(1);
  return r ?? null;
}

function userKey(r: Awaited<ReturnType<typeof row>>, p: Provider): string | null {
  const blob = r?.encryptedKeys?.[p];
  return blob ? decryptSecret(blob) : null;
}

/**
 * Resolution order for each call:
 *  provider: user's choice → LLM_PROVIDER env
 *  model:    user's choice → LLM_MODEL env (only if it belongs to the same provider as the env default) → catalog default
 *  key:      user's own saved key → server env key
 * Throws LlmNotConfiguredError when no key exists for the chosen provider.
 */
export async function resolveLlm(userId: string): Promise<LlmConfig> {
  const r = await row(userId);
  const e = env();
  const provider: Provider = isProvider(r?.provider) ? r.provider : e.LLM_PROVIDER;
  const model = r?.model?.trim() || (provider === e.LLM_PROVIDER ? e.LLM_MODEL : undefined) || PROVIDER_INFO[provider].defaultModel;
  const apiKey = userKey(r, provider) ?? ENV_KEY(provider);
  if (!apiKey) throw new LlmNotConfiguredError(provider);
  return { provider, model, apiKey };
}

export type ProviderStatus = {
  provider: Provider;
  /** Where the key that would be used comes from. */
  keySource: "own" | "server" | "none";
  /** Last 4 characters of the user's own key, for recognition. Never the full key. */
  keyLast4: string | null;
};

export type AiSettingsView = {
  provider: Provider;
  model: string;
  /** What the user explicitly saved (null = following server defaults). */
  explicitProvider: Provider | null;
  explicitModel: string | null;
  providers: ProviderStatus[];
};

export async function getAiSettingsView(userId: string): Promise<AiSettingsView> {
  const r = await row(userId);
  const e = env();
  const provider: Provider = isProvider(r?.provider) ? r.provider : e.LLM_PROVIDER;
  const model = r?.model?.trim() || (provider === e.LLM_PROVIDER ? e.LLM_MODEL : undefined) || PROVIDER_INFO[provider].defaultModel;
  return {
    provider,
    model,
    explicitProvider: isProvider(r?.provider) ? r.provider : null,
    explicitModel: r?.model?.trim() || null,
    providers: PROVIDERS.map((p) => {
      const own = userKey(r, p);
      return { provider: p, keySource: own ? "own" : ENV_KEY(p) ? "server" : "none", keyLast4: own ? own.slice(-4) : null };
    }),
  };
}

async function upsert(userId: string, patch: Partial<{ provider: string | null; model: string | null; encryptedKeys: Record<string, string> }>) {
  const cur = await row(userId);
  const next = {
    provider: patch.provider !== undefined ? patch.provider : (cur?.provider ?? null),
    model: patch.model !== undefined ? patch.model : (cur?.model ?? null),
    encryptedKeys: patch.encryptedKeys ?? cur?.encryptedKeys ?? {},
  };
  await db()
    .insert(tables.userAiSettings)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: tables.userAiSettings.userId, set: next });
}

export const saveAiSelection = (userId: string, provider: Provider, model: string | null) => upsert(userId, { provider, model });

export async function saveUserKey(userId: string, provider: Provider, apiKey: string) {
  const cur = await row(userId);
  await upsert(userId, { encryptedKeys: { ...(cur?.encryptedKeys ?? {}), [provider]: encryptSecret(apiKey) } });
}

export async function removeUserKey(userId: string, provider: Provider) {
  const cur = await row(userId);
  const keys = { ...(cur?.encryptedKeys ?? {}) };
  delete keys[provider];
  await upsert(userId, { encryptedKeys: keys });
}
