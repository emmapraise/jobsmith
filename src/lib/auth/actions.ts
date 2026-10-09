"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "./auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function signInWithGoogleAction(callbackUrl?: string) {
  await signIn("google", { redirectTo: safeRedirect(callbackUrl) });
}

const emailSchema = z.email();

export async function signInWithEmailAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { error: "Enter a valid email address." };
  try {
    await signIn("resend", { email: parsed.data, redirect: false, redirectTo: safeRedirect(String(formData.get("callbackUrl") ?? "")) });
  } catch {
    return { error: "We couldn't send the sign-in link. Please try again in a moment." };
  }
  redirect(`/sign-in/check-email?email=${encodeURIComponent(parsed.data)}`);
}

/** Only allow same-site relative redirects. */
function safeRedirect(url?: string | null): string {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return "/dashboard";
  return url;
}
