import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import {
  PageHeaderSkeleton,
  SectionLabelSkeleton,
  SeparatorSkeleton,
  StatTileSkeleton,
} from "@/components/skeletons";
import { CHART_HEIGHT } from "@/features/analytics/components/charts/chart-theme";

// The chart blocks take their height from the same constant the figures do.
export function AnalyticsSkeleton() {
  return (
    <PageContainer>
      <PageHeaderSkeleton />

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatTileSkeleton key={index} />
        ))}
      </div>

      <SeparatorSkeleton />

      <section className="flex flex-col gap-2">
        <SectionLabelSkeleton />
        <Skeleton className="h-5 w-full max-w-xl" />
        <Skeleton className="h-5 w-full max-w-md" />
      </section>

      <SeparatorSkeleton />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex min-w-0 flex-col gap-2">
            <SectionLabelSkeleton />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="w-full rounded-md" style={{ height: CHART_HEIGHT }} />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
