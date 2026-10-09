"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function read(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(t: Theme) {
  try {
    localStorage.setItem("theme", t);
  } catch {
    /* storage blocked: still apply for this page view */
  }
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event("theme-change"));
}

const subscribe = (cb: () => void) => {
  window.addEventListener("theme-change", cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onOs = () => read() === "system" && apply("system");
  mq.addEventListener("change", onOs);
  return () => {
    window.removeEventListener("theme-change", cb);
    mq.removeEventListener("change", onOs);
  };
};

/** Segmented Light / Dark / System control. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-lg border border-line bg-surface p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => apply(value)}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-ink",
            theme === value && "bg-brand-soft text-brand-soft-ink",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
