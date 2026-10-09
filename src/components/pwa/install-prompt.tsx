"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "jobsmith:install-dismissed";
const noop = () => () => undefined;
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function useInstallState() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const isStandalone = useSyncExternalStore(noop, standalone, () => false);
  const isIOS = useSyncExternalStore(noop, () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1), () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our own button
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return { event, installed: installed || isStandalone, isIOS, clear: () => setEvent(null) };
}

function IosSteps() {
  return (
    <ol className="mt-2 space-y-1.5 text-sm text-ink-muted">
      <li className="flex items-center gap-2"><Share className="size-4 shrink-0 text-brand" aria-hidden="true" /> In Safari, tap the <strong className="text-ink">Share</strong> button.</li>
      <li className="flex items-center gap-2"><SquarePlus className="size-4 shrink-0 text-brand" aria-hidden="true" /> Choose <strong className="text-ink">Add to Home Screen</strong>, then <strong className="text-ink">Add</strong>.</li>
    </ol>
  );
}

/** Settings version: always available, explains what's offline. */
export function InstallCard() {
  const { event, installed, isIOS, clear } = useInstallState();
  if (installed) return <p className="text-ink-muted">Jobsmith is installed on this device. 🎉</p>;
  return (
    <div>
      <p className="text-ink-muted">Install Jobsmith on your phone or computer for a full-screen app, quick launch from your home screen, and offline reading of the pages you’ve opened.</p>
      {event ? (
        <Button className="mt-3" onClick={async () => { await event.prompt(); await event.userChoice; clear(); }}>
          <Download data-icon="inline-start" aria-hidden="true" /> Install app
        </Button>
      ) : isIOS ? (
        <IosSteps />
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Use your browser’s menu: <strong className="text-ink">Install app</strong> or <strong className="text-ink">Add to Home Screen</strong>.</p>
      )}
    </div>
  );
}

/** Dismissible nudge on the dashboard, mobile only, shown only when installing is actually possible. */
export function InstallBanner() {
  const { event, installed, isIOS, clear } = useInstallState();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  if (installed || dismissed || (!event && !isIOS)) return null;
  const close = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };
  return (
    <section aria-label="Install the app" className="relative mb-6 rounded-2xl border border-brand/20 bg-brand-soft p-4 pr-12 md:hidden">
      <p className="font-medium text-brand-soft-ink">Install Jobsmith</p>
      <p className="mt-0.5 text-sm text-brand-soft-ink/80">Open it from your home screen and read your applications offline.</p>
      {event ? (
        <Button size="sm" className="mt-3" onClick={async () => { await event.prompt(); const c = await event.userChoice; clear(); if (c.outcome === "dismissed") close(); }}>Install</Button>
      ) : (
        <IosSteps />
      )}
      <button type="button" onClick={close} aria-label="Dismiss" className="absolute right-2 top-2 rounded-md p-2 text-brand-soft-ink/70 hover:bg-brand/10"><X className="size-4" aria-hidden="true" /></button>
    </section>
  );
}
