import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton } from "@/components/skeletons";

/**
 * Built from the same layout primitives and the same tokens as the real
 * calendar, so the space it occupies is the space the content occupies and
 * nothing moves on arrival.
 *
 * Two things it deliberately does not model. The all-day strip only exists on a
 * week that has an all-day item, so reserving a band for it would introduce the
 * shift it is meant to prevent. And the grid's window grows past the default
 * 05:00–24:00 to fit an early or late block (`resolveGridSpec`), which the
 * server cannot know before the read — the nineteen rows below are the default
 * window, and a taller week simply has more of them below the fold.
 */
const DEFAULT_WINDOW_HOURS = 19;

export function CalendarSkeleton() {
  return (
    <PageContainer fill>
      <PageHeaderSkeleton />
      <div className="flex min-h-0 flex-1 gap-4 pb-4 md:pb-5">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          <div className="relative calendar-canvas">
            <div className="calendar-week-grid border-b bg-background">
              <div className="border-r" />
              {Array.from({ length: 7 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-center gap-1.5 border-r py-2 last:border-r-0"
                >
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>

            <div className="calendar-week-grid">
              <div className="border-r">
                {Array.from({ length: DEFAULT_WINDOW_HOURS }, (_, hour) => (
                  <div key={hour} className="h-(--calendar-hour-height) pt-0.5 pr-1.5 text-right">
                    <Skeleton className="ml-auto h-3 w-8" />
                  </div>
                ))}
              </div>
              {Array.from({ length: 7 }, (_, day) => (
                <div key={day} className="border-r last:border-r-0">
                  {Array.from({ length: DEFAULT_WINDOW_HOURS }, (_, hour) => (
                    <div
                      key={hour}
                      className="h-(--calendar-hour-height) border-t first:border-t-0"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden w-(--side-panel-width) shrink-0 flex-col border-l lg:flex">
          <div className="flex h-9 items-center border-b px-3">
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex flex-col gap-0.5 p-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
