"use client";

import * as React from "react";

import { ANALYTICS_RANGES, type AnalyticsRange } from "@momentum/core/analytics";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { SegmentedControl } from "@momentum/ui/components/segmented-control";
import { Separator } from "@momentum/ui/components/separator";
import { StatTile } from "@momentum/ui/components/stat-tile";

import { AnalyticsEmpty } from "@/features/analytics/components/analytics-empty";
import { CompletionTrendChart } from "@/features/analytics/components/charts/completion-trend-chart";
import { FocusByDayChart } from "@/features/analytics/components/charts/focus-by-day-chart";
import { FocusByProjectChart } from "@/features/analytics/components/charts/focus-by-project-chart";
import { HabitConsistencyChart } from "@/features/analytics/components/charts/habit-consistency-chart";
import { PlannedVsActualChart } from "@/features/analytics/components/charts/planned-vs-actual-chart";
import { TimeOfDayChart } from "@/features/analytics/components/charts/time-of-day-chart";
import { InsightsPanel } from "@/features/analytics/components/insights-panel";
import { ANALYTICS_COPY, duration, percent, rangeSentence } from "@/features/analytics/copy";
import type { AnalyticsPageData } from "@/features/analytics/types";

const DEFAULT_RANGE: AnalyticsRange = "30";

/**
 * One client island over one server read: all three windows arrive already
 * aggregated, so switching range is a state change and nothing else. No
 * arithmetic and no date maths here.
 */
export function AnalyticsView({ data }: { data: AnalyticsPageData }) {
  const [range, setRange] = React.useState<AnalyticsRange>(DEFAULT_RANGE);

  if (data.hasNoHistory) return <AnalyticsEmpty />;

  const summary = data.ranges[range];
  const { totals } = summary;

  return (
    <PageContainer>
      <PageHeader
        title={ANALYTICS_COPY.title}
        description={ANALYTICS_COPY.description}
        actions={
          <SegmentedControl<AnalyticsRange>
            label={ANALYTICS_COPY.rangeLabel}
            value={range}
            onValueChange={setRange}
            options={ANALYTICS_RANGES.map((value) => ({
              value,
              label: ANALYTICS_COPY.ranges[value].label,
              ariaLabel: ANALYTICS_COPY.ranges[value].ariaLabel,
            }))}
          />
        }
      />

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <StatTile
          label={ANALYTICS_COPY.totals.focused}
          value={duration(totals.focusedMinutes)}
          hint={`over ${rangeSentence(range)}`}
        />
        <StatTile label={ANALYTICS_COPY.totals.tasks} value={totals.tasksCompleted} />
        <StatTile
          label={ANALYTICS_COPY.totals.habits}
          value={percent(totals.habitRate.value)}
          hint={
            totals.habitRate.expected === 0
              ? undefined
              : `${totals.habitRate.met} of ${totals.habitRate.expected} recorded`
          }
        />
        <StatTile
          label={ANALYTICS_COPY.totals.blocks}
          value={`${totals.blocks.completed} / ${totals.blocks.scheduled}`}
          hint={
            totals.blocks.completed === 0 ? undefined : duration(totals.blocks.completedMinutes)
          }
        />
      </div>

      <Separator />

      <InsightsPanel insights={summary.insights} />

      <Separator />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <FocusByDayChart data={summary.focusByDay} />
        <FocusByProjectChart data={summary.focusByProject} projects={data.projects} />
        <PlannedVsActualChart
          data={summary.estimateByProject}
          projects={data.projects}
          uncovered={totals.estimates.withoutEstimate}
        />
        <HabitConsistencyChart days={summary.habitByDay} weekStart={data.weekStart} />
        <CompletionTrendChart data={summary.completionsByDay} />
        <TimeOfDayChart
          completions={summary.completionsByHour}
          focusMinutes={summary.focusByHour}
        />
      </div>
    </PageContainer>
  );
}
