import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SavedPages } from "@/components/pwa/saved-pages";

export const metadata = { title: "Offline", robots: { index: false } };

// Public and static on purpose: the service worker stores this page at install time and serves it whenever a page
// can't be loaded and isn't saved. It contains no user data; the list below is read from this device's own cache.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="page flex h-16 items-center"><Logo href="/dashboard" /></header>
      <main id="main" className="page flex flex-1 items-start justify-center pb-16 pt-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand"><WifiOff aria-hidden="true" /></div>
          <h1 className="mt-5 text-title text-ink">You’re offline</h1>
          <p className="mt-3 text-ink-muted">That page isn’t saved on this device. Reconnect to open it, or read one of the pages you’ve already opened:</p>
          <div className="mt-6"><SavedPages /></div>
          <a href="" className="mt-6 inline-block text-sm font-medium text-brand underline underline-offset-4">Try again</a>
        </div>
      </main>
    </div>
  );
}
