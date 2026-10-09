import { AlertTriangle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>}
      <h2 className="font-heading text-xl text-ink">{title}</h2>
      {description && <p className="prose-measure mt-2 text-ink-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
  className,
}: {
  title?: string;
  message: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-ink", className)}>
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-ink-muted">{message}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-sm text-ink-muted", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label ?? <span className="sr-only">Loading</span>}
    </span>
  );
}

/** Generic page skeleton for loading.tsx files. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <div className="space-y-3 pb-8 pt-8 md:pt-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
