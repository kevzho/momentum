"use client";

import * as React from "react";
import { ChartColumnIncreasing } from "lucide-react";

import { EmptyState } from "@momentum/ui/components/empty-state";
import { useIsHydrated } from "@momentum/ui/hooks/use-is-hydrated";

import { ANALYTICS_COPY } from "@/features/analytics/copy";
import { CHART_HEIGHT } from "@/features/analytics/components/charts/chart-theme";

/**
 * The frame every visualization on this page sits in.
 *
 * It exists to make one requirement structural rather than remembered: **the
 * numbers are in the accessibility tree, always.** The drawing is marked
 * `aria-hidden` — an SVG of bars is noise to a screen reader even when Recharts
 * labels it — and the same data is rendered beside it as a real `<table>`, kept
 * off screen with `sr-only`. A reader gets a caption, column headers and rows;
 * a sighted user gets the chart. Neither is a reduced version of the other,
 * because both are generated from the same array.
 *
 * The chart itself renders only after hydration. Recharts measures the DOM to
 * lay out an axis, so there is nothing meaningful for it to draw on the server;
 * the placeholder holds exactly the chart's height, so the figure does not move
 * when it arrives. The table is present from the first byte either way, which
 * means the page's *content* never depends on JavaScript.
 */

export interface ChartTableColumn<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
}

export interface ChartFigureProps<T> {
  title: string;
  description: string;
  /** Shown in place of the chart when the window holds nothing to draw. */
  empty: string;
  isEmpty: boolean;
  rows: readonly T[];
  columns: readonly ChartTableColumn<T>[];
  rowKey: (row: T, index: number) => string;
  /**
   * A line under the chart stating what it does not cover. Rendered inside the
   * figure and read after the table, so the qualification cannot be separated
   * from the numbers it qualifies.
   */
  footer?: string;
  children: React.ReactNode;
}

export function ChartFigure<T>({
  title,
  description,
  empty,
  isEmpty,
  rows,
  columns,
  rowKey,
  footer,
  children,
}: ChartFigureProps<T>) {
  const hydrated = useIsHydrated();
  // A `figure` takes its accessible name from its caption only in some name
  // computations; naming it from the heading explicitly is what makes every
  // chart addressable by title in the accessibility tree, and in a test.
  const headingId = React.useId();

  return (
    <figure className="flex min-w-0 flex-col gap-2" aria-labelledby={headingId}>
      <figcaption className="flex flex-col gap-0.5">
        <h2
          id={headingId}
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </figcaption>

      {isEmpty ? (
        <div
          className="flex items-center justify-center rounded-md border border-dashed border-border"
          style={{ height: CHART_HEIGHT }}
        >
          <EmptyState icon={ChartColumnIncreasing} title={empty} />
        </div>
      ) : (
        <>
          <div aria-hidden="true" style={{ height: CHART_HEIGHT }} className="min-w-0">
            {hydrated ? children : null}
          </div>
          <table className="sr-only">
            <caption>{ANALYTICS_COPY.tableCaption(title)}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.header} scope="col">
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={rowKey(row, index)}>
                  {columns.map((column, columnIndex) => {
                    const value = column.cell(row);
                    return columnIndex === 0 ? (
                      <th key={column.header} scope="row">
                        {value}
                      </th>
                    ) : (
                      <td key={column.header}>{value}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {footer ? <p className="text-2xs text-muted-foreground">{footer}</p> : null}
        </>
      )}
    </figure>
  );
}
