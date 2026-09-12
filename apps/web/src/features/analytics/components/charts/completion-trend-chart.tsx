"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DayValue } from "@momentum/core/analytics";

import {
  ChartFigure,
  type ChartTableColumn,
} from "@/features/analytics/components/charts/chart-figure";
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_COLORS,
  numericValue,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "@/features/analytics/components/charts/chart-theme";
import { ANALYTICS_COPY, dayLabel } from "@/features/analytics/copy";

/** Bars, like focus-by-day: a day's count is a whole number and a day with none is a real zero, not a point to curve through. */
export function CompletionTrendChart({ data }: { data: readonly DayValue[] }) {
  const columns: ChartTableColumn<DayValue>[] = [
    { header: ANALYTICS_COPY.columns.date, cell: (row) => dayLabel(row.date) },
    { header: ANALYTICS_COPY.columns.tasks, cell: (row) => row.value },
  ];

  const peak = data.reduce((highest, point) => Math.max(highest, point.value), 0);

  return (
    <ChartFigure
      title={ANALYTICS_COPY.charts.completions.title}
      description={ANALYTICS_COPY.charts.completions.description}
      empty={ANALYTICS_COPY.charts.completions.empty}
      isEmpty={peak === 0}
      rows={data}
      columns={columns}
      rowKey={(row) => row.date}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((point) => ({ ...point, label: dayLabel(point.date) }))}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={28}
            allowDecimals={false}
            domain={[0, Math.max(1, peak)]}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value: unknown) => [numericValue(value), ANALYTICS_COPY.columns.tasks]}
          />
          <Bar dataKey="value" fill={CHART_COLORS.primary} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
