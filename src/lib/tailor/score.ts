import type { Requirement } from "@/lib/jobs/schema";
import type { Coverage, Gap } from "./types";

/** 0-100 fit of the MASTER resume to the job: must-haves weigh 3, nice-to-haves 1; matched=1, partial=0.5, gap=0. */
export function matchScore(requirements: Requirement[], coverage: Coverage[]): number | null {
  if (requirements.length === 0) return null;
  const byId = new Map(coverage.map((c) => [c.requirementId, c]));
  let got = 0;
  let max = 0;
  for (const r of requirements) {
    const w = r.importance === "must" ? 3 : 1;
    max += w;
    const c = byId.get(r.id);
    if (!c) continue; // not assessed: counts as a gap (conservative)
    got += w * (c.status === "matched" ? 1 : c.status === "partial" ? 0.5 : 0);
  }
  return Math.round((got / max) * 100);
}

/** An unsupported "matched" claim is downgraded: matched requires evidence text. Unknown ids are dropped. */
export function sanitiseCoverage(requirements: Requirement[], coverage: Coverage[]): Coverage[] {
  const ids = new Set(requirements.map((r) => r.id));
  const seen = new Set<string>();
  const out: Coverage[] = [];
  for (const c of coverage) {
    if (!ids.has(c.requirementId) || seen.has(c.requirementId)) continue;
    seen.add(c.requirementId);
    out.push(c.status === "matched" && !c.evidence.trim() ? { ...c, status: "partial" } : c);
  }
  for (const r of requirements) if (!seen.has(r.id)) out.push({ requirementId: r.id, status: "gap", evidence: "" });
  return out;
}

/** Gaps become questions: every uncovered must-have, plus up to 3 uncovered nice-to-haves. Never invented content. */
export function buildGaps(requirements: Requirement[], coverage: Coverage[], llmQuestions: Map<string, string>): Gap[] {
  const status = new Map(coverage.map((c) => [c.requirementId, c.status]));
  const uncovered = requirements.filter((r) => status.get(r.id) !== "matched");
  const must = uncovered.filter((r) => r.importance === "must");
  const nice = uncovered.filter((r) => r.importance === "nice").slice(0, 3);
  return [...must, ...nice].map((r) => ({
    id: `gap-${r.id}`,
    requirementId: r.id,
    requirement: r.text,
    importance: r.importance,
    question: (llmQuestions.get(r.id) ?? "").trim().slice(0, 240) || `Do you have experience with: ${r.text}? If so, where and what did you do?`,
    answer: null,
    proposals: [],
    resolved: false,
  }));
}
