"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { HourValue } from "@momentum/core/analytics";

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
import { ANALYTICS_COPY, duration, hourLabel } from "@/features/analytics/copy";

interface Row {
  hour: number;
  completions: number;
  focusedMinutes: number;
}

/**
 * Twenty-four buckets always, including empty ones. Hours are the user's wall
 * clock, so on a DST day the skipped hour is empty and the repeated one holds
 * both passes. The hidden table carries focus minutes beside the completions;
 * putting both on one axis would need two scales.
 */
export function TimeOfDayChart({
  completions,
  focusMinutes,
}: {
  completions: readonly HourValue[];
  focusMinutes: readonly HourValue[];
}) {
  const rows: Row[] = completions.map((point, index) => ({
    hour: point.hour,
    completions: point.value,
    focusedMinutes: focusMinutes[index]?.value ?? 0,
  }));

  const columns: ChartTableColumn<Row>[] = [
    { header: ANALYTICS_COPY.columns.hour, cell: (row) => hourLabel(row.hour) },
    { header: ANALYTICS_COPY.columns.tasks, cell: (row) => row.completions },
    {
      header: ANALYTICS_COPY.columns.focusedTime,
      cell: (row) => duration(row.focusedMinutes),
    },
  ];

  return (
    <ChartFigure
      title={ANALYTICS_COPY.charts.timeOfDay.title}
      description={ANALYTICS_COPY.charts.timeOfDay.description}
      empty={ANALYTICS_COPY.charts.timeOfDay.empty}
      isEmpty={rows.every((row) => row.completions === 0)}
      rows={rows}
      columns={columns}
      rowKey={(row) => String(row.hour)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows.map((row) => ({ ...row, label: hourLabel(row.hour) }))}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value: unknown) => [numericValue(value), ANALYTICS_COPY.columns.tasks]}
          />
          <Bar dataKey="completions" fill={CHART_COLORS.secondary} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
