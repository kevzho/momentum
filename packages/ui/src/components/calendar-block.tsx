import * as React from "react";
import { cn } from "cn";
import { CheckIcon, RepeatIcon, SquareIcon } from "lucide-react";
import type { BlockKind, ProjectColor } from "@momentum/core/types";

import { projectSurface } from "@momentum/ui/components/project-dot";

/**
 * The block visual for all three kinds. It consumes geometry (through `style`)
 * and owns no logic: no positioning maths, no drag state, no time maths. The
 * grid that places it lives in the calendar feature; the pixel ↔ time mapping
 * lives in `@momentum/core/calendar`.
 *
 * Kinds are distinguishable without colour (docs/DESIGN_SYSTEM.md):
 *   event  solid left rule, filled background
 *   work   1px outline, checkbox glyph
 *   habit  dashed outline, repeat glyph
 * A completed block is marked by its check glyph and a strikethrough, never by
 * fading it. Opacity was the obvious way to say "settled" and is the one thing
 * that cannot be done here: these titles are 11px, `text-2xs` is the smallest
 * step in the scale, and every project `fg` on `bg` pair was chosen to land
 * just over 4.5:1 — so `opacity-60` takes a compliant pair to about 2.7:1 and a
 * completed block becomes the least readable thing on the board. The glyph and
 * the rule are the signal, and neither is colour (docs/DESIGN_SYSTEM.md).
 *
 * The block is its own container query. Two things about a week grid make that
 * necessary rather than clever: a 15-minute block is 14px tall, which is less
 * than one line of `text-2xs` plus its padding, and three overlapping blocks in
 * a 7-day column are ~28px wide, of which 12px would otherwise be padding. So
 * the padding and the time label answer to the box the block actually got, not
 * to a guess made where it was placed.
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
  /**
   * The block's task is complete but the block itself was never executed.
   * Domain Rule 13 keeps those blocks on the calendar and renders them
   * "settled": present and readable, but no longer asking anything of the user.
   */
  settled?: boolean;
  /** Set for blocks too short for a second line (under ~45 minutes). */
  compact?: boolean;
  /**
   * Set for blocks too short for a padded line at all — 15 and 20 minutes,
   * which are 14px and 19px tall. Without it the title is clipped in half.
   */
  dense?: boolean;
  /**
   * Occupies the glyph slot, for the one block that carries an action of its
   * own: a work block's completion control (Domain Rule 13). At a 15-minute
   * height there is room for exactly one glyph, so the control replaces the
   * kind glyph rather than crowding in beside it — which means the control has
   * to render a glyph itself, or the block loses half of its non-colour signal.
   */
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
        // A squared-off edge is where the block was cut by midnight rather than
        // where it ends; the rounded edges are the block's real start and end.
        continuesBefore && "rounded-t-none",
        continuesAfter && "rounded-b-none",
        className,
      )}
      {...props}
    >
      {/* The padding lives here so the block itself can be the container the
          query measures. `dense` is the 15-minute case: one line of type has
          to fit in 14px, which it does at `leading-3` with no padding and does
          not at `leading-4` with any. */}
      <div
        className={cn(
          "flex min-w-0 flex-col justify-start px-1.5",
          dense ? "py-0 leading-3" : "py-1 leading-4",
          // Three-across in a week column leaves ~28px; 12px of that cannot be
          // padding, or the title is one character wide.
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
          // A time range needs about 90px to say anything; below that it reads
          // "1…" and costs the title a line. The screen-reader copy below keeps
          // the information either way.
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
