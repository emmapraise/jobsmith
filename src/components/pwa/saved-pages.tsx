"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listSavedPages, type SavedPage } from "@/lib/pwa";

const LABEL: Record<string, string> = { "/dashboard": "Home", "/tracker": "Applications", "/tailor": "Tailored resumes", "/roles": "Roles you fit", "/resume": "Master resume" };
const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** What you can still read right now, straight from this device's saved pages. */
export function SavedPages() {
  const [pages, setPages] = useState<SavedPage[] | null>(null);
  useEffect(() => {
    void listSavedPages().then(setPages).catch(() => setPages([]));
  }, []);

  if (pages === null) return <p className="text-sm text-ink-muted" aria-busy="true">Looking for saved pages…</p>;
  if (pages.length === 0) return <p className="text-sm text-ink-muted">Nothing is saved on this device yet. Open your pages while you’re online and they’ll be available here next time.</p>;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-left">
      {pages.map((p) => (
        <li key={p.path}>
          <Link href={p.path} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-sunken">
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{LABEL[p.path] ?? (p.title || p.path)}</span>
              <span className="block truncate text-xs text-ink-muted">{p.path.startsWith("/tracker/") ? "Application" : p.path.startsWith("/tailor/") ? "Tailored resume" : "Saved page"}{p.savedAt ? ` · saved ${fmt.format(new Date(p.savedAt))}` : ""}</span>
            </span>
            <span className="text-sm text-brand" aria-hidden="true">Open</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
