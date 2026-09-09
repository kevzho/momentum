"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";

import type { Minutes, Uuid } from "@momentum/core/types";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { toast } from "@momentum/ui/components/toast";

import { FOCUS_COPY } from "@/features/focus/copy";
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
import { reportError } from "@/lib/report-error";

/**
 * The focus page.
 *
 * One client island over server-resolved data: it fetches nothing and does no
 * date arithmetic of its own. The timer is the exception that proves the rule —
 * it *is* date arithmetic, and it lives in `@momentum/core/focus` where it is
 * tested, with this component doing nothing but drawing what that returns
 * (Domain Rule 5).
 *
 * **There is no optimistic overlay here, deliberately.** Every other mutating
 * surface in the product has one, because every other surface is moving rows
 * the user is looking at. A focus session's state is a *measurement* whose
 * timestamps only the database can produce: an optimistic "started at" would be
 * the client's clock, which is precisely the number this phase exists to stop
 * trusting. So each control waits for the server's row, and the page's own
 * `refresh()` brings it back. The wait is one request, and what it buys is that
 * the timer on screen is never counting from a time the database did not
 * record.
 *
 * Failures surface as a toast with the server's own message, and the surface is
 * left exactly as it was (Domain Rule 11). A call that never returns — offline,
 * aborted, a 5xx — is a failure too, and takes the same path: without the
 * catch below React re-throws the rejection out of the transition and the
 * route's error boundary replaces the whole page over one lost request
 * (docs/DOMAIN_RULES.md §19, "a rejected action is a failed action").
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
  });

  /**
   * One place where a lifecycle call is made, so failure is handled once.
   *
   * Retry is offered for all of them because all of them are idempotent: a
   * start carries its own id, and the rest converge on the state they name
   * (Domain Rule 17).
   */
  const run = React.useCallback(
    // Named, so the retry in the failure toast can call it again — the same
    // shape `useOptimisticAction` uses, and for the same reason.
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
          // `redirect()` and `notFound()` travel as thrown values and must
          // still propagate; everything else is a transport failure or a bug
          // in the action, reported but not allowed to blank the route — the
          // same shape `useOptimisticAction` uses.
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
        // The id is minted here, once, for this session. A retry from the
        // failure toast sends the same one, which is the whole of what makes a
        // lost response safe (Domain Rule 17).
        { id: crypto.randomUUID(), plannedMinutes, taskId, projectId: null },
        `Focus session started, ${plannedMinutes} minutes`,
      );
    },
    [run],
  );

  const live = data.live;
  const sessionId = live?.session.id;

  /*
   * Focus handoff (Domain Rule 10). Starting a session replaces the setup panel
   * with the timer, so the button the user pressed unmounts and the browser
   * drops focus on `<body>` — the same defect the Phase 5 audit found at four
   * other sites. Focus moves to the timer's primary control on the *transition*
   * into a live session, and only then: a page loaded with a session already
   * running must not steal focus from wherever the user put it, and neither
   * must a re-render caused by pausing. Finishing or ending is the same
   * transition in reverse — the timer's controls unmount and the setup panel
   * returns — so focus moves to Start on the way out, and only then.
   */
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
