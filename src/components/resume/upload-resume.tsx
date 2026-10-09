"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, ShieldCheck } from "lucide-react";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const MAX = 5 * 1024 * 1024;

type Phase = { name: "idle" } | { name: "uploading"; pct: number } | { name: "reading" } | { name: "error"; message: string; code?: string };

// Client checks are for fast feedback only; the server re-validates everything.
function precheck(file: File): string | null {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext !== "pdf" && ext !== "docx") return "Only PDF and DOCX files are accepted.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX) return "That file is larger than 5 MB.";
  return null;
}

export function UploadResume({ replacing = false, onCancel }: { replacing?: boolean; onCancel?: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const busy = phase.name === "uploading" || phase.name === "reading";

  function send(file: File) {
    const problem = precheck(file);
    if (problem) return setPhase({ name: "error", message: problem });

    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/resumes/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setPhase({ name: "uploading", pct: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.upload.onload = () => setPhase({ name: "reading" });
    xhr.onerror = () => setPhase({ name: "error", message: "The upload failed. Check your connection and try again." });
    xhr.onload = () => {
      let body: { ok?: boolean; message?: string; code?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status === 413 && !body.message) {
        // The hosting platform (not our validation) rejected the body: serverless request limit is ~4.5 MB.
        setPhase({ name: "error", message: "That file is too large to upload. Try a smaller file (under 4.5 MB)." });
      } else if (xhr.status >= 200 && xhr.status < 300 && body.ok) {
        router.push("/resume/review");
        router.refresh();
      } else {
        setPhase({ name: "error", message: body.message ?? "Something went wrong. Please try again.", code: body.code });
      }
    };
    setPhase({ name: "uploading", pct: 0 });
    xhr.send(form);
  }

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (f) send(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pick(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed bg-surface px-6 py-12 text-center transition-colors sm:py-16",
          dragging ? "border-brand bg-brand-soft" : "border-line-strong",
        )}
      >
        {busy ? (
          <div role="status" aria-live="polite" className="mx-auto max-w-sm">
            <Loader2 className="mx-auto size-8 animate-spin text-brand" aria-hidden="true" />
            {phase.name === "uploading" ? (
              <>
                <p className="mt-4 font-medium text-ink">Uploading… {phase.pct}%</p>
                <Progress value={phase.pct} className="mt-4" aria-label="Upload progress" />
              </>
            ) : (
              <>
                <p className="mt-4 font-medium text-ink">Reading your resume…</p>
                <p className="mt-1 text-sm text-ink-muted">We&apos;re turning it into editable sections. This can take up to a minute.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
              <FileUp aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-heading text-xl text-ink">{replacing ? "Upload a new version" : "Upload your master resume"}</h2>
            <p className="mx-auto mt-2 max-w-md text-ink-muted">
              Drag a file here or choose one. PDF or DOCX, up to 5 MB.
              {replacing && " Your current content is kept in version history."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button size="lg" className="h-11 px-5 text-base" onClick={() => inputRef.current?.click()}>
                Choose file
              </Button>
              {onCancel && (
                <Button size="lg" variant="ghost" className="h-11" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => pick(e.target.files)}
              aria-label="Resume file (PDF or DOCX)"
              tabIndex={-1}
            />
          </>
        )}
      </div>

      {phase.name === "error" && (
        <ErrorState
          className="mt-4"
          title={phase.code === "ai_not_configured" ? "AI isn’t set up yet" : "We couldn’t process that file"}
          message={phase.message}
          action={
            <Button variant="outline" onClick={() => setPhase({ name: "idle" })}>
              Try again
            </Button>
          }
        />
      )}

      <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        Your file is stored privately, encrypted in transit, and never used to train AI models.
      </p>
    </div>
  );
}
