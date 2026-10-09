"use client";

import { useActionState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithEmailAction, signInWithGoogleAction } from "@/lib/auth/actions";

const AUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That email is already linked to a different sign-in method. Use the original method.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  AccessDenied: "Access was denied.",
};

export function SignInForm({
  callbackUrl,
  googleEnabled,
  devMode,
  authError,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  devMode: boolean;
  authError: string | null;
}) {
  const [state, action, pending] = useActionState(signInWithEmailAction, undefined);
  const errorText = state?.error ?? (authError ? (AUTH_ERRORS[authError] ?? "We couldn't sign you in. Please try again.") : null);

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-title text-ink">Sign in</h1>
      <p className="mt-2 text-ink-muted">New here? The same form creates your account. Jobsmith is free.</p>

      {errorText && (
        <p role="alert" className="mt-5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-ink">
          {errorText}
        </p>
      )}

      {googleEnabled && (
        <>
          <form action={signInWithGoogleAction.bind(null, callbackUrl)} className="mt-6">
            <Button type="submit" variant="outline" className="h-11 w-full text-base">
              <GoogleIcon /> Continue with Google
            </Button>
          </form>
          <div className="my-6 flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form action={action} className={googleEnabled ? "" : "mt-6"} noValidate>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Label htmlFor="email" className="text-sm font-medium text-ink">
          Email address
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          className="mt-2 h-11 text-base"
          aria-invalid={Boolean(state?.error)}
        />
        <Button type="submit" className="mt-4 h-11 w-full text-base" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mail aria-hidden="true" />}
          {pending ? "Sending link…" : "Email me a sign-in link"}
        </Button>
        <p className="mt-3 text-sm text-ink-muted">We&apos;ll email a one-time link. No password to remember.</p>
      </form>

      {devMode && (
        <p className="mt-6 rounded-lg bg-change-soft px-3 py-2.5 text-sm text-change-ink">
          Dev mode: no email service is configured, so the sign-in link is printed in the server console.
        </p>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}
