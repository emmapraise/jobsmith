"use server";

import { z } from "zod";
import { actionError, fail, limitOrFail, type ActionResult } from "@/lib/action";
import { deleteUserData } from "@/lib/account";
import { signOut } from "@/lib/auth/auth";
import { requireUser } from "@/lib/auth/session";
import { generateStructured, isProvider, MODEL_ID, PROVIDER_INFO } from "@/lib/llm";
import { removeUserKey, resolveLlm, saveAiSelection, saveUserKey } from "@/lib/llm/user-config";
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

/* ───────────── AI provider settings ───────────── */

export async function saveAiSelectionAction(provider: string, model: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!isProvider(provider)) return fail("Unknown provider.");
    const m = model.trim();
    if (m && !MODEL_ID.test(m)) return fail("That model name has invalid characters.");
    await saveAiSelection(user.id, provider, m || null);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function saveApiKeyAction(provider: string, apiKey: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!isProvider(provider)) return fail("Unknown provider.");
    const k = apiKey.trim();
    if (k.length < 10 || k.length > 400 || /\s/.test(k)) return fail("That doesn't look like a valid API key.");
    await saveUserKey(user.id, provider, k);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function removeApiKeyAction(provider: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!isProvider(provider)) return fail("Unknown provider.");
    await removeUserKey(user.id, provider);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Makes one tiny structured call with the saved provider/model/key so problems show up here, not mid-upload. */
export async function testAiAction(): Promise<ActionResult<{ provider: string; model: string }>> {
  try {
    const user = await requireUser();
    const limited = await limitOrFail(user.id, ["aiBurst"]);
    if (limited) return limited;
    const config = await resolveLlm(user.id);
    const out = await generateStructured(z.object({ ok: z.boolean() }), {
      config,
      system: "You are a connectivity check. Reply using the requested JSON shape only.",
      prompt: "Set ok to true.",
      maxOutputTokens: 200,
      temperature: 0,
      timeoutMs: 30_000,
    });
    if (!out.ok) return fail("The model replied, but not in the expected format. Try a different model.");
    return { ok: true, provider: PROVIDER_INFO[config.provider].label, model: config.model };
  } catch (err) {
    return actionError(err);
  }
}
