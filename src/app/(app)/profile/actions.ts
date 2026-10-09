"use server";

import { revalidatePath } from "next/cache";
import { actionError, fail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth/session";
import { saveProfile } from "@/lib/profile/repo";
import { profileSchema } from "@/lib/profile/schema";

const partial = profileSchema.partial();

/** Saves one step of the profile questions. `finish` marks the profile complete. */
export async function saveProfileStepAction(patch: unknown, finish: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const p = partial.safeParse(patch);
    if (!p.success) return fail("Some answers look invalid. Please check them.", "invalid");
    await saveProfile(user.id, p.data, finish ? true : undefined);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
