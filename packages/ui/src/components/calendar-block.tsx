import * as React from "react";
import { cn } from "cn";
import { CheckIcon, RepeatIcon, SquareIcon } from "lucide-react";
import type { BlockKind, ProjectColor } from "@momentum/core/types";

import { projectSurface } from "@momentum/ui/components/project-dot";

/**
 * Block visual only; geometry arrives through `style`. Kinds are told apart
 * by shape and glyph, never colour alone. Never fade a completed block: the
 * project fg/bg pairs sit just over 4.5:1 and `opacity-60` drops them to ~2.7:1.
 */
const KIND_SHAPE: Record<BlockKind, string> = {
  event: "border-l-[3px] border-y-0 border-r-0",
  work: "border",
  habit: "border border-dashed",
};

const KIND_LABEL: Record<BlockKind, string> = {
  event: "Event",
  work: "Work block",
  habit: "Habit block",
};

function KindGlyph({ kind }: { kind: BlockKind }) {
  if (kind === "work") return <SquareIcon className="size-3 shrink-0" aria-hidden="true" />;
  if (kind === "habit") return <RepeatIcon className="size-3 shrink-0" aria-hidden="true" />;
  return null;
}

function CalendarBlock({
  kind,
  title,
  timeLabel,
  color = "slate",
  completed = false,
  settled = false,
  compact = false,
  dense = false,
  control,
  continuesBefore = false,
  continuesAfter = false,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title" | "color"> & {
  kind: BlockKind;
  title: React.ReactNode;
  timeLabel?: string;
  color?: ProjectColor;
  completed?: boolean;
  /** The block's task is complete but the block itself was never executed. */
  settled?: boolean;
  /** Set for blocks too short for a second line (under ~45 minutes). */
  compact?: boolean;
  /** Set for 15- and 20-minute blocks (14px and 19px tall), which cannot fit a padded line. */
  dense?: boolean;
  /** Replaces the kind glyph (a work block's completion control), so it must render a glyph itself. */
  control?: React.ReactNode;
  /** True when this is a later day of a block that started before midnight. */
  continuesBefore?: boolean;
  /** True when the block runs past midnight into the next column. */
  continuesAfter?: boolean;
}) {
  return (
    <div
      data-slot="calendar-block"
      data-kind={kind}
      data-completed={completed || undefined}
      data-settled={(settled && !completed) || undefined}
      className={cn(
        "@container flex min-w-0 flex-col justify-start overflow-hidden rounded-md text-2xs",
        projectSurface(color),
        KIND_SHAPE[kind],
        kind === "work" && "border-current bg-background",
        // A squared-off edge is where the block was cut by midnight.
        continuesBefore && "rounded-t-none",
        continuesAfter && "rounded-b-none",
        className,
      )}
      {...props}
    >
      {/* Padding lives here so the block itself is the container the query measures. */}
      <div
        className={cn(
          "flex min-w-0 flex-col justify-start px-1.5",
          dense ? "py-0 leading-3" : "py-1 leading-4",
          // Three-across in a week column leaves ~28px.
          "@max-[72px]:px-0.5",
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          {control ??
            (completed ? (
              <CheckIcon className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              <KindGlyph kind={kind} />
            ))}
          <span className={cn("truncate font-medium", completed && "line-through")}>{title}</span>
        </span>
        {timeLabel && !compact ? (
          // Below ~90px a time range reads "1…"; the sr-only copy keeps the information.
          <span data-slot="numeric" className="truncate @max-[92px]:hidden">
            {timeLabel}
          </span>
        ) : null}
      </div>
      <span className="sr-only">
        {KIND_LABEL[kind]}
        {completed ? ", completed" : ""}
        {settled && !completed ? ", task completed" : ""}
        {compact && timeLabel ? `, ${timeLabel}` : ""}
        {continuesBefore ? ", continued from the previous day" : ""}
        {continuesAfter ? ", continues on the next day" : ""}
      </span>
    </div>
  );
}

export { CalendarBlock };
