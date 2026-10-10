import { LogOut } from "lucide-react";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { SignOutForm } from "@/components/pwa/sign-out-form";
import { WarmCache } from "@/components/pwa/warm-cache";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import type { CurrentUser } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottomNav, SidebarNav, type Badges } from "./nav";

export function AppShell({ user, badges, children }: { user: CurrentUser; badges: Badges; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 md:flex">
        <Logo href="/dashboard" className="px-2" />
        <div className="mt-8">
          <SidebarNav badges={badges} />
        </div>
        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate px-2 text-sm text-ink-muted" title={user.email}>
            {user.email}
          </p>
          <ThemeToggle className="mx-2 mt-3" />
          <SignOutForm action={signOutAction} className="mt-2">
            <Button type="submit" variant="ghost" className="w-full justify-start gap-2 text-ink-muted">
              <LogOut aria-hidden="true" /> Sign out
            </Button>
          </SignOutForm>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <WarmCache />
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center pt-[env(safe-area-inset-top)] border-b border-line bg-surface/95 px-[var(--gutter)] backdrop-blur md:hidden">
          <Logo href="/dashboard" />
          <ThemeToggle className="ml-auto" />
        </header>
        <main id="main" className="flex-1 pb-24 md:pb-12">
          {children}
        </main>
      </div>
      <BottomNav badges={badges} />
    </div>
  );
}
