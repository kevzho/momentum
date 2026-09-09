"use client";

import * as React from "react";

import { formatLocalDate } from "@momentum/core/time";

import { HabitHeatmap } from "@momentum/ui/components/habit-heatmap";
import { SideSheet } from "@momentum/ui/components/side-sheet";
import { StatTile } from "@momentum/ui/components/stat-tile";

import {
  HABITS_COPY,
  DAY_STATE_LABELS,
  describeRate,
  describeStreak,
  describeTarget,
  formatRate,
} from "@/features/habits/copy";
import { buildHeatmap, heatmapDayLabels } from "@/features/habits/heatmap";
import type { HabitView, HabitsPageData } from "@/features/habits/types";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * One habit's stats and twelve-week heatmap. "Best run" is shown beside
 * "current run" deliberately, so it reads as history rather than a record to defend.
 */
export interface HabitDetailSheetProps {
  view: HabitView | null;
  page: HabitsPageData;
  onClose: () => void;
}

export function HabitDetailSheet({ view, page, onClose }: HabitDetailSheetProps) {
  // Opened without a `Sheet.Trigger`, so Radix has nothing to return focus to on close.
  const openerFocus = useOpenerFocus(view !== null);

  return (
    <SideSheet
      open={view !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onOpenAutoFocus={openerFocus.onOpenAutoFocus}
      onCloseAutoFocus={openerFocus.onCloseAutoFocus}
      title={view?.habit.name ?? ""}
      description={view === null ? undefined : describeTarget(view.habit)}
    >
      {view === null ? null : <HabitDetail view={view} page={page} />}
    </SideSheet>
  );
}

function HabitDetail({ view, page }: { view: HabitView; page: HabitsPageData }) {
  const { stats } = view;

  const weeks = React.useMemo(
    () =>
      buildHeatmap({
        habit: view.habit,
        completions: view.history,
        from: page.historyFrom,
        to: page.today,
        today: page.today,
        weekStart: page.weekStart,
        trackedFrom: view.trackedFrom,
      }),
    [view.habit, view.history, view.trackedFrom, page.historyFrom, page.today, page.weekStart],
  );

  return (
    <div className="flex flex-col gap-5">
      {view.habit.description ? (
        <p className="text-sm text-muted-foreground">{view.habit.description}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label={HABITS_COPY.consistency}
          value={formatRate(stats.consistency)}
          hint={describeRate(stats.consistency, stats.streakUnit)}
        />
        <StatTile
          label={HABITS_COPY.bestStreak}
          value={describeStreak(stats.bestStreak, stats.streakUnit)}
          hint={`${HABITS_COPY.currentStreak}: ${describeStreak(stats.currentStreak, stats.streakUnit)}`}
        />
        <StatTile
          label={HABITS_COPY.thisWeek}
          value={formatRate(stats.weekly)}
          hint={describeRate(stats.weekly, stats.streakUnit)}
        />
        <StatTile
          label={HABITS_COPY.thisMonth}
          value={formatRate(stats.monthly)}
          hint={describeRate(stats.monthly, stats.streakUnit)}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {formatLocalDate(page.historyFrom, "medium")} – {formatLocalDate(page.today, "medium")}
        </h3>
        <HabitHeatmap
          weeks={weeks}
          dayLabels={heatmapDayLabels(page.weekStart, page.week)}
          caption={`${view.habit.name}, day by day`}
        />
        <HeatmapLegend />
      </section>
    </div>
  );
}

/** Names each state beside its shape, so the grid is readable without hue. */
function HeatmapLegend() {
  const entries = [
    { state: "met", className: "border-success bg-success" },
    {
      state: "partial",
      className: "border-success bg-[linear-gradient(135deg,var(--success)_50%,transparent_50%)]",
    },
    { state: "open", className: "border-border" },
    { state: "ahead", className: "border-dashed border-border/50" },
    { state: "free", className: "border-transparent bg-muted" },
  ] as const;

  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {entries.map((entry) => (
        <li key={entry.state} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <span
            className={`block size-2.5 rounded-sm border ${entry.className}`}
            aria-hidden="true"
          />
          {DAY_STATE_LABELS[entry.state]}
        </li>
      ))}
    </ul>
  );
}
