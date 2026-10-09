"use client";

import { useRef } from "react";
import { clearOfflineData } from "@/lib/pwa";

/**
 * Sign-out that first wipes the pages saved for offline reading, so private data doesn't stay on the device
 * after the session ends. (Awaited before the real submit; the browser would otherwise cancel the cleanup.)
 */
export function SignOutForm({ action, className, children }: { action: () => Promise<void>; className?: string; children: React.ReactNode }) {
  const cleared = useRef(false);
  return (
    <form
      action={action}
      className={className}
      onSubmit={async (e) => {
        if (cleared.current) return;
        e.preventDefault();
        const form = e.currentTarget;
        await clearOfflineData();
        cleared.current = true;
        form.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
