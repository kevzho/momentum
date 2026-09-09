import { PageContainer } from "@momentum/ui/components/page-container";
import { Skeleton } from "@momentum/ui/components/skeleton";

import { PageHeaderSkeleton, SeparatorSkeleton } from "@/components/skeletons";

/**
 * The settings sections have four different control shapes, so this skeleton
 * spells them out rather than repeating one generic field. The heights track
 * the real controls: `Label` is `text-sm leading-none` (14px), `Input` and
 * `SelectTrigger` are `h-8`, a time-window row is two `h-8` fields beside
 * `size-7` icon buttons, and the segmented control is `h-7`.
 */
function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-0.5 h-4 w-48" />
      </div>
      <div className="flex max-w-md flex-col gap-4 md:col-span-2">{children}</div>
    </section>
  );
}

/** `Label` (14) · `gap-1.5` · a default-height control (32). */
function FieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

/**
 * One `TimeWindowList` row: an optional `w-24` day label, two `w-30` time
 * fields either side of a dash, the remove button and the add button.
 */
function WindowRowSkeleton({ labelled }: { labelled: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {labelled ? <Skeleton className="h-3.5 w-24 shrink-0" /> : null}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-30" />
        <Skeleton className="h-3.5 w-2" />
        <Skeleton className="h-8 w-30" />
        <Skeleton className="size-7 rounded-lg" />
        <Skeleton className="size-7 rounded-lg" />
      </div>
    </div>
  );
}

const WEEKDAY_ROWS = [0, 1, 2, 3, 4, 5, 6] as const;

export function SettingsSkeleton() {
  return (
    <PageContainer>
      <PageHeaderSkeleton hasActions={false} />

      <SectionShell>
        <FieldSkeleton />
        <FieldSkeleton />
      </SectionShell>
      <SeparatorSkeleton />

      <SectionShell>
        <FieldSkeleton />
        <FieldSkeleton />
      </SectionShell>
      <SeparatorSkeleton />

      {/* Working hours: seven day rows at the editor's `gap-3`. */}
      <SectionShell>
        <div className="flex flex-col gap-3">
          {WEEKDAY_ROWS.map((day) => (
            <WindowRowSkeleton key={day} labelled />
          ))}
        </div>
      </SectionShell>
      <SeparatorSkeleton />

      {/* Focus windows: one unlabelled row. */}
      <SectionShell>
        <WindowRowSkeleton labelled={false} />
      </SectionShell>
      <SeparatorSkeleton />

      <SectionShell>
        {/* Appearance: a plain `text-sm` label (20) over the segmented control. */}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-7 w-28" />
        </div>
      </SectionShell>
    </PageContainer>
  );
}
