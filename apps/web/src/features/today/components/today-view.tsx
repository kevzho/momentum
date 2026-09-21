"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";

import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { useAnnounce } from "@momentum/ui/components/announcer";
import { toast } from "@momentum/ui/components/toast";

import type { DaySpan } from "@/features/calendar/types";
import { spanOf } from "@/features/calendar/projection";
import { claimQuest } from "@/features/gamification/actions";
import { useQuickAdd } from "@/features/tasks/components/quick-add-context";
import { buildRisks, selectNextUp, todayGuide } from "@/features/today/agenda";
import { AtRiskPanel } from "@/features/today/components/at-risk-panel";
import { DayProgress } from "@/features/today/components/day-progress";
import { NextUpPanel } from "@/features/today/components/next-up-panel";
import { RescheduleDialog } from "@/features/today/components/reschedule-dialog";
import { TodayCourseItems } from "@/features/today/components/today-course-items";
import { TodayHabits } from "@/features/today/components/today-habits";
import { TodayQuests } from "@/features/today/components/today-quests";
import { TodayTasks } from "@/features/today/components/today-tasks";
import { TodayTimeline } from "@/features/today/components/today-timeline";
import { greeting, longDate } from "@/features/today/copy";
import type { TodayItem, TodayPageData } from "@/features/today/types";
import { useTodayMutations } from "@/features/today/use-today-mutations";
import type { ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";
import { useMidnightRollover } from "@/lib/time/use-midnight-rollover";
import { useNow } from "@/lib/time/use-now";
import { useUserSettings } from "@/lib/time/user-settings";

/**
 * The Today page island. The only clock it reads is `useNow()`, and only to
 * decide what is past, current and next; before it ticks the same functions run
 * against `serverNow`, so hydration matches. Claiming a quest is deliberately
 * not optimistic: an optimistic "claimed" would be the client asserting a reward.
 */
export function TodayView({ data }: { data: TodayPageData }) {
  const announce = useAnnounce();
  const settings = useUserSettings();
  useMidnightRollover(data.timezone);

  const tick = useNow();
  // Null on the server render and through hydration; `serverNow` keeps both sides identical.
  const now = tick ?? data.serverNow;

  const { state, pendingIds, mutate } = useTodayMutations(data);
  const [rescheduling, setRescheduling] = React.useState<TodayItem | null>(null);
  const [claimingId, setClaimingId] = React.useState<string | null>(null);
  const [, startClaim] = React.useTransition();

  const nextUp = selectNextUp(state, now);
  const risks = buildRisks(state);
  const guide = todayGuide(state);
  const quickAdd = useQuickAdd();
  const addTask = React.useCallback(() => quickAdd.open(), [quickAdd]);

  const completeBlock = React.useCallback(
    (entry: TodayItem, completed: boolean) => {
      mutate.setBlockCompleted(entry, completed);
      announce(
        completed ? `${entry.item.title} marked done.` : `${entry.item.title} marked as not done.`,
      );
    },
    [announce, mutate],
  );

  const reschedule = React.useCallback(
    (entry: TodayItem, span: DaySpan) => {
      mutate.reschedule(entry, span);
      setRescheduling(null);
    },
    [mutate],
  );

  // A rejected call is a failure like `{ ok: false }`: without the catch React
  // re-throws it out of the transition and the error boundary blanks the page.
  // `unstable_rethrow` first, because `redirect()` and `notFound()` travel as
  // thrown values. Named so the failure toast's Retry can call it again.
  const claim = React.useCallback(
    function claim(assignmentId: string) {
      setClaimingId(assignmentId);
      startClaim(async () => {
        let result: ActionResult<unknown>;
        try {
          result = await claimQuest({ id: assignmentId });
        } catch (thrown) {
          unstable_rethrow(thrown);
          reportError(thrown, { source: "today.claim" });
          result = {
            ok: false,
            error: {
              code: "unavailable",
              message: "Momentum could not reach the server. Your change was not saved.",
            },
          };
        }
        setClaimingId(null);
        if (!result.ok) {
          toast.error(result.error.message, {
            // A validation refusal cannot be retried into success; a claim is otherwise idempotent.
            action:
              result.error.code === "validation"
                ? undefined
                : { label: "Retry", onClick: () => claim(assignmentId) },
          });
        }
      });
    },
    [startClaim],
  );

  return (
    <PageContainer>
      <div className="flex flex-col gap-3">
        <PageHeader
          title={greeting(state.dayPart, state.displayName)}
          description={longDate(state.today)}
        />
        {/* Below `md` the header's text is visually hidden, so the greeting is
            repeated here `aria-hidden`; the `h1` above stays the accessible heading. */}
        <div aria-hidden="true" className="flex flex-col gap-0.5 md:hidden">
          <p className="text-lg font-semibold tracking-tight">
            {greeting(state.dayPart, state.displayName)}
          </p>
          <p className="text-xs text-muted-foreground">{longDate(state.today)}</p>
        </div>
        <DayProgress level={state.level} xpToday={state.xpToday} />
      </div>

      <AtRiskPanel risks={risks} />

      {/* Next Up first at every width. */}
      <NextUpPanel
        nextUp={nextUp}
        guide={guide}
        timezone={state.timezone}
        pendingIds={pendingIds}
        onCompleteBlock={completeBlock}
        onCompleteTask={(task, completed) => {
          mutate.setTaskCompleted(task, completed);
          announce(completed ? `${task.title} completed.` : `${task.title} reopened.`);
        }}
        onReschedule={setRescheduling}
        onAddTask={addTask}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <TodayTimeline
            entries={state.timeline}
            guide={guide}
            now={now}
            pendingIds={pendingIds}
            onToggle={completeBlock}
          />
          <TodayTasks
            tasks={state.tasks}
            pendingIds={pendingIds}
            onToggle={(task, completed) => {
              mutate.setTaskCompleted(task, completed);
              announce(completed ? `${task.title} completed.` : `${task.title} reopened.`);
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <TodayCourseItems
            rows={state.courseItems}
            pendingIds={pendingIds}
            onToggle={(row, done) => {
              mutate.setCourseItemDone(row, done);
              announce(done ? `${row.item.title} done.` : `${row.item.title} not done.`);
            }}
          />
          <TodayHabits
            habits={state.habits}
            pendingIds={pendingIds}
            onToggle={(row, recorded) => {
              mutate.setHabitRecorded(row, recorded);
              announce(
                recorded
                  ? `${row.habit.name} recorded for today.`
                  : `${row.habit.name} no longer recorded for today.`,
              );
            }}
          />
          <TodayQuests quests={state.quests} claimingId={claimingId} onClaim={claim} />
        </div>
      </div>

      <RescheduleDialog
        entry={rescheduling}
        span={rescheduling === null ? null : spanOf(rescheduling.item, settings.timezone)}
        snapMinutes={settings.snapMinutes}
        onReschedule={reschedule}
        onClose={() => setRescheduling(null)}
      />
    </PageContainer>
  );
}
