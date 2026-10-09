"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportMasterAction } from "@/app/(app)/resume/actions";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";

export function ExportMaster() {
  const [variant, setVariant] = useState<"uk_eu" | "us">("uk_eu");
  const [pending, start] = useTransition();
  const go = (format: "pdf" | "docx") =>
    start(async () => {
      const r = await exportMasterAction(format, variant);
      if (r.ok) window.location.assign(r.url);
      else toast.error(r.message);
    });
  return (
    <div className="mt-3">
      <label htmlFor="master-variant" className="mb-1.5 block text-sm font-medium text-ink">Download as</label>
      <NativeSelect id="master-variant" value={variant} onChange={(e) => setVariant(e.target.value as "uk_eu" | "us")} className="h-9 text-sm">
        <option value="uk_eu">UK / Europe CV (A4)</option>
        <option value="us">US résumé (Letter)</option>
      </NativeSelect>
      <div className="mt-2 flex gap-2">
        <Button variant="outline" disabled={pending} onClick={() => go("pdf")}><Download data-icon="inline-start" aria-hidden="true" /> PDF</Button>
        <Button variant="outline" disabled={pending} onClick={() => go("docx")}><Download data-icon="inline-start" aria-hidden="true" /> DOCX</Button>
      </div>
    </div>
  );
}
