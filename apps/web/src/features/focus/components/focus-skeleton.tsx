import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import {
  PageHeaderSkeleton,
  SectionLabelSkeleton,
  SeparatorSkeleton,
  StatTileSkeleton,
} from "@/components/skeletons";

/**
 * Built from the same layout as the focus page, in its resting shape: the
 * setup panel, not the running timer. That is the state a load almost always
 * arrives in, and a skeleton drawn as a 216px ring would shift the whole column
 * when a session turned out not to be running (the defect the Phase 5 audit
 * found on `/tasks`).
 */
export function FocusSkeleton() {
  return (
    <PageContainer>
      <PageHeaderSkeleton hasActions={false} />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col items-center gap-5">
          <div className="flex w-full max-w-sm flex-col gap-5">
            <div className="flex flex-col gap-2">
              <SectionLabelSkeleton />
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-44" />
            </div>
            <div className="flex flex-col gap-2">
              <SectionLabelSkeleton />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-9 w-full" />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <StatTileSkeleton key={index} />
            ))}
          </div>
          <Skeleton className="h-4 w-48" />
          <SeparatorSkeleton />
          <div className="flex flex-col gap-2">
            <SectionLabelSkeleton />
            {Array.from({ length: 2 }, (_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
          <SeparatorSkeleton />
          <div className="flex flex-col gap-2">
            <SectionLabelSkeleton />
            <div className="flex flex-col divide-y">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 py-2">
                  <Skeleton className="size-4 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-5 w-10 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
