import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/lib/db";
import { generateStructured, untrusted, UNTRUSTED_NOTICE } from "@/lib/llm";
import type { ProfileData } from "@/lib/profile/schema";
import type { ResumeContent } from "./schema";

export const insightsSchema = z.object({
  positioning: z.string(), // one-sentence "how the market will read you"
  strengths: z.array(z.string()),
  roles: z.array(
    z.object({
      title: z.string(),
      category: z.enum(["best_fit", "adjacent"]),
      fitScore: z.number().int().min(0).max(100),
      whyFit: z.string(),
      /** Facts from the resume that support this role. */
      evidence: z.array(z.string()),
      /** Skills/experience typical for the role that the resume doesn't show. */
      gaps: z.array(z.string()),
      searchKeywords: z.array(z.string()),
    }),
  ),
});

export type RoleInsights = z.infer<typeof insightsSchema>;

const SYSTEM = `You are an honest career analyst for software engineers, AI/ML engineers and other tech professionals.
From the resume and the candidate's stated preferences, identify:
- 4 to 5 "best_fit" roles they can credibly be hired into now.
- 4 to 5 "adjacent" roles reachable with a small step (different specialism, level or domain).

Rules:
- Ground every role in the resume. "evidence" lists concrete facts that appear in the resume (employers, technologies, outcomes) — never invent any.
- "gaps" lists what a typical hiring manager for that role would look for that the resume does NOT show. Be specific and kind.
- fitScore is your honest estimate 0-100 of how well the resume matches a typical posting for that role today; best_fit roles should generally score higher than adjacent ones. Do not inflate.
- Respect stated preferences (target roles, seniority, work mode, countries, visa needs) when choosing and ordering roles, but do not hide strong fits just because they are outside the stated targets — you may include them if clearly strong.
- Use standard industry job titles that people actually search for.
- searchKeywords: 3-6 terms useful when searching job boards for that role.
- positioning: one sentence on how the market will read this candidate. strengths: 3-5 short items.
- Do not state salaries, market demand figures or visa-sponsorship facts; you do not have reliable data for them.
${UNTRUSTED_NOTICE}`;

const relevantProfile = (p: ProfileData) => ({
  goal: p.headlineGoal,
  seniority: p.seniority,
  yearsExperience: p.yearsExperience,
  targetRoles: p.targetRoles,
  currentCountry: p.currentCountry,
  preferredCountries: p.preferredCountries,
  openToRelocation: p.openToRelocation,
  workModes: p.workModes,
  needsVisaSponsorship: p.needsVisaSponsorship,
  dealBreakers: p.dealBreakers,
});

export function insightsInputHash(resume: ResumeContent, profile: ProfileData): string {
  return createHash("sha256").update(JSON.stringify({ resume, profile: relevantProfile(profile) })).digest("hex").slice(0, 32);
}

export async function getCachedInsights(resumeId: string, hash: string): Promise<RoleInsights | null> {
  const [row] = await db()
    .select({ data: tables.roleInsights.data })
    .from(tables.roleInsights)
    .where(and(eq(tables.roleInsights.resumeId, resumeId), eq(tables.roleInsights.inputHash, hash)))
    .limit(1);
  if (!row) return null;
  const parsed = insightsSchema.safeParse(row.data);
  return parsed.success ? parsed.data : null;
}

export async function generateInsights(args: {
  userId: string;
  resumeId: string;
  resumeVersion: number;
  resume: ResumeContent;
  profile: ProfileData;
}): Promise<RoleInsights> {
  const hash = insightsInputHash(args.resume, args.profile);
  const out = await generateStructured(insightsSchema, {
    system: SYSTEM,
    prompt: `${untrusted("resume-json", JSON.stringify(args.resume))}\n\n${untrusted("preferences-json", JSON.stringify(relevantProfile(args.profile)))}`,
    maxOutputTokens: 6000,
    temperature: 0.3,
  });
  // Sort: best fit first, by score.
  out.roles.sort((a, b) => (a.category === b.category ? b.fitScore - a.fitScore : a.category === "best_fit" ? -1 : 1));

  await db()
    .insert(tables.roleInsights)
    .values({ userId: args.userId, resumeId: args.resumeId, resumeVersion: args.resumeVersion, inputHash: hash, data: out })
    .onConflictDoUpdate({ target: [tables.roleInsights.resumeId, tables.roleInsights.inputHash], set: { data: out } });
  return out;
}

/** Latest stored insights for a resume regardless of hash (to show stale results with a refresh prompt). */
export async function getLatestInsights(resumeId: string): Promise<{ data: RoleInsights; hash: string; createdAt: Date } | null> {
  const rows = await db()
    .select()
    .from(tables.roleInsights)
    .where(eq(tables.roleInsights.resumeId, resumeId));
  const latest = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest) return null;
  const parsed = insightsSchema.safeParse(latest.data);
  return parsed.success ? { data: parsed.data, hash: latest.inputHash, createdAt: latest.createdAt } : null;
}
