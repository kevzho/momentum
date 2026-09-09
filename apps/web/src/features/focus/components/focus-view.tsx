"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";

import type { Minutes, Uuid } from "@momentum/core/types";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { toast } from "@momentum/ui/components/toast";

import { FOCUS_COPY, describePreset } from "@/features/focus/copy";
import { FocusHistoryPanel } from "@/features/focus/components/focus-history-panel";
import { FocusTimerPanel } from "@/features/focus/components/focus-timer-panel";
import { SessionSetup } from "@/features/focus/components/session-setup";
import {
  endFocusSession,
  finishFocusSession,
  markFocusInterruption,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
} from "@/features/focus/actions";
import type { FocusPageData } from "@/features/focus/types";
import { useFocusTimer } from "@/features/focus/use-focus-timer";
import { failure, type ActionResult } from "@/lib/actions/result";
import { notifyFocusEnded } from "@/lib/notifications/focus-notification";
import { reportError } from "@/lib/report-error";

/**
 * The focus page island. Deliberately no optimistic overlay: a session's
 * timestamps are the database's measurement, and an optimistic "started at"
 * would be the client clock. Each control waits for the server's row.
 */

export function FocusView({ data }: { data: FocusPageData }) {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();

  const { state } = useFocusTimer({
    session:
      data.live === null
        ? null
        : {
            plannedMinutes: data.live.session.plannedMinutes,
            startedAt: data.live.session.startedAt,
            endedAt: data.live.session.endedAt,
            status: data.live.session.status,
            pauses: data.live.pauses,
          },
    serverNow: data.serverNow,
    onPlannedTimeElapsed: () => {
      // Only a hidden page needs the browser notification; a visible one shows the crossing.
      if (data.live === null || document.visibilityState === "visible") return;
      notifyFocusEnded(
        data.live.task?.title ?? describePreset(data.live.session.plannedMinutes, null),
      );
    },
  });

  // Retry is offered for every call because all are idempotent. Named so the
  // failure toast's retry can call it again.
  const run = React.useCallback(
    function run(
      action: (input: unknown) => Promise<ActionResult<unknown>>,
      input: unknown,
      announcement: string,
    ) {
      startTransition(async () => {
        let result: ActionResult<unknown>;
        try {
          result = await action(input);
        } catch (thrown) {
          // `redirect()` and `notFound()` travel as thrown values and must propagate;
          // anything else is reported and surfaced as a failure rather than blanking the route.
          unstable_rethrow(thrown);
          reportError(thrown, { source: "focus-view" });
          result = failure(
            "unavailable",
            "Momentum could not reach the server. Your change was not saved.",
          );
        }
        if (!result.ok) {
          toast.error(result.error.message, {
            action: { label: "Retry", onClick: () => run(action, input, announcement) },
          });
          return;
        }
        announce(announcement);
      });
    },
    [announce],
  );

  const onStart = React.useCallback(
    ({ plannedMinutes, taskId }: { plannedMinutes: Minutes; taskId: Uuid | null }) => {
      run(
        startFocusSession,
        // Minted once per session, so a retry from the failure toast sends the same id.
        { id: crypto.randomUUID(), plannedMinutes, taskId, projectId: null },
        `Focus session started, ${plannedMinutes} minutes`,
      );
    },
    [run],
  );

  const live = data.live;
  const sessionId = live?.session.id;

  // Focus hand-off: the pressed button unmounts on the transition into or out of
  // a live session, so focus moves to the timer's primary control or to Start on
  // that transition only. A page loaded mid-session, or a pause re-render, must
  // not steal focus.
  const primaryControlRef = React.useRef<HTMLButtonElement | null>(null);
  const startControlRef = React.useRef<HTMLButtonElement | null>(null);
  const previousSessionId = React.useRef<string | undefined>(sessionId);

  React.useEffect(() => {
    const appeared = previousSessionId.current === undefined && sessionId !== undefined;
    const ended = previousSessionId.current !== undefined && sessionId === undefined;
    previousSessionId.current = sessionId;
    if (appeared) primaryControlRef.current?.focus();
    if (ended) startControlRef.current?.focus();
  }, [sessionId]);

  return (
    <PageContainer>
      <PageHeader title={FOCUS_COPY.title} description={FOCUS_COPY.description} />

      <div className="grid gap-8 lg:grid-cols-2">
        {live !== null && state !== null ? (
          <FocusTimerPanel
            live={live}
            state={state}
            pending={pending}
            primaryControlRef={primaryControlRef}
            onPause={() => run(pauseFocusSession, { id: live.session.id }, FOCUS_COPY.paused)}
            onResume={() => run(resumeFocusSession, { id: live.session.id }, FOCUS_COPY.running)}
            onFinish={() =>
              run(finishFocusSession, { id: live.session.id }, "Focus session finished")
            }
            onEnd={() => run(endFocusSession, { id: live.session.id }, "Focus session ended")}
            onMarkInterruption={() =>
              run(markFocusInterruption, { id: live.session.id }, "Interruption marked")
            }
          />
        ) : (
          <section
            aria-label={FOCUS_COPY.timerRegionLabel}
            className="flex flex-col items-center gap-5"
          >
            <SessionSetup
              key={sessionId ?? "idle"}
              tasks={data.tasks}
              initialTaskId={data.requestedTaskId}
              initialMinutes={data.requestedMinutes}
              pending={pending}
              startControlRef={startControlRef}
              onStart={onStart}
            />
          </section>
        )}

        <FocusHistoryPanel data={data} />
      </div>
    </PageContainer>
  );
}
