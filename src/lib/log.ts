import "server-only";

/**
 * Privacy: resume text, profile answers and LLM payloads must never reach logs.
 * This logger only accepts a short event name plus primitive metadata, and drops
 * any string longer than 80 chars or under a key that looks like content.
 */
const BLOCKED_KEYS = /text|content|resume|prompt|answer|body|summary|bullet|email|name|phone|raw/i;

type Meta = Record<string, string | number | boolean | null | undefined>;

export function safeMeta(meta: Meta = {}): Meta {
  const out: Meta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (BLOCKED_KEYS.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 80) {
      out[k] = "[redacted:long-string]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level: "info" | "warn" | "error", event: string, meta?: Meta) {
  const line = JSON.stringify({ level, event, ...safeMeta(meta), t: new Date().toISOString() });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  info: (event: string, meta?: Meta) => emit("info", event, meta),
  warn: (event: string, meta?: Meta) => emit("warn", event, meta),
  /** Log an error by class + code only; never the message, which can echo user content. */
  error: (event: string, err?: unknown, meta?: Meta) =>
    emit("error", event, { ...meta, errorType: err instanceof Error ? err.name : typeof err }),
};
