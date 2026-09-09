import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";

// Heights are the real components' tokens: tab row `h-7`, toolbar Input `h-8`,
// key hint `h-4`. `BulkActionBar` is not modelled; it only renders with a selection.
export function TasksSkeleton() {
  return (
    <PageContainer>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-72" />
        <RowsSkeleton rows={6} />
      </div>
    </PageContainer>
  );
}
