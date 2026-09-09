import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";

/**
 * The shipped tasks page, in boxes: a header, then one `gap-3` column holding
 * the view tabs, the toolbar, the key hint and a single flat list — no sections
 * and no section labels, which is what this skeleton drew before Phase 4
 * replaced them.
 *
 * The heights are the real components' tokens. The tab row is a strip of
 * `Button size="sm"` (`h-7`); the toolbar's tallest child is its search `Input`
 * (`h-8`); `TaskListKeyHint` is one line whose `Kbd` glyphs are `h-4`; and
 * `RowsSkeleton` already mirrors the list's `gap-0.5` rows.
 *
 * `BulkActionBar` is deliberately not modelled: it renders only when something
 * is selected, so holding space for it would introduce the shift this file
 * exists to prevent.
 */
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
