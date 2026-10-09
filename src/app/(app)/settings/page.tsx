import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AiProviderSettings } from "@/components/settings/ai-provider";
import { DeleteAccount } from "@/components/settings/delete-account";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { getAiSettingsView } from "@/lib/llm/user-config";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const ai = await getAiSettingsView(user.id);
  return (
    <div className="page max-w-3xl">
      <PageHeader eyebrow="Settings" title="Account & privacy" />

      <section aria-labelledby="account" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="account" className="text-xl text-ink">Account</h2>
        <p className="mt-2 text-ink-muted">Signed in as <span className="font-medium text-ink">{user.email}</span></p>
        <form action={signOutAction} className="mt-4">
          <Button type="submit" variant="outline"><LogOut data-icon="inline-start" aria-hidden="true" /> Sign out</Button>
        </form>
      </section>

      <section aria-labelledby="ai" className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="ai" className="text-xl text-ink">AI provider</h2>
        <p className="mb-5 mt-2 max-w-2xl text-ink-muted">
          Choose which AI reads and rewrites your resume, and which model it uses. Use a key from this server, or add your own.
        </p>
        <AiProviderSettings view={{ provider: ai.provider, model: ai.model, providers: ai.providers }} />
      </section>

      <section aria-labelledby="appearance" className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="appearance" className="text-xl text-ink">Appearance</h2>
        <p className="mt-2 text-ink-muted">Choose light, dark, or follow your device.</p>
        <ThemeToggle className="mt-4" />
      </section>

      <section aria-labelledby="privacy" className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="privacy" className="text-xl text-ink">How we handle your data</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-muted marker:text-brand">
          <li>Your files are stored privately and only ever shared through short-lived links.</li>
          <li>Everything is encrypted in transit.</li>
          <li>Your resume text is never written to our logs.</li>
          <li>Your data is never used to train AI models.</li>
          <li>You can delete everything at any time, below.</li>
        </ul>
      </section>

      <section aria-labelledby="danger" className="mt-6 rounded-2xl border border-danger/30 bg-surface p-5 sm:p-6">
        <h2 id="danger" className="text-xl text-ink">Delete account</h2>
        <p className="mt-2 max-w-xl text-ink-muted">Removes your account, all resume versions, answers, insights, and every stored file.</p>
        <div className="mt-4"><DeleteAccount email={user.email} /></div>
      </section>
    </div>
  );
}
