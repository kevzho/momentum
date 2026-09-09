"use client";

import * as React from "react";
import {
  CalendarCheckIcon,
  CalendarDaysIcon,
  InboxIcon,
  RepeatIcon,
  TargetIcon,
} from "lucide-react";

import { scheduledMinutesOf, type Commitment } from "@momentum/core/scheduling";
import type { Uuid } from "@momentum/core/types";

import { EmptyState } from "@momentum/ui/components/empty-state";
import { Kbd } from "@momentum/ui/components/kbd";
import { SidePanel } from "@momentum/ui/components/side-panel";
import { SideSheet } from "@momentum/ui/components/side-sheet";

import type { PlanTask } from "@/features/calendar/types";
import { CapacitySummary } from "@/features/planning/components/capacity-summary";
import { FindTimeDialog } from "@/features/planning/components/find-time-dialog";
import { PlanningHabitRow } from "@/features/planning/components/planning-habit-row";
import { PlanningSection } from "@/features/planning/components/planning-section";
import { PlanningTaskRow } from "@/features/planning/components/planning-task-row";
import { ScheduleTaskDialog } from "@/features/planning/components/schedule-task-dialog";
import { WarningsList } from "@/features/planning/components/warnings-list";
import { WeeklyGoalRow } from "@/features/planning/components/weekly-goal-row";
import { WorkloadBars } from "@/features/planning/components/workload-bars";
import {
  DRAWER_TITLE,
  HIDE_DRAWER_LABEL,
  KEYBOARD_HINT,
  SECTIONS,
  dueInRangeTitle,
} from "@/features/planning/copy";
import { planningTaskOf } from "@/features/planning/live";
import type { PlanningDrawerProps } from "@/features/planning/types";
import { useWeekPlan } from "@/features/planning/use-week-plan";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * The Plan My Week drawer (specs/05-week-planning.md): everything competing
 * for the displayed range, beside the calendar rather than over it.
 *
 * Top to bottom — capacity, per-day workload, warnings, then OVERDUE, DUE
 * THIS WEEK, UNSCHEDULED, HABITS and WEEKLY GOALS. Every number is derived from the props
 * by `useWeekPlan`, so a drop, a resize or a rollback moves the totals, the
 * bars, the coverage labels and the warnings in the same frame as the board.
 *
 * The drawer holds no server data of its own and performs no mutation. It is a
 * client island because it is a drag source and owns the two dialogs' open
 * state (docs/ARCHITECTURE.md §5). Scheduling from any of its routes — a
 * drop, a Find Time candidate, the manual dialog — reports through the one
 * `onScheduleTask(taskId, span)` the grid's drop path uses.
 */
