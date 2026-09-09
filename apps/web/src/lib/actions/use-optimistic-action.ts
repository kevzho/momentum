"use client";

import { unstable_rethrow } from "next/navigation";
import { useCallback, useOptimistic, useTransition } from "react";

import { toast } from "@momentum/ui/components/toast";

import { failure, type ActionError, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";

/**
 * The one optimistic mechanism in the product. The reducer runs inside
 * `startTransition`, so on failure React discards the optimistic value on its
 * own against unchanged props; there is no revert to write. On success the
 * action's `refresh()` re-renders the route and new `serverState` replaces the
 * overlay. A returned `{ ok: false }` and a rejected call take the same path.
 */
export interface UseOptimisticActionOptions<State, Input, Data> {
  /** The server's truth, straight from props. Never copied into state. */
  serverState: State;
  /** Reports failure by returning; a rejected call becomes an `unavailable` failure. */
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
   * True while *a* write is in flight, never which one; a per-row signal needs
   * to live beside it. Not safe as a native `disabled` on the control that
   * raised it: the browser blurs a disabled element and drops keyboard focus
   * on `<body>`.
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
    // Async on purpose: everything awaited stays part of the transition, which
    // keeps the optimistic value alive until the server answers.
    function run(input: Input) {
      startTransition(async () => {
        applyOptimistic(input);

        let result: ActionResult<Data>;
        try {
          result = await action(input);
        } catch (thrown) {
          // React re-throws a rejection out of the transition at the next
          // render, which would blank the route over one failed write.
          // `unstable_rethrow` first: `redirect()` and `notFound()` are thrown
          // control flow, not failure.
          unstable_rethrow(thrown);
          reportError(thrown, { source: "useOptimisticAction" });
          result = failure(
            "unavailable",
            "Momentum could not reach the server. Your change was not saved.",
          );
        }

        if (!result.ok) {
          // No Retry on a validation failure: the same input is refused again.
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
