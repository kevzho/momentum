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
import { OnboardingChecklist } from "@/features/onboarding/components/onboarding-checklist";
import { SCHEDULE_STEP } from "@/features/onboarding/copy";
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
 * The Plan My Week drawer: capacity, workload, warnings, then the task,
 * habit and goal sections. Holds no server data and performs no mutation;
 * every scheduling route reports through `onScheduleTask`.
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
    onboarding = null,
  } = props;
  const { commitments, context, sections, capacity, warnings } = useWeekPlan(props);

  // The task each keyboard dialog is open for; at most one is non-null at a time.
  const [finding, setFinding] = React.useState<PlanTask | null>(null);
  const [scheduling, setScheduling] = React.useState<PlanTask | null>(null);

  const rowProps = {
    commitments,
    pendingTaskIds,
    onFindTime: setFinding,
    onSchedule: setScheduling,
  };

  // The sheet has no trigger of its own, so Radix would leave focus on
  // `<body>` on close. Unused by the panel, which hands focus over itself.
  const sheetFocus = useOpenerFocus(presentation === "sheet" && open);

  const footer = (
    <p className="text-2xs text-muted-foreground">
      {KEYBOARD_HINT.before}
      <Kbd>{KEYBOARD_HINT.findKey}</Kbd>
      {KEYBOARD_HINT.between}
      <Kbd>{KEYBOARD_HINT.pickKey}</Kbd>
      {KEYBOARD_HINT.after}
    </p>
  );

  // The checklist's last step places a task; the first row without a slot is
  // the one Find Time opens for.
  const firstUnscheduled = sections.unscheduled[0] ?? null;

  const body = (
    <>
      <div className="flex flex-col gap-4">
        {onboarding === null ? null : (
          <OnboardingChecklist
            state={onboarding}
            workingHours={plan.workingHours}
            weekStart={settings.weekStart}
            liveHasWorkBlock={commitments.some((commitment) => commitment.kind === "work")}
            schedule={
              firstUnscheduled === null
                ? null
                : { label: SCHEDULE_STEP.findTime, onActivate: () => setFinding(firstUnscheduled) }
            }
          />
        )}
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
      // Hiding the drawer unmounts the button that hid it.
      returnFocusTo={returnFocusTo}
      // The server renders the panel (its viewport snapshot is "wide"); this
      // keeps it out of a narrow first paint until the client swaps in the sheet.
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
            // Live coverage, so a row dragged in shows it before the write lands.
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
