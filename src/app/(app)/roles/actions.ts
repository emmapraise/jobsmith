"use server";

import { revalidatePath } from "next/cache";
import { actionError, fail, limitOrFail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth/session";
import { resolveLlm } from "@/lib/llm/user-config";
import { getProfile } from "@/lib/profile/repo";
import { generateInsights, getCachedInsights, insightsInputHash } from "@/lib/resume/insights";
import { getMasterResume } from "@/lib/resume/repo";

export async function generateInsightsAction(force: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const master = await getMasterResume(user.id);
    if (!master) return fail("Upload a resume first.", "no_resume");
    const { data: profile } = await getProfile(user.id);

    if (!force) {
      const hash = insightsInputHash(master.content, profile);
      if (await getCachedInsights(master.id, hash)) return { ok: true };
    }
    const limited = await limitOrFail(user.id, ["ai", "aiBurst"]);
    if (limited) return limited;

    await generateInsights({ userId: user.id, resumeId: master.id, resumeVersion: master.version, resume: master.content, profile, llm: await resolveLlm(user.id) });
    revalidatePath("/roles");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
