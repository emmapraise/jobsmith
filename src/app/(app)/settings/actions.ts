"use server";

import { actionError, fail, type ActionResult } from "@/lib/action";
import { deleteUserData } from "@/lib/account";
import { signOut } from "@/lib/auth/auth";
import { requireUser } from "@/lib/auth/session";
import { log } from "@/lib/log";

export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      return fail("That email doesn't match your account.", "mismatch");
    }
    const { objectsDeleted } = await deleteUserData(user.id);
    log.info("account.deleted", { objects: objectsDeleted });
  } catch (err) {
    return actionError(err);
  }
  await signOut({ redirectTo: "/?deleted=1" });
  return { ok: true };
}
