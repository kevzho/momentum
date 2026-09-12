import { cn } from "@momentum/ui/lib/utils";
import { Skeleton } from "@momentum/ui/components/skeleton";

/**
 * Route skeleton pieces. These mirror the real components' box model exactly,
 * line height included, so nothing moves when content arrives:
 *
 *   PageHeader   text-lg title (28px) + mt-0.5 + text-xs description (16px)
 *   section h2   text-xs (16px)
 *   TaskRow      py-1.5 around a 20px row (32px)
 */

/** Mirrors `PageHeader`, whose title is visually hidden below `md`. */
export function PageHeaderSkeleton({ hasActions = true }: { hasActions?: boolean }) {
  return (
    <div className="flex items-start md:min-h-8 md:justify-between md:gap-3">
      <div className="flex-none md:flex-1">
        <Skeleton className="hidden h-7 w-32 md:block" />
        <Skeleton className="mt-0.5 hidden h-4 w-56 md:block" />
      </div>
      {hasActions ? <Skeleton className="h-8 w-28 shrink-0" /> : null}
    </div>
  );
}

/** Mirrors a section label: one line of `text-xs`. */
export function SectionLabelSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-24", className)} />;
}

/** Mirrors `TaskRow` and the other dense list rows: 32px at `gap-0.5`. */
export function RowsSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

/** Mirrors `StatTile`: label (16) + value (32) + hint (16) at `gap-0.5`. */
export function StatTileSkeleton() {
  return (
    <div className="flex flex-col gap-0.5">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

/** Mirrors `<Separator />`, a 1px rule. */
export function SeparatorSkeleton() {
  return <div className="h-px w-full bg-border" />;
}
