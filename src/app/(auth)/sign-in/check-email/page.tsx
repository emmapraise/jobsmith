import Link from "next/link";
import { MailCheck } from "lucide-react";

export const metadata = { title: "Check your email" };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card sm:p-8">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <MailCheck aria-hidden="true" />
      </div>
      <h1 className="text-title text-ink">Check your email</h1>
      <p className="mt-3 text-ink-muted">
        We sent a sign-in link{email ? <> to <span className="font-medium text-ink">{email}</span></> : null}. It works once and expires in 24 hours.
      </p>
      <p className="mt-6 text-sm text-ink-muted">
        Nothing there? Check spam, or <Link href="/sign-in" className="font-medium text-brand underline underline-offset-4">try again</Link>.
      </p>
    </div>
  );
}
