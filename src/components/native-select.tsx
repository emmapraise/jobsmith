import { cn } from "@/lib/utils";

/** Styled native <select>: best accessibility and mobile UX for short option lists. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-surface px-3 text-base text-ink outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
