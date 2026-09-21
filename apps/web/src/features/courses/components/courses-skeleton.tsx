import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton } from "@/components/skeletons";

/** Same shape as `CourseRow`, so heights match at every width. */
export function CoursesSkeleton() {
  return (
    <PageContainer>
      <PageHeaderSkeleton />
      <div className="flex flex-col divide-y">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="size-2.5 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-0.5 h-4 w-64" />
            </div>
            <Skeleton className="hidden h-4 w-20 sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}

/** The course page: header, then weeks beside the syllabus. */
export function CourseSkeleton() {
  return (
    <PageContainer>
      <PageHeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col divide-y">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 py-3">
              <Skeleton className="h-5 w-40" />
              <div className="grid gap-2 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
                <Skeleton className="h-6 w-3/4" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </PageContainer>
  );
}
