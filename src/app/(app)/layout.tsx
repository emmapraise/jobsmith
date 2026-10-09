import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth/session";
import { dueCount } from "@/lib/tracker/repo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Count of applications needing attention (follow-ups due, "any news?" prompts) for the Tracker badge.
  const due = await dueCount(user.id).catch(() => 0);
  return <AppShell user={user} badges={{ "/tracker": due }}>{children}</AppShell>;
}
