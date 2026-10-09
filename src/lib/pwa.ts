/** Client-side helpers for the PWA. Safe to import only from client components. */

export const PAGES_CACHE_PREFIX = "jobsmith-pages-";
const WARM_KEY = "jobsmith:warm-at";
const WARM_EVERY_MS = 6 * 60 * 60 * 1000;

export const swSupported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

/** Register the service worker (production only: in development it would cache stale code). */
export async function registerServiceWorker(): Promise<void> {
  if (!swSupported() || process.env.NODE_ENV !== "production") return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    /* unsupported or blocked: the app simply works online-only */
  }
}

/**
 * Remove every saved page from this device. Call BEFORE signing out or deleting the account, so private pages
 * (resume text, notes, applications) don't outlive the session. Works without the service worker running.
 */
export async function clearOfflineData(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PAGES_CACHE_PREFIX)).map((k) => caches.delete(k)));
    }
    localStorage.removeItem(WARM_KEY);
  } catch {
    /* nothing to clear */
  }
}

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

/** Don't spend a user's mobile data in the background on slow links or when they've asked to save data. */
export function shouldWarmNow(now = Date.now()): boolean {
  try {
    const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    if (conn?.saveData || (conn?.effectiveType && /^(slow-2g|2g)$/.test(conn.effectiveType))) return false;
    if (!navigator.onLine) return false;
    const last = Number(localStorage.getItem(WARM_KEY) ?? 0);
    return now - last > WARM_EVERY_MS;
  } catch {
    return false;
  }
}

export async function warmOfflinePages(): Promise<void> {
  if (!swSupported() || !shouldWarmNow()) return;
  const reg = await navigator.serviceWorker.ready;
  const res = await fetch("/api/pwa/offline-urls", { credentials: "same-origin" });
  if (!res.ok) return;
  const { urls } = (await res.json()) as { urls: string[] };
  reg.active?.postMessage({ type: "WARM", urls });
  localStorage.setItem(WARM_KEY, String(Date.now()));
}

export type SavedPage = { path: string; title: string; savedAt: number };

/** Pages currently saved on this device (for the offline screen). */
export async function listSavedPages(): Promise<SavedPage[]> {
  if (typeof caches === "undefined") return [];
  const out: SavedPage[] = [];
  for (const name of (await caches.keys()).filter((k) => k.startsWith(PAGES_CACHE_PREFIX))) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      out.push({
        path: new URL(req.url).pathname,
        title: (res?.headers.get("x-jobsmith-title") ?? "").replace(/\s*·\s*Jobsmith$/, ""),
        savedAt: Number(res?.headers.get("x-jobsmith-saved-at") ?? 0),
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
