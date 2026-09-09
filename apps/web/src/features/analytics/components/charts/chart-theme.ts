// Recharts takes colours as strings, so each is a `var(--token)` reference:
// the SVG inherits the page's custom properties and a theme switch repaints
// the charts with no JavaScript. Verify chart palettes in each theme.

export const CHART_COLORS = {
  primary: "var(--chart-1)",
  secondary: "var(--chart-2)",
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
  /** The muted fill behind a "planned" bar: a reference value, not a measurement. */
  planned: "var(--muted-foreground)",
} as const;

/** The readable value of a project hue in the active theme. */
export function projectFill(color: string): string {
  return `var(--project-${color}-fg)`;
}

export const AXIS_TICK = { fill: CHART_COLORS.axis, fontSize: 11 } as const;

export const AXIS_LINE = { stroke: CHART_COLORS.grid } as const;

/** Recharts styles its own container inline, so the popover tokens are passed in. */
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

export const CHART_HEIGHT = 200;

/** Planned and actual must be distinguishable without colour (WCAG 1.4.1). */
export const HATCH_ID = "momentum-planned-hatch";

/** Recharts types a formatter's value as `string | number | Array<…> | undefined`; narrow rather than cast. */
export function numericValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
