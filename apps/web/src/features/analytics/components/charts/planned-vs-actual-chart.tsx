"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EstimateComparison } from "@momentum/core/analytics";

import {
  ChartFigure,
  type ChartTableColumn,
} from "@/features/analytics/components/charts/chart-figure";
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_COLORS,
  numericValue,
  HATCH_ID,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "@/features/analytics/components/charts/chart-theme";
import { ANALYTICS_COPY, duration } from "@/features/analytics/copy";
import type { AnalyticsProject } from "@/features/analytics/types";

interface Row {
  key: string;
  name: string;
  planned: number;
  actual: number;
  taskCount: number;
}

/**
 * Chart 3 — planned time beside actual time.
 *
 * Two grouped bars per project, never one bar and a delta. The aggregation
 * guarantees both bars are summed over the *same* completed tasks — the ones
 * carrying an estimate and recorded time — and this component keeps them in two
 * separate `dataKey`s so no rendering step can add, subtract or substitute one
 * for the other (Domain Rule 3).
 *
 * The tasks the comparison cannot cover are stated underneath rather than
 * quietly dropped, so the pair is never read as the whole period.
 *
 * Planned is drawn as a hatched bar and actual as a solid one. That is not
 * decoration: the two series have to be distinguishable without relying on hue
 * (WCAG 1.4.1), and the hatch survives greyscale, colour-blindness and a
 * monochrome print.
 */
export function PlannedVsActualChart({
  data,
  projects,
  uncovered,
}: {
  data: readonly EstimateComparison[];
  projects: readonly AnalyticsProject[];
  uncovered: number;
}) {
  const byId = new Map(projects.map((project) => [project.id ?? "", project]));
  const rows: Row[] = data.map((entry) => ({
    key: entry.projectId ?? "none",
    name: byId.get(entry.projectId ?? "")?.name ?? "No project",
    planned: entry.plannedMinutes,
    actual: entry.actualMinutes,
    taskCount: entry.taskCount,
  }));

  const columns: ChartTableColumn<Row>[] = [
    { header: ANALYTICS_COPY.columns.project, cell: (row) => row.name },
    { header: ANALYTICS_COPY.columns.planned, cell: (row) => duration(row.planned) },
    { header: ANALYTICS_COPY.columns.actual, cell: (row) => duration(row.actual) },
    { header: ANALYTICS_COPY.columns.tasks, cell: (row) => row.taskCount },
  ];

  return (
    <ChartFigure
      title={ANALYTICS_COPY.charts.plannedVsActual.title}
      description={ANALYTICS_COPY.charts.plannedVsActual.description}
      empty={ANALYTICS_COPY.charts.plannedVsActual.empty}
      isEmpty={rows.length === 0}
      rows={rows}
      columns={columns}
      rowKey={(row) => row.key}
      footer={
        uncovered > 0 ? ANALYTICS_COPY.charts.plannedVsActual.uncovered(uncovered) : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: 0, right: 8 }}>
          <defs>
            <pattern
              id={HATCH_ID}
              width={5}
              height={5}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width={5} height={5} fill={CHART_COLORS.planned} fillOpacity={0.16} />
              <line x1={0} y1={0} x2={0} y2={5} stroke={CHART_COLORS.planned} strokeWidth={2} />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(value: number) => duration(value)}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value: unknown) => duration(numericValue(value))}
          />
          <Legend
            wrapperStyle={{ fontSize: "var(--text-2xs)", color: CHART_COLORS.axis }}
            iconType="square"
          />
          <Bar
            dataKey="planned"
            name={ANALYTICS_COPY.charts.plannedVsActual.planned}
            fill={`url(#${HATCH_ID})`}
            stroke={CHART_COLORS.planned}
            strokeOpacity={0.5}
            radius={[2, 2, 0, 0]}
          />
          <Bar
            dataKey="actual"
            name={ANALYTICS_COPY.charts.plannedVsActual.actual}
            fill={CHART_COLORS.primary}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
