import "server-only";
import { z } from "zod";
import { generateStructured, untrusted, UNTRUSTED_NOTICE, type LlmConfig } from "@/lib/llm";
import type { ResumeContent } from "@/lib/resume/schema";
import type { Dropped } from "./materialize";
import type { TailorChange } from "./types";

/**
 * Second, independent truthfulness pass. The first (factcheck.ts) is deterministic and catches invented numbers
 * and keywords; this one catches SOFT embellishment ("…improving team skills", "designed AND MAINTAINED") by asking a
 * strict reviewer whether each rewritten text adds anything the resume doesn't support. Unsupported changes are dropped.
 */
const verdictSchema = z.object({
  results: z.array(z.object({ id: z.string(), supported: z.boolean(), unsupportedClaims: z.array(z.string()) })),
});

const SYSTEM = `You are a strict fact-checker for resume edits. For each item you get the ORIGINAL text and the REWRITTEN text (plus the full resume for context).

Mark supported=true ONLY if the rewrite says nothing the original text (or, for a summary/headline, the resume) does not already say or clearly imply. Rewording, reordering and emphasis are fine.

Mark supported=false (and list the unsupported claims) if the rewrite adds ANY of:
- an outcome, benefit or impact ("improving…", "reducing…", "enabling…", "resulting in…") not stated
- a responsibility or scope not stated ("maintained", "owned", "led", "managed", "architected", "end-to-end")
- an adjective implying scale, quality or seniority not stated ("high-throughput", "scalable", "robust", "enterprise", "mission-critical")
- a tool, technology, domain, team size, number or duration not stated
When in doubt, supported=false. Return one result per item id.
${UNTRUSTED_NOTICE}`;

export async function verifyChanges(master: ResumeContent, changes: TailorChange[], config: LlmConfig): Promise<{ kept: TailorChange[]; dropped: Dropped[] }> {
  const items = changes.flatMap((c) =>
    c.kind === "bullet_text" || c.kind === "summary" || c.kind === "headline" ? [{ id: c.id, kind: c.kind, original: c.before, rewritten: c.after }] : [],
  );
  if (items.length === 0) return { kept: changes, dropped: [] };

  const out = await generateStructured(verdictSchema, {
    config,
    system: SYSTEM,
    prompt: `${untrusted("resume-json", JSON.stringify(master))}\n\n${untrusted("edits-json", JSON.stringify(items))}`,
    maxOutputTokens: 2500,
    temperature: 0,
  });

  const verdicts = new Map(out.results.map((r) => [r.id, r]));
  const kept: TailorChange[] = [];
  const dropped: Dropped[] = [];
  for (const c of changes) {
    if (!items.some((i) => i.id === c.id)) {
      kept.push(c);
      continue;
    }
    const v = verdicts.get(c.id);
    // Fail closed: a rewrite the reviewer didn't explicitly approve is dropped.
    if (v?.supported) kept.push(c);
    else dropped.push({ op: c.kind, why: `unverified: ${v?.unsupportedClaims.slice(0, 2).join("; ") || "not confirmed by reviewer"}`, target: c.kind === "bullet_text" ? c.bulletId : null, text: c.kind === "bullet_text" || c.kind === "summary" || c.kind === "headline" ? c.after : null });
  }
  return { kept, dropped };
}
