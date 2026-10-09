"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "./use-online";

/** Shown across the app while offline. Reading works from saved pages; changes need a connection. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center gap-2 border-b border-change-line bg-change-soft px-[var(--gutter)] py-2 text-sm text-change-ink">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span>You’re offline. You can read pages you’ve opened; changes, tailoring and downloads need a connection.</span>
    </div>
  );
}
