import * as React from "react";
import { cn } from "cn";
import type { ProjectColor } from "@momentum/core/types";

import { ProjectDot } from "@momentum/ui/components/project-dot";

/**
 * Name · target · the week · progress · consistency · XP. Deliberately not a
 * card with chrome: a row with a rule under it, like every other dense surface
 * in the product.
 *
 * **Nothing here is punitive** (Domain Rule 7). There is no "missed" state and
 * no red: a scheduled day with nothing on it is drawn as an empty ring and
 * named "not recorded", and a day that has not finished yet is drawn dashed.
 * The consistency figure is a rate; no glyph in this row is a penalty.
 *
 * **And nothing here signals by colour alone** (specs/06-habits.md, WCAG 1.4.1).
 * The five day states differ in *shape* before they differ in hue — filled with
 * a check, half-filled with a bar, a solid ring, a dashed ring, a bare dot —
 * and each cell carries the day and its state as text for assistive technology
 * and as a `title` for a pointer. Turn the page greyscale and the week still
 * reads.
 */
type HabitDayState = "met" | "partial" | "open" | "ahead" | "free";

export interface HabitCardDay {
  /** A stable key and the pointer/AT label's subject, e.g. "Mon 7 Sep". */
  key: string;
  /** One or two characters inside the cell, e.g. "M". */
  short: string;
  state: HabitDayState;
  /** The whole sentence assistive technology reads, e.g. "Mon 7 Sep: done". */
  label: string;
  /** Set when the day can be recorded from here; otherwise the cell is static. */
  onSelect?: () => void;
  disabled?: boolean;
}

/**
 * The per-state visual. Shape first, hue second — `borderStyle` and the glyph
 * are what survive greyscale, and the background is the redundant cue.
 */
const DAY_STATE_CLASSES: Record<HabitDayState, string> = {
  met: "border-success bg-success text-success-foreground",
  partial: "border-success bg-success/25 text-foreground",
  open: "border-border text-muted-foreground",
  // No alpha on the text: the dashed ring and the bare dot already carry the
  // state by shape, and `text-muted-foreground/60` fell below AA (2.5:1).
  ahead: "border-dashed border-border/60 text-muted-foreground",
  free: "border-transparent text-muted-foreground",
};

/** The mark inside the cell. `null` leaves the day's initial showing. */
function DayGlyph({ state, short }: { state: HabitDayState; short: string }) {
  if (state === "met") {
    return (
      <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
        <path
          d="M2 5.2 L4 7.2 L8 2.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (state === "partial") {
    return (
      <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
        <path
          d="M2 5 L8 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (state === "free") {
    return <span className="size-1 rounded-full bg-current" aria-hidden="true" />;
  }

  return (
    <span className="text-2xs leading-none" aria-hidden="true">
      {short}
    </span>
  );
}

/**
 * The cell's box is the touch target; the ring inside it is the visual. On a
 * fine pointer the two coincide at 20px, so the week strip stays dense; on a
 * coarse pointer the box grows to the 40px floor (`pointer-coarse:`) while the
 * ring keeps its size, so a thumb cannot record the neighbouring day.
 */
const CELL_BOX =
  "flex size-5 shrink-0 items-center justify-center rounded-full pointer-coarse:size-10";

function HabitDayCell({ day }: { day: HabitCardDay }) {
  const content = (
    <>
      <DayGlyph state={day.state} short={day.short} />
      <span className="sr-only">{day.label}</span>
    </>
  );

  const shape = cn(
    "flex size-5 items-center justify-center rounded-full border transition-colors",
    DAY_STATE_CLASSES[day.state],
  );

  if (day.onSelect === undefined) {
    return (
      <span className={CELL_BOX} title={day.label}>
        <span data-slot="habit-day" className={shape}>
          {content}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      title={day.label}
      aria-pressed={day.state === "met"}
      /*
       * Not natively `disabled`: the browser blurs an element the moment it is
       * disabled, which would drop a keyboard user on `<body>` mid-week. The
       * cell stays focusable and refuses the press instead (Domain Rule 10) —
       * and it really refuses: a control that says it is disabled and still
       * acts would let a quick double press record a day and then un-record it.
       */
      aria-disabled={day.disabled || undefined}
      onClick={day.disabled ? undefined : day.onSelect}
      className={cn(
        CELL_BOX,
        "group/day focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        day.disabled ? "cursor-default opacity-70" : "cursor-pointer",
      )}
    >
      <span
        data-slot="habit-day"
        className={cn(shape, !day.disabled && "group-hover/day:border-success")}
      >
        {content}
      </span>
    </button>
  );
}

function HabitCard({
  name,
  target,
  week,
  weekLabel = "This week",
  progress,
  consistency,
  consistencyLabel,
  xpReward,
  color,
  actions,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "color"> & {
  name: React.ReactNode;
  /** "Every day · 25m", "Mon · Wed · Fri". */
  target: React.ReactNode;
  /** One entry per displayed day, week-start first. */
  week: readonly HabitCardDay[];
  /** The accessible name of the day strip as a whole. */
  weekLabel?: string;
  /** "2 of 3 days" — what the week has reached so far. */
  progress?: React.ReactNode;
  /** "86%", or an em dash when there is not enough history. */
  consistency: React.ReactNode;
  /** What that figure measures, for a pointer and for assistive technology. */
  consistencyLabel?: string;
  xpReward: number;
  color?: ProjectColor | null;
  /** The row's menu and any per-row button. */
  actions?: React.ReactNode;
}) {
  return (
    <div
      data-slot="habit-card"
      // Below `sm` the row wraps: the name, its figure and the actions share the
      // first line, and the week strip takes a full line of its own underneath,
      // so a phone shows the whole habit name instead of "Read 20 p".
      className={cn("flex items-center gap-x-3 gap-y-1 px-2 py-2 max-sm:flex-wrap", className)}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {color ? <ProjectDot color={color} /> : null}
          <span className="truncate text-sm font-medium">{name}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {target}
          {progress ? <span className="mx-1.5 text-muted-foreground/50">·</span> : null}
          {progress}
        </p>
      </div>

      <ul
        className="flex shrink-0 items-center gap-1 max-sm:order-last max-sm:basis-full"
        aria-label={weekLabel}
      >
        {week.map((day) => (
          <li key={day.key}>
            <HabitDayCell day={day} />
          </li>
        ))}
      </ul>

      <span
        data-slot="numeric"
        className="w-14 shrink-0 text-right text-xs"
        title={consistencyLabel}
      >
        {consistency}
      </span>
      <span
        data-slot="numeric"
        className="hidden w-12 shrink-0 text-right text-xs text-muted-foreground md:inline"
      >
        +{xpReward} XP
      </span>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

export { HabitCard, HabitDayCell };
export type { HabitDayState };
