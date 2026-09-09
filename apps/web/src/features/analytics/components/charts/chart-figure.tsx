"use client";

import * as React from "react";
import { ChartColumnIncreasing } from "lucide-react";

import { EmptyState } from "@momentum/ui/components/empty-state";
import { useIsHydrated } from "@momentum/ui/hooks/use-is-hydrated";

import { ANALYTICS_COPY } from "@/features/analytics/copy";
import { CHART_HEIGHT } from "@/features/analytics/components/charts/chart-theme";

/**
 * The frame every chart sits in. The drawing is `aria-hidden` and the same
 * data is rendered beside it as an `sr-only` `<table>`, both from the same
 * array. The chart renders only after hydration (Recharts measures the DOM);
 * the placeholder holds the chart's height so the figure does not move.
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
  /** A line under the chart stating what it does not cover; read after the table. */
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
  // A `figure` takes its name from its caption only in some name computations;
  // naming it from the heading makes every chart addressable by title.
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
