"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ClipboardList, Compass, Ellipsis, FileText, Home, Settings, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

export const NAV: Item[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/roles", label: "Roles", icon: Compass },
  { href: "/tailor", label: "Tailor", icon: Sparkles },
  { href: "/tracker", label: "Tracker", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Phones show five slots: the four things used most plus "More" for the rest. */
const PRIMARY = ["/dashboard", "/resume", "/tailor", "/tracker"];
const MORE = NAV.filter((n) => !PRIMARY.includes(n.href));

export type Badges = Record<string, number>;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-change-soft px-1.5 text-xs font-semibold text-change-ink ring-1 ring-change-line">
      <span aria-hidden="true">{n > 9 ? "9+" : n}</span>
      <span className="sr-only">{n} need attention</span>
    </span>
  );
}

export function SidebarNav({ badges = {} }: { badges?: Badges }) {
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
          <Badge n={badges[href] ?? 0} />
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ badges = {} }: { badges?: Badges }) {
  const isActive = useActive();
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [more]);

  const slot = "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-lg text-[0.7rem] font-medium text-ink-muted";
  const moreActive = MORE.some((m) => isActive(m.href));

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {more && (
        <ul id="more-menu" className="absolute inset-x-2 bottom-full mb-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          {MORE.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} onClick={() => setMore(false)} aria-current={isActive(href) ? "page" : undefined} className={cn("flex items-center gap-3 px-4 py-3.5 text-base text-ink", isActive(href) && "bg-brand-soft text-brand-soft-ink")}>
                <Icon className="size-5" aria-hidden="true" /> {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-1">
        {NAV.filter((n) => PRIMARY.includes(n.href)).map(({ href, label, icon: Icon }) => (
          <li key={href} className="relative flex-1">
            <Link href={href} aria-current={isActive(href) ? "page" : undefined} className={cn(slot, isActive(href) && "text-brand")}>
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
            {(badges[href] ?? 0) > 0 && (
              <span className="pointer-events-none absolute right-[22%] top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-change-ink px-1 text-[0.65rem] font-bold text-surface">
                <span aria-hidden="true">{badges[href] > 9 ? "9+" : badges[href]}</span>
                <span className="sr-only">{badges[href]} need attention</span>
              </span>
            )}
          </li>
        ))}
        <li className="flex-1">
          <button type="button" aria-expanded={more} aria-controls="more-menu" onClick={() => setMore((v) => !v)} className={cn(slot, (more || moreActive) && "text-brand")}>
            <Ellipsis className="size-5" aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
