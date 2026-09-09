/**
 * The tokens every chart draws with, in one place.
 *
 * Recharts takes colours as strings, so each of these is a `var(--token)`
 * reference rather than a resolved value. That is the whole theming strategy:
 * the SVG inherits the same custom properties the rest of the page uses, so a
 * theme switch repaints the charts with no JavaScript, no second palette and no
 * chance of a chart being legible in light and invisible in dark
 * (docs/DESIGN_SYSTEM.md — verify chart palettes in each theme independently).
 *
 * `chart-1` and `chart-2` are the design system's chart hues. The project
 * palette's `fg` token is used where a series *is* a project, because it is the
 * hue's readable value in whichever theme is active — dark on light, light on
 * dark.
 */

export const CHART_COLORS = {
  primary: "var(--chart-1)",
  secondary: "var(--chart-2)",
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
  /** The muted fill behind a "planned" bar, which is a reference value, not a measurement. */
  planned: "var(--muted-foreground)",
} as const;

/** A project hue as a chart fill: the readable value of that hue in the active theme. */
export function projectFill(color: string): string {
  return `var(--project-${color}-fg)`;
}

/** Axis ticks: small, muted, and never smaller than the design system's floor. */
export const AXIS_TICK = { fill: CHART_COLORS.axis, fontSize: 11 } as const;

export const AXIS_LINE = { stroke: CHART_COLORS.grid } as const;

/**
 * The tooltip surface, themed to `popover` like every other floating surface.
 * Recharts styles its own container inline, so the tokens have to be passed in.
 */
export const TOOLTIP_STYLE = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-2xs)",
  boxShadow: "var(--shadow-popover)",
  padding: "0.375rem 0.5rem",
} as const;

export const TOOLTIP_LABEL_STYLE = { color: "var(--popover-foreground)", fontWeight: 500 } as const;
export const TOOLTIP_ITEM_STYLE = { color: "var(--popover-foreground)" } as const;

/** Every chart is the same height, so a row of them reads as one instrument. */
export const CHART_HEIGHT = 200;

/**
 * The id of the hatch pattern the "planned" series is filled with.
 *
 * Planned and actual must be distinguishable without colour (WCAG 1.4.1), and
 * two bars side by side already differ in position — the hatch is what keeps
 * them distinct in the legend and in greyscale as well.
 */
export const HATCH_ID = "momentum-planned-hatch";

/**
 * The one place a Recharts tooltip value is narrowed to a number.
 *
 * Recharts types a formatter's argument as `string | number | Array<…>` and
 * possibly `undefined`, because a tooltip is generic over any series. Ours are
 * all numeric, but the honest way to say so is to narrow at the boundary rather
 * than to assert through the library's type — a cast would be a claim the
 * compiler cannot check and the codebase does not permit.
 */
export function numericValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
