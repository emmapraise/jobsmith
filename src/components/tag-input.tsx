"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Chips + text input. Enter or comma adds; Backspace on empty removes the last. */
export function TagInput({
  value,
  onChange,
  placeholder,
  label,
  suggestions = [],
  max = 50,
  id,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  label: string;
  suggestions?: string[];
  max?: number;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const items = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) return;
    const have = new Set(value.map((v) => v.toLowerCase()));
    const fresh = items.filter((s) => !have.has(s.toLowerCase()));
    if (fresh.length) onChange([...value, ...fresh].slice(0, max));
    setDraft("");
  };

  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div className={className}>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-brand-soft py-1 pl-2.5 pr-1 text-sm text-brand-soft-ink">
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="rounded p-0.5 hover:bg-brand/10"
              aria-label={`Remove ${v}`}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <Input
          id={inputId}
          value={draft}
          aria-label={label}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          className="h-8 min-w-32 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
      </div>
      {remaining.length > 0 && (
        <div className={cn("mt-2 flex flex-wrap gap-1.5")} aria-label="Suggestions">
          {remaining.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-ink-muted hover:border-brand hover:text-brand"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
