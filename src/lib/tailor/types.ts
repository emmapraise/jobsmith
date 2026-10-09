import { z } from "zod";

/**
 * A tailoring change is a MATERIALISED patch: it stores `before` and `after`, so it can be applied,
 * reverted, shown as a diff, and detected as stale if the user edits the same text. No change can add
 * a new employer, title, date, degree or bullet; the only operations are those below.
 */
export const decisionSchema = z.enum(["pending", "accepted", "rejected"]);
export type Decision = z.infer<typeof decisionSchema>;

const base = { id: z.string(), reason: z.string(), requirementIds: z.array(z.string()), decision: decisionSchema };

export const tailorChangeSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("bullet_text"), bulletId: z.string(), before: z.string(), after: z.string() }),
  z.object({ ...base, kind: z.literal("bullets_order"), parentId: z.string(), before: z.array(z.string()), after: z.array(z.string()) }),
  z.object({ ...base, kind: z.literal("summary"), before: z.string(), after: z.string() }),
  z.object({ ...base, kind: z.literal("headline"), before: z.string(), after: z.string() }),
  z.object({ ...base, kind: z.literal("skills_order"), groupId: z.string(), before: z.array(z.string()), after: z.array(z.string()) }),
  z.object({ ...base, kind: z.literal("skills_add"), groupId: z.string(), items: z.array(z.string()) }),
]);
export type TailorChange = z.infer<typeof tailorChangeSchema>;

export const coverageSchema = z.object({
  requirementId: z.string(),
  status: z.enum(["matched", "partial", "gap"]),
  /** Short pointer to where the resume shows it ("" for gaps). */
  evidence: z.string(),
});
export type Coverage = z.infer<typeof coverageSchema>;

export const gapSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  requirement: z.string(),
  importance: z.enum(["must", "nice"]),
  question: z.string(),
  /** What the user told us (becomes a proposed change to the MASTER resume, never silently added). */
  answer: z.string().nullable().default(null),
  proposals: z
    .array(z.object({ id: z.string(), description: z.string(), reason: z.string(), patch: z.unknown(), decision: decisionSchema }))
    .default([]),
  resolved: z.boolean().default(false),
});
export type Gap = z.infer<typeof gapSchema>;

export const analysisSchema = z.object({
  coverage: z.array(coverageSchema),
  /** Share of the job's keywords present in the master resume / the current tailored resume / if all suggestions were accepted. */
  keywords: z.object({ total: z.number(), master: z.array(z.string()), missing: z.array(z.string()) }),
});
export type Analysis = z.infer<typeof analysisSchema>;