export function PlanningDrawer(props: PlanningDrawerProps) {
  const {
    open,
    onOpenChange,
    presentation,
    returnFocusTo,
    plan,
    settings,
    days,
    today,
    now,
    onScheduleTask,
    onAddHabitToWeek,
    pendingTaskIds,
    pendingHabitIds,
  } = props;
  const { commitments, context, sections, capacity, warnings } = useWeekPlan(props);

  // The two keyboard routes (Domain Rule 10). Each holds the task its dialog
  // is open for; at most one is non-null at a time, because each is opened
  // from a row and a row can only be activated once.
  const [finding, setFinding] = React.useState<PlanTask | null>(null);
  const [scheduling, setScheduling] = React.useState<PlanTask | null>(null);

  const rowProps = {
    commitments,
    pendingTaskIds,
    onFindTime: setFinding,
    onSchedule: setScheduling,
  };

  // The sheet is modal and has no trigger of its own, so Radix would leave
  // focus on `<body>` when it closes; this sends it back to the board's toggle
  // (Domain Rule 10). Unused by the panel, which hands focus over itself.
  const sheetFocus = useOpenerFocus(presentation === "sheet" && open);

  // One hint, once, for the routes the rows cannot show on their own.
  const footer = (
    <p className="text-2xs text-muted-foreground">
      {KEYBOARD_HINT.before}
      <Kbd>{KEYBOARD_HINT.findKey}</Kbd>
      {KEYBOARD_HINT.between}
      <Kbd>{KEYBOARD_HINT.pickKey}</Kbd>
      {KEYBOARD_HINT.after}
    </p>
  );

  const body = (
    <>
      <div className="flex flex-col gap-4">
        <CapacitySummary capacity={capacity} />
        <WorkloadBars days={days} workloads={capacity.days} today={today} />
        <WarningsList warnings={warnings} />

        <TaskSection
          title={SECTIONS.overdue.title}
          tasks={sections.overdue}
          empty={
            <EmptyState
              compact
              icon={CalendarCheckIcon}
              title={SECTIONS.overdue.emptyTitle}
              description={SECTIONS.overdue.emptyDescription}
            />
          }
          {...rowProps}
        />

        <TaskSection
          title={dueInRangeTitle(days.length)}
          tasks={sections.dueInRange}
          empty={
            <EmptyState
              compact
              icon={CalendarDaysIcon}
              title={SECTIONS.dueInRange.emptyTitle}
              description={SECTIONS.dueInRange.emptyDescription}
            />
          }
          {...rowProps}
        />

        <TaskSection
          title={SECTIONS.unscheduled.title}
          tasks={sections.unscheduled}
          empty={
            <EmptyState
              compact
              icon={InboxIcon}
              title={SECTIONS.unscheduled.emptyTitle}
              description={SECTIONS.unscheduled.emptyDescription}
            />
          }
          {...rowProps}
        />

        <PlanningSection
          title={SECTIONS.habits.title}
          count={plan.habits.length}
          empty={
            <EmptyState
              compact
              icon={RepeatIcon}
              title={SECTIONS.habits.emptyTitle}
              description={SECTIONS.habits.emptyDescription}
            />
          }
        >
          <ul className="flex flex-col gap-0.5">
            {plan.habits.map((row) => (
              <PlanningHabitRow
                key={row.habit.id}
                row={row}
                pending={pendingHabitIds.has(row.habit.id)}
                onAddToWeek={onAddHabitToWeek}
              />
            ))}
          </ul>
        </PlanningSection>

        <PlanningSection
          title={SECTIONS.weeklyGoals.title}
          count={plan.weeklyGoals.length}
          empty={
            <EmptyState
              compact
              icon={TargetIcon}
              title={SECTIONS.weeklyGoals.emptyTitle}
              description={SECTIONS.weeklyGoals.emptyDescription}
            />
          }
        >
          <ul className="flex flex-col gap-0.5">
            {plan.weeklyGoals.map((goal) => (
              <WeeklyGoalRow key={goal.id} goal={goal} />
            ))}
          </ul>
        </PlanningSection>
      </div>

      <FindTimeDialog
        task={finding}
        commitments={commitments}
        context={context}
        settings={settings}
        days={days}
        today={today}
        now={now}
        onScheduleTask={onScheduleTask}
        onClose={() => setFinding(null)}
      />

      <ScheduleTaskDialog
        task={scheduling}
        settings={settings}
        days={days}
        today={today}
        onSchedule={onScheduleTask}
        onClose={() => setScheduling(null)}
      />
    </>
  );

  if (presentation === "sheet") {
    return (
      <SideSheet
        open={open}
        onOpenChange={onOpenChange}
        title={DRAWER_TITLE}
        footer={footer}
        onOpenAutoFocus={sheetFocus.onOpenAutoFocus}
        onCloseAutoFocus={sheetFocus.onCloseAutoFocus}
      >
        {body}
      </SideSheet>
    );
  }

  return (
    <SidePanel
      title={DRAWER_TITLE}
      open={open}
      onOpenChange={onOpenChange}
      closeLabel={HIDE_DRAWER_LABEL}
      // Hiding the drawer unmounts the button that was pressed to hide it, so
      // the panel hands focus back to the board's toggle on the way out
      // (Domain Rule 10).
      returnFocusTo={returnFocusTo}
      // The panel is the `lg`-and-up form. The server renders it (its snapshot
      // of the viewport is "wide"), so below `lg` this keeps it out of the
      // first paint until the client swaps in the sheet.
      className="hidden lg:flex"
      footer={footer}
    >
      {body}
    </SidePanel>
  );
}

function TaskSection({
  title,
  tasks,
  empty,
  commitments,
  pendingTaskIds,
  onFindTime,
  onSchedule,
}: {
  title: string;
  tasks: readonly PlanTask[];
  empty: React.ReactNode;
  commitments: readonly Commitment[];
  pendingTaskIds: ReadonlySet<Uuid>;
  onFindTime: (task: PlanTask) => void;
  onSchedule: (task: PlanTask) => void;
}) {
  return (
    <PlanningSection title={title} count={tasks.length} empty={empty}>
      <ul className="flex flex-col gap-0.5">
        {tasks.map((task) => (
          <PlanningTaskRow
            key={task.id}
            task={task}
            // Live: the task's blocks on the board right now, so a row dragged
            // in shows its coverage before the write has landed.
            scheduledMinutes={scheduledMinutesOf(planningTaskOf(task), commitments)}
            pending={pendingTaskIds.has(task.id)}
            onFindTime={onFindTime}
            onSchedule={onSchedule}
          />
        ))}
      </ul>
    </PlanningSection>
  );
}
