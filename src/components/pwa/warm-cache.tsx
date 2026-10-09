"use client";

import { useEffect } from "react";
import { warmOfflinePages } from "@/lib/pwa";

/** After the app loads (and at most every 6 hours), quietly save the key pages for offline reading. */
export function WarmCache() {
  useEffect(() => {
    const t = setTimeout(() => void warmOfflinePages().catch(() => undefined), 4000); // let the page settle first
    return () => clearTimeout(t);
  }, []);
  return null;
}
