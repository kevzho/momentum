import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton, SectionLabelSkeleton } from "@/components/skeletons";

/**
 * Mirrors `ProgressView`'s layout so nothing shifts on arrival: `PageHeader`
 * (46px), the level panel (78px), a section label (one `text-xs` line), and a
 * quest or goal row (52px).
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
