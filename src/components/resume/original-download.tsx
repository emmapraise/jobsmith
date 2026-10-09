"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { originalDownloadUrlAction } from "@/app/(app)/resume/actions";

export function OriginalDownload() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await originalDownloadUrlAction();
          if (r.ok) window.location.assign(r.url);
          else toast.error(r.message);
        })
      }
    >
      <Download data-icon="inline-start" aria-hidden="true" /> {pending ? "Preparing…" : "Download original"}
    </Button>
  );
}
