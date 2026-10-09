import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  if (await getCurrentUser()) redirect(callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard");
  const e = env();
  return (
    <SignInForm
      callbackUrl={callbackUrl ?? "/dashboard"}
      googleEnabled={Boolean(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET)}
      devMode={process.env.NODE_ENV !== "production" && !e.AUTH_RESEND_KEY}
      authError={error ?? null}
    />
  );
}
