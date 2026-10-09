import "server-only";
import { extractJob, MIN_JOB_CHARS } from "./extract";
import { checkRobots, FetchBlockedError, parseSafeUrl, safeFetchText } from "./net";

export class IngestError extends Error {
  constructor(
    public readonly code: "unreadable" | "too_short" | "too_long" | "empty",
    message: string,
    /** The UI should switch to the paste box. */
    public readonly pasteFallback = true,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export type IngestedJob = { text: string; url: string | null; source: "pasted_url" | "pasted_text"; hints: { title?: string; company?: string; location?: string } };

const MAX_PASTE = 30_000;

export function ingestPastedText(raw: string): IngestedJob {
  const text = raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new IngestError("empty", "Paste the job description to continue.", false);
  if (text.length < 200) throw new IngestError("too_short", "That's too short to be a job description. Paste the full text of the posting.", false);
  return { text: text.slice(0, MAX_PASTE), url: null, source: "pasted_text", hints: {} };
}

/** Reads a job link. On any failure the caller shows the paste box (the fallback is always available). */
export async function ingestUrl(rawUrl: string): Promise<IngestedJob> {
  try {
    const u = parseSafeUrl(rawUrl);
    await checkRobots(u);
    const res = await safeFetchText(u.toString());
    const job = extractJob(res.body);
    if (job.text.length < MIN_JOB_CHARS) {
      throw new IngestError("unreadable", "We couldn't read that page. It probably loads its content with JavaScript. Copy the job description and paste it instead.");
    }
    return { text: job.text, url: res.finalUrl, source: "pasted_url", hints: job.hints };
  } catch (e) {
    if (e instanceof IngestError) throw e;
    if (e instanceof FetchBlockedError) throw new IngestError("unreadable", e.message);
    throw e;
  }
}
