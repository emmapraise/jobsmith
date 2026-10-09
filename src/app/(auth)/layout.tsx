import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="page flex h-16 items-center justify-between">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" className="page flex flex-1 items-start justify-center pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
