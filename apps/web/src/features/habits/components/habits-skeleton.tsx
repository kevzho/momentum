import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton } from "@/components/skeletons";

export function HabitsSkeleton() {
  return (
    <PageContainer>
      <PageHeaderSkeleton />
      <div className="flex flex-col divide-y">
        {Array.from({ length: 4 }, (_, index) => (
          // Same shape as `HabitCard`, including the wrap below `sm`, so heights match at every width.
          <div key={index} className="flex items-center gap-x-3 gap-y-1 px-2 py-2 max-sm:flex-wrap">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-0.5 h-4 w-28" />
            </div>
            <div className="flex shrink-0 items-center gap-1 max-sm:order-last max-sm:basis-full">
              {Array.from({ length: 7 }, (_, day) => (
                <Skeleton key={day} className="size-5 rounded-full pointer-coarse:size-10" />
              ))}
            </div>
            <Skeleton className="h-4 w-14 shrink-0" />
            <Skeleton className="hidden h-4 w-12 shrink-0 md:block" />
            <div className="flex shrink-0 items-center gap-1">
              <Skeleton className="size-7" />
              <Skeleton className="size-7" />
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
