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
import { buildRisks, selectNextUp } from "@/features/today/agenda";
import { AtRiskPanel } from "@/features/today/components/at-risk-panel";
import { DayProgress } from "@/features/today/components/day-progress";
import { NextUpPanel } from "@/features/today/components/next-up-panel";
import { RescheduleDialog } from "@/features/today/components/reschedule-dialog";
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
 * The Today page: one client island over server-resolved data.
 *
 * It fetches nothing and does no date arithmetic — `page.today`, every instant
 * and every number arrived already resolved in the profile timezone
 * (docs/ARCHITECTURE.md §5). The only clock it reads is `useNow()`, and only to
 * decide what is past, current and next; before it ticks, and on the server,
 * the same functions run against `serverNow`, so the markup React hydrates is
 * the markup it renders (docs/ARCHITECTURE.md §10).
 *
 * `useMidnightRollover` re-renders the route at the user's own local midnight,
 * so a tab left open overnight becomes tomorrow's page rather than yesterday's
 * — and on a DST transition it waits 23 or 25 hours, because
 * `nextLocalMidnight` resolves in the profile timezone (Domain Rule 4).
 *
 * Four mutations run through one optimistic overlay
 * (`useTodayMutations`). Claiming a quest deliberately does not: a claim is a
 * server recomputation from four source tables, and an optimistic "claimed"
 * would be the client asserting a reward (Domain Rule 6).
 */
export function TodayView({ data }: { data: TodayPageData }) {
  const announce = useAnnounce();
  const settings = useUserSettings();
  useMidnightRollover(data.timezone);

  const tick = useNow();
  // Null until the store has been subscribed to, which is the server render and
  // React's hydration pass. Falling back to the instant the server rendered at
  // keeps both sides identical and still correct to the minute.
  const now = tick ?? data.serverNow;

  const { state, pendingIds, mutate } = useTodayMutations(data);
  const [rescheduling, setRescheduling] = React.useState<TodayItem | null>(null);
  const [claimingId, setClaimingId] = React.useState<string | null>(null);
  const [, startClaim] = React.useTransition();

  const nextUp = selectNextUp(state, now);
  const risks = buildRisks(state);

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

  /**
   * Claiming a quest.
   *
   * Not optimistic, and not in the overlay: the client sends an assignment id
   * and the database recomputes the work from `tasks`, `focus_sessions`,
   * `habit_completions` and `calendar_blocks` before it writes anything. A
   * failure surfaces with the server's own message and a working Retry, which
   * is what Domain Rule 11 asks of a mutation without an overlay.
   *
   * "Failure" is a returned `{ ok: false }` *or* a rejected call — offline, a
   * 5xx, an action id gone stale after a deploy. Both take the same path, the
   * one `useOptimisticAction` takes for the four mutations beside this one:
   * without the catch, React re-throws the rejection out of the transition at
   * the next render and the route's error boundary replaces the whole page
   * over one failed press (Domain Rules §19, "a rejected action is a failed
   * action"). `unstable_rethrow` first, because `redirect()` and `notFound()`
   * travel as thrown values and are control flow, not failure.
   */
  const claim = React.useCallback(
    // Named, so the failure toast's Retry can call it again — the same shape
    // `useOptimisticAction`'s own `run` uses for the same reason.
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
            // A validation refusal cannot be retried into success; every other
            // failure can, because a claim is idempotent.
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
        {/* Below `md` the header's own text is visually hidden and the top bar
            shows the section name instead (docs/DESIGN_SYSTEM.md — one heading
            per page). The greeting and the date are content rather than chrome
            on this page, so they are repeated visually there and marked
            `aria-hidden`, because the `h1` above is still the accessible
            heading — the same arrangement `TopBar` uses for the same reason. */}
        <div aria-hidden="true" className="flex flex-col gap-0.5 md:hidden">
          <p className="text-lg font-semibold tracking-tight">
            {greeting(state.dayPart, state.displayName)}
          </p>
          <p className="text-xs text-muted-foreground">{longDate(state.today)}</p>
        </div>
        <DayProgress level={state.level} xpToday={state.xpToday} />
      </div>

      <AtRiskPanel risks={risks} />

      {/* Next Up first at every width. It is the answer the page exists to
          give, and on a phone between classes it is often the only one read. */}
      <NextUpPanel
        nextUp={nextUp}
        timezone={state.timezone}
        pendingIds={pendingIds}
        onCompleteBlock={completeBlock}
        onCompleteTask={(task, completed) => {
          mutate.setTaskCompleted(task, completed);
          announce(completed ? `${task.title} completed.` : `${task.title} reopened.`);
        }}
        onReschedule={setRescheduling}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <TodayTimeline
            entries={state.timeline}
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
