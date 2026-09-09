import * as React from "react";
import { cn } from "cn";

/**
 * A habit's longer range, as a grid of weeks.
 *
 * Columns are weeks, oldest on the left; rows are the seven days of the user's
 * own week. It is the same five states the week strip uses, at a smaller size —
 * so the page has one vocabulary for "what happened on a day" rather than two.
 *
 * **Not colour alone** (specs/06-habits.md, WCAG 1.4.1). Each cell carries a
 * shape as well as a fill: a met day is a filled square with a corner notch cut
 * out, a partial day is half-filled along the diagonal, a day with nothing
 * recorded is a hollow square, a day still to come is hollow and dashed, and a
 * day the habit asks nothing of is a small centred dot. Every cell also carries
 * its date and state as text, so the grid is legible to a screen reader and to
 * a pointer, and readable in greyscale.
 *
 * There is no red anywhere in it, and no cell is a penalty (Domain Rule 7).
 */
export type HeatmapState = "met" | "partial" | "open" | "ahead" | "free";

export interface HeatmapCell {
  /** The date, as a stable key. */
  key: string;
  state: HeatmapState;
  /** "Mon 7 September: done" — read by assistive technology and shown on hover. */
  label: string;
}

/** One column: seven cells, week-start first. A leading or trailing week may be short. */
export interface HeatmapWeek {
  key: string;
  /** Exactly seven entries; `null` for a day outside the range. */
  days: readonly (HeatmapCell | null)[];
}

const STATE_CLASSES: Record<HeatmapState, string> = {
  met: "border-success bg-success",
  partial: "border-success bg-[linear-gradient(135deg,var(--success)_50%,transparent_50%)]",
  open: "border-border bg-transparent",
  ahead: "border-dashed border-border/50 bg-transparent",
  free: "border-transparent bg-transparent",
};

function HabitHeatmap({
  weeks,
  dayLabels,
  caption,
  size = "sm",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  weeks: readonly HeatmapWeek[];
  /**
   * `sm` (10px cells) is the habit sheet's twelve-week strip; `lg` (16px cells)
   * is for a figure that has the room, such as the analytics consistency chart,
   * where 10px cells left most of a 200px panel empty (Phase 13, PROG-17).
   */
  size?: "sm" | "lg";
  /** Seven short weekday names, week-start first. Only alternate rows are shown. */
  dayLabels: readonly string[];
  /** The grid's accessible name, e.g. "Gym over the last 12 weeks". */
  caption: string;
}) {
  return (
    <div
      data-slot="habit-heatmap"
      className={cn("overflow-x-auto", className)}
      role="group"
      aria-label={caption}
      {...props}
    >
      <div className="flex gap-1">
        <ul
          className={cn("flex shrink-0 flex-col pr-1", size === "lg" ? "gap-1" : "gap-0.5")}
          aria-hidden="true"
        >
          {dayLabels.map((label, index) => (
            // Positional: one-letter labels repeat ("T", "S"), so the text is
            // not a key.
            <li
              key={index}
              className={cn(
                "flex items-center text-2xs leading-none text-muted-foreground",
                size === "lg" ? "h-4" : "h-2.5",
              )}
            >
              {index % 2 === 1 ? label : ""}
            </li>
          ))}
        </ul>

        <ul className={cn("flex", size === "lg" ? "gap-1" : "gap-0.5")}>
          {weeks.map((week) => (
            <li key={week.key}>
              <ul className={cn("flex flex-col", size === "lg" ? "gap-1" : "gap-0.5")}>
                {week.days.map((day, index) => (
                  <li key={day?.key ?? `${week.key}:${index}`}>
                    {day === null ? (
                      <span
                        className={cn("block", size === "lg" ? "size-4" : "size-2.5")}
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        title={day.label}
                        className={cn(
                          // Square on purpose: at 10px any radius reads as a circle and the met
                          // cell's corner notch as a pie slice.
                          "relative block border",
                          size === "lg" ? "size-4" : "size-2.5",
                          STATE_CLASSES[day.state],
                          // The notch: a met cell loses its bottom-right corner,
                          // so "done" has an outline nothing else has.
                          day.state === "met" &&
                            "after:absolute after:right-0 after:bottom-0 after:bg-card",
                          day.state === "met" &&
                            (size === "lg" ? "after:size-1.5" : "after:size-1"),
                          // A free day is a dot rather than a square.
                          day.state === "free" &&
                            "before:absolute before:top-1/2 before:left-1/2 before:size-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-muted-foreground/40",
                        )}
                      >
                        <span className="sr-only">{day.label}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { HabitHeatmap };
