"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, FileText, Home, Settings, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

export const NAV: Item[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/roles", label: "Roles", icon: Compass },
  { href: "/tailor", label: "Tailor", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav() {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.95rem] font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink",
            isActive(href) && "bg-brand-soft text-brand-soft-ink hover:bg-brand-soft hover:text-brand-soft-ink",
          )}
        >
          <Icon className="size-[1.125rem]" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-[0.7rem] font-medium text-ink-muted",
                isActive(href) && "text-brand",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
