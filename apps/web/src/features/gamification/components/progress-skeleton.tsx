import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton, SectionLabelSkeleton } from "@/components/skeletons";

/**
 * Built from the same layout as `ProgressView`, so the skeleton occupies the
 * space the content will occupy and nothing shifts on arrival
 * (docs/ARCHITECTURE.md §15).
 *
 * The numbers mirror the real page: `PageHeader` is a title and a description
 * (46px), the level panel is a `text-sm` row (20) · `Progress` (4) · `text-xs`
 * line (16) at `gap-1.5` inside `py-3` and a border (78px), a section label is
 * one line of `text-xs`, and a quest or goal row is a `text-sm` title row,
 * the bar and a `text-xs` progress line at `gap-1.5` (52px).
 */
export function ProgressSkeleton() {
  return (
    <PageContainer>
      <PageHeaderSkeleton hasActions={false} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-(--radius) border px-4 py-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-1 w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-5 w-20" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <section key={index} className="flex min-w-0 flex-col gap-2">
            <SectionLabelSkeleton />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, row) => (
                <div key={row} className="flex flex-col gap-1.5">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-1 w-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
