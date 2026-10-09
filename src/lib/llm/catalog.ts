/** Provider catalog. Pure data (no secrets), safe to import from client components. */
export const PROVIDERS = ["anthropic", "openai", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_INFO: Record<
  Provider,
  { label: string; envVar: string; keyHint: string; keysUrl: string; defaultModel: string; models: { id: string; note: string }[] }
> = {
  anthropic: {
    label: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    keyHint: "sk-ant-…",
    keysUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-5-5",
    models: [
      { id: "claude-sonnet-5-5", note: "Balanced: recommended" },
      { id: "claude-opus-5-5", note: "Strongest, slower" },
      { id: "claude-haiku-5-5", note: "Fastest, cheapest" },
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    envVar: "OPENAI_API_KEY",
    keyHint: "sk-…",
    keysUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4.1",
    // Models must support structured (JSON-schema) outputs; original "gpt-4" does not.
    // First four verified against a real key; gpt-5 only works on accounts that have access.
    models: [
      { id: "gpt-4.1", note: "Recommended: reliable structured output" },
      { id: "gpt-4.1-mini", note: "Cheaper" },
      { id: "gpt-4o", note: "Fast" },
      { id: "gpt-4o-mini", note: "Cheapest" },
      { id: "gpt-5", note: "Strongest, if your account has access" },
    ],
  },
  google: {
    label: "Google (Gemini)",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    keyHint: "AIza…",
    keysUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-pro",
    models: [
      { id: "gemini-2.5-pro", note: "Strongest" },
      { id: "gemini-2.5-flash", note: "Fast and cheap" },
    ],
  },
};

export const isProvider = (v: unknown): v is Provider => typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);

/** Model ids are free text but must be a plausible identifier. */
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:\-\/]{0,99}$/;
