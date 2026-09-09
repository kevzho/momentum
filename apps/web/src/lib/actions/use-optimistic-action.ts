"use client";

import { unstable_rethrow } from "next/navigation";
import { useCallback, useOptimistic, useTransition } from "react";

import { toast } from "@momentum/ui/components/toast";

import { failure, type ActionError, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";

/**
 * The one optimistic mechanism in the product (docs/ARCHITECTURE.md §8).
 *
 *   apply      the reducer runs inside `startTransition`, so React holds the
 *              optimistic value only for as long as the transition
 *   persist    the action runs with the same input
 *   reconcile  on success, `refresh()` inside the action re-renders the route;
 *              the new `serverState` arrives as props and replaces the overlay
 *   roll back  on failure the transition settles against *unchanged* props, so
 *              React discards the optimistic value on its own — there is no
 *              revert to write, and therefore none to get wrong. "Failure" is
 *              a returned `{ ok: false }` *or* a rejected call; both take the
 *              same path (docs/ARCHITECTURE.md §8, "on !ok or throw")
 *
 * That last point is the whole reason this exists as one hook. A per-feature
 * `useState` plus a manual revert is the improvisation Domain Rule 11 forbids:
 * every place that writes its own revert is a place the UI and the database can
 * silently disagree, which is a P0 bug.
 *
 * ```ts
 * const { state, run, pending } = useOptimisticAction({
 *   serverState: items,                                  // props from the server
 *   action: rescheduleBlock,                             // returns an ActionResult
 *   optimistic: (items, input) => moveItem(items, input) // pure
 * });
 * ```
 */
export interface UseOptimisticActionOptions<State, Input, Data> {
  /** The server's truth, straight from props. Never copied into state. */
  serverState: State;
  /**
   * A server action. It reports failure by returning, never by throwing — but
   * the *call* can still reject before the action has an answer to return, and
   * the hook turns that into the same `unavailable` failure.
   */
  action: (input: Input) => Promise<ActionResult<Data>>;
  /** Pure: what the UI should look like while the write is in flight. */
  optimistic: (state: State, input: Input) => State;
  /** Feature-specific cleanup. The toast is shown either way. */
  onError?: (error: ActionError, input: Input) => void;
  onSuccess?: (data: Data, input: Input) => void;
}

export interface OptimisticAction<State, Input> {
  /** The optimistic view while a write is in flight, the server's props otherwise. */
  state: State;
  run: (input: Input) => void;
  /**
   * True while this hook's transition is in flight.
   *
   * It says *a* write is in flight, never which one: `useTaskMutations` runs
   * thirteen mutations through a single hook, so every control this flag reaches
   * reads as busy whichever of them started it. Use it for a coarse busy
   * affordance; a control that has to know whether its own row is writing needs
   * a per-row signal beside it (`pendingIds` in `use-task-mutations.ts`). It is
   * not safe as a native `disabled` on the control that raised it either — the
   * browser blurs an element the moment it is disabled, so the button would
   * drop a keyboard user on `<body>` by working (Domain Rule 10; see the
   * reorder arrows in `subtask-list.tsx`).
   */
  pending: boolean;
}

export function useOptimisticAction<State, Input, Data>({
  serverState,
  action,
  optimistic,
  onError,
  onSuccess,
}: UseOptimisticActionOptions<State, Input, Data>): OptimisticAction<State, Input> {
  const [state, applyOptimistic] = useOptimistic(serverState, optimistic);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    /*
     * Named so the retry can call it again. `startTransition` is given an async
     * function on purpose: everything awaited inside stays part of the
     * transition, which is what keeps the optimistic value alive until the
     * server has answered and — on failure — is what discards it.
     *
     * `applyOptimistic` is the first statement, before the await, so the UI
     * moves on the same frame as the gesture rather than a round trip later.
     */
    function run(input: Input) {
      startTransition(async () => {
        applyOptimistic(input);

        let result: ActionResult<Data>;
        try {
          result = await action(input);
        } catch (thrown) {
          /*
           * A rejected call is not the same event as a returned `{ ok: false }`,
           * but the user has to experience it as one. Offline, a 5xx, an
           * aborted request, an action id gone stale after a deploy: all of
           * them reject here, and React re-throws a rejection out of the
           * transition at the next render, so the route's error boundary would
           * replace the whole surface over one failed drag — the opposite of
           * what Domain Rule 11 asks for, and what `describe()` in
           * features/calendar/actions.ts already refuses to do on the server.
           *
           * `unstable_rethrow` first, because `redirect()` and `notFound()`
           * travel as thrown values: those are control flow, not failure, and
           * swallowing one would strand the user on a page they were being
           * moved off. What is left is a transport failure or a bug inside the
           * action — the bug is still reported, it just no longer gets to blank
           * the route on its way to being seen.
           */
          unstable_rethrow(thrown);
          reportError(thrown, { source: "useOptimisticAction" });
          result = failure(
            "unavailable",
            "Momentum could not reach the server. Your change was not saved.",
          );
        }

        if (!result.ok) {
          // The server's own message, verbatim: it knows what went wrong, and a
          // paraphrase here would be a second place to keep in step — which is
          // why the unreachable case above reuses the server's own `unavailable`
          // wording rather than inventing a second one. Retry is offered for
          // everything except a validation failure: every one of these
          // mutations is idempotent under a client-generated id (Domain Rule
          // 17), but the same input refused once is refused again, and a Retry
          // on it is a button that can only fail.
          toast.error(
            result.error.message,
            result.error.code === "validation"
              ? undefined
              : { action: { label: "Retry", onClick: () => run(input) } },
          );
          onError?.(result.error, input);
          return;
        }

        onSuccess?.(result.data, input);
      });
    },
    [action, applyOptimistic, onError, onSuccess, startTransition],
  );

  return { state, run, pending };
}
