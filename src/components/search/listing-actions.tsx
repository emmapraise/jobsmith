"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { addApplicationAction } from "@/app/(app)/tracker/actions";
import { createTailoringAction } from "@/app/(app)/tailor/actions";
import { Button } from "@/components/ui/button";

type L = { title: string; company: string; location: string; url: string; description: string };

export function ListingActions({ l }: { l: L }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"tailor" | "save" | null>(null);
  const run = (kind: "tailor" | "save", fn: () => Promise<void>) => start(async () => { setBusy(kind); await fn(); setBusy(null); });

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" disabled={pending} onClick={() => run("tailor", async () => {
        const r = await createTailoringAction({ mode: "paste", text: l.description, listing: { url: l.url, title: l.title, company: l.company, location: l.location } });
        if (r.ok) router.push(`/tailor/${r.id}`);
        else toast.error(r.message);
      })}>
        {busy === "tailor" ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <Sparkles data-icon="inline-start" aria-hidden="true" />}
        {busy === "tailor" ? "Tailoring… up to a minute" : "Tailor my resume"}
      </Button>
      <Button size="sm" variant="outline" disabled={pending || saved} onClick={() => run("save", async () => {
        const r = await addApplicationAction({ company: l.company || "Unknown", title: l.title, url: l.url, location: l.location, status: "saved", resume: "none" });
        if (r.ok) { setSaved(true); toast.success("Saved to your tracker"); } else toast.error(r.message);
      })}>
        {saved ? <Check data-icon="inline-start" aria-hidden="true" /> : <BookmarkPlus data-icon="inline-start" aria-hidden="true" />}
        {saved ? "Saved" : "Save to tracker"}
      </Button>
    </div>
  );
}
