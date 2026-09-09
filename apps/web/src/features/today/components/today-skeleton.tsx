import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton, RowsSkeleton, SectionLabelSkeleton } from "@/components/skeletons";

/**
 * Built from the same layout as `TodayView`, so the skeleton occupies the space
 * the content will occupy and nothing moves when it arrives.
 *
 * The numbers mirror the real page: the greeting block repeats visually below
 * `md` (28px + 16px), `DayProgress` is one 20px row, Next Up is a bordered
 * surface holding a title, a meta line and a row of controls, and the timeline
 * rows are 40px each at `py-1`.
 *
 * At Risk is deliberately absent. It is not rendered when there is nothing at
 * risk, which is most days, so reserving its height would make the common case
 * shift *down* when the content arrived.
 */
export function TodaySkeleton() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-3">
        <PageHeaderSkeleton hasActions={false} />
        <div className="flex flex-col gap-0.5 md:hidden">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="h-1.5 flex-1" />
          <Skeleton className="h-4 w-20 shrink-0" />
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <SectionLabelSkeleton />
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-1.5">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionLabelSkeleton />
            <div className="flex flex-col">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex items-center gap-2 py-1 pr-2">
                  <Skeleton className="ml-2 h-4 w-9 shrink-0" />
                  <Skeleton className="h-4 w-3 shrink-0 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="size-4 shrink-0" />
                </div>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <SectionLabelSkeleton />
            <RowsSkeleton rows={2} />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionLabelSkeleton />
            <RowsSkeleton rows={4} />
          </section>
          <section className="flex flex-col gap-2">
            <SectionLabelSkeleton />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-1.5 w-full" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
