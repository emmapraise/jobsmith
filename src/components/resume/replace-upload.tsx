"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadResume } from "./upload-resume";

export function ReplaceUpload() {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Upload a new version">
        <div className="max-h-full w-full max-w-xl overflow-auto rounded-t-2xl bg-paper p-4 sm:rounded-2xl sm:p-6">
          <UploadResume replacing onCancel={() => setOpen(false)} />
        </div>
      </div>
    );
  }
  return (
    <Button variant="outline" onClick={() => setOpen(true)}>
      <Upload data-icon="inline-start" aria-hidden="true" /> Upload new file
    </Button>
  );
}
