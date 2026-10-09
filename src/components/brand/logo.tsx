import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      {/* an anvil-and-spark: a forged "J" */}
      <path d="M11 9h11v3h-4.2v8.2c0 3-2 4.8-5 4.8-1.6 0-3-.5-4-1.4l1.6-2.5c.6.5 1.3.8 2 .8 1 0 1.6-.6 1.6-1.9V12H11V9Z" fill="var(--brand-fg)" />
      <circle cx="23.5" cy="8.5" r="1.7" fill="var(--change-line)" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-md", className)} aria-label="Jobsmith home">
      <LogoMark />
      <span className="font-heading text-xl font-medium tracking-tight text-ink">Jobsmith</span>
    </Link>
  );
}
