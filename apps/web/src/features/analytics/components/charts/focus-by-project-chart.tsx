"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ProjectMinutes } from "@momentum/core/analytics";

import {
  ChartFigure,
  type ChartTableColumn,
} from "@/features/analytics/components/charts/chart-figure";
import {
  AXIS_TICK,
  CHART_COLORS,
  numericValue,
  projectFill,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "@/features/analytics/components/charts/chart-theme";
import { ANALYTICS_COPY, duration } from "@/features/analytics/copy";
import type { AnalyticsProject } from "@/features/analytics/types";

interface Row {
  key: string;
  name: string;
  color: string;
  minutes: number;
}

/** Horizontal: project names read better along a row. The name sits against the bar, so hue is decoration. */
export function FocusByProjectChart({
  data,
  projects,
}: {
  data: readonly ProjectMinutes[];
  projects: readonly AnalyticsProject[];
}) {
  const byId = new Map(projects.map((project) => [project.id ?? "", project]));
  const rows: Row[] = data.map((entry) => {
    const project = byId.get(entry.projectId ?? "");
    return {
      key: entry.projectId ?? "none",
      name: project?.name ?? "No project",
      color: project?.color ?? "slate",
      minutes: entry.minutes,
    };
  });

  const columns: ChartTableColumn<Row>[] = [
    { header: ANALYTICS_COPY.columns.project, cell: (row) => row.name },
    {
      header: ANALYTICS_COPY.columns.focusedTime,
      cell: (row) => duration(row.minutes),
    },
  ];

  return (
    <ChartFigure
      title={ANALYTICS_COPY.charts.focusByProject.title}
      description={ANALYTICS_COPY.charts.focusByProject.description}
      empty={ANALYTICS_COPY.charts.focusByProject.empty}
      isEmpty={rows.length === 0}
      rows={rows}
      columns={columns}
      rowKey={(row) => row.key}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 12 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={104}
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
          <Bar dataKey="minutes" radius={[0, 2, 2, 0]} barSize={14}>
            {rows.map((row) => (
              <Cell key={row.key} fill={projectFill(row.color)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
