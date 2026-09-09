import * as React from "react";
import { cn } from "cn";

/**
 * Columns are weeks, oldest left; rows are the user's own week. Each state
 * carries a shape as well as a fill (WCAG 1.4.1), and no cell is a penalty.
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
  /** `sm` is 10px cells, `lg` is 16px. */
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
            // Positional key: one-letter labels repeat ("T", "S").
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
                          // Square on purpose: at 10px any radius reads as a circle.
                          "relative block border",
                          size === "lg" ? "size-4" : "size-2.5",
                          STATE_CLASSES[day.state],
                          // The notch: a met cell loses its bottom-right corner.
                          day.state === "met" &&
                            "after:absolute after:right-0 after:bottom-0 after:bg-card",
                          day.state === "met" &&
                            (size === "lg" ? "after:size-1.5" : "after:size-1"),
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
