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
import { ANALYTICS_COPY, dayLabel, duration } from "@/features/analytics/copy";

/** Bars rather than a line: a day with no session is a real zero, not a sample. */
export function FocusByDayChart({ data }: { data: readonly DayValue[] }) {
  const columns: ChartTableColumn<DayValue>[] = [
    { header: ANALYTICS_COPY.columns.date, cell: (row) => dayLabel(row.date) },
    {
      header: ANALYTICS_COPY.columns.focusedTime,
      cell: (row) => duration(row.value),
    },
  ];

  return (
    <ChartFigure
      title={ANALYTICS_COPY.charts.focusByDay.title}
      description={ANALYTICS_COPY.charts.focusByDay.description}
      empty={ANALYTICS_COPY.charts.focusByDay.empty}
      isEmpty={data.every((point) => point.value === 0)}
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
            width={44}
            tickFormatter={(value: number) => duration(value)}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value: unknown) => [
              duration(numericValue(value)),
              ANALYTICS_COPY.columns.focusedTime,
            ]}
          />
          <Bar dataKey="value" fill={CHART_COLORS.primary} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
