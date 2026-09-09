import { act, render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/result";

/**
 * The rollback is the whole point of this hook, so it is what the tests are
 * about: a failed mutation must leave the UI showing the server's truth and the
 * user holding an error they can act on. Silent divergence between the two is a
 * P0 bug (Domain Rule 11), and "every feature writes its own revert" is the
 * improvisation this hook exists to prevent.
 */

const { errorToast, reportError } = vi.hoisted(() => ({
  errorToast: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: {
    error: errorToast,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/lib/report-error", () => ({ reportError }));

const { useOptimisticAction } = await import("@/lib/actions/use-optimistic-action");
const { ErrorBoundary } = await import("@/components/error-boundary");

/** A deferred promise, so a test can observe the UI while the write is in flight. */
function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (value: T) => settle(value) };
}

/** Server truth is the constant 0; the reducer adds. A revert is therefore "back to 0". */
function Counter({ action }: { action: (input: number) => Promise<ActionResult<number>> }) {
  const { state, run, pending } = useOptimisticAction({
    serverState: 0,
    action,
    optimistic: (total: number, input: number) => total + input,
  });

  return (
    <div>
      <output data-testid="total">{state}</output>
      <span data-testid="pending">{pending ? "pending" : "idle"}</span>
      <button type="button" onClick={() => run(1)}>
        Add one
      </button>
    </div>
  );
}

function total() {
  return screen.getByTestId("total").textContent;
}

async function clickAdd() {
  await act(async () => {
    screen.getByRole("button", { name: "Add one" }).click();
  });
}

describe("useOptimisticAction", () => {
  beforeEach(() => {
    errorToast.mockClear();
    reportError.mockClear();
  });

  it("applies the optimistic state immediately and reverts when the action fails", async () => {
    const inFlight = deferred<ActionResult<number>>();
    const action = vi.fn(() => inFlight.promise);

    render(<Counter action={action} />);
    expect(total()).toBe("0");

    await clickAdd();

    // The reducer runs before the await, so the UI moves on the gesture's own
    // frame rather than a round trip later.
    expect(total()).toBe("1");
    expect(screen.getByTestId("pending").textContent).toBe("pending");

    await act(async () => {
      inFlight.settle({
        ok: false,
        error: { code: "unavailable", message: "Momentum could not save that change." },
      });
      await inFlight.promise;
    });

    // Nothing reverted it: the transition settled against unchanged props and
    // React discarded the optimistic value on its own.
    expect(total()).toBe("0");
    expect(screen.getByTestId("pending").textContent).toBe("idle");
  });

  it("shows the server's own message with a retry that runs the action again", async () => {
    const action = vi.fn<(input: number) => Promise<ActionResult<number>>>().mockResolvedValue({
      ok: false,
      error: { code: "forbidden", message: "That is not yours to change." },
    });

    render(<Counter action={action} />);
    await clickAdd();

    expect(errorToast).toHaveBeenCalledTimes(1);
    const [message, options] = errorToast.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("That is not yours to change.");
    expect(options.action.label).toBe("Retry");

    await act(async () => {
      options.action.onClick();
    });

    // Retrying is safe for every calendar mutation because ids are
    // client-generated and the trusted functions are idempotent
    // (Domain Rule 17).
    expect(action).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenLastCalledWith(1);
  });

  it("offers no Retry for a validation failure, which the same input cannot pass", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      error: { code: "validation" as const, message: "An estimate is at most one week." },
    }));
    render(<Counter action={action} />);

    await act(async () => {
      screen.getByRole("button", { name: "Add one" }).click();
    });

    expect(errorToast).toHaveBeenCalledWith("An estimate is at most one week.", undefined);
    expect(screen.getByTestId("total").textContent).toBe("0");
  });

  it("reports the failure to onError and never to onSuccess", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();

    function Wired() {
      const { run } = useOptimisticAction({
        serverState: 0,
        action: () =>
          Promise.resolve<ActionResult<number>>({
            ok: false,
            error: { code: "validation", message: "A block has to end after it starts." },
          }),
        optimistic: (totalSoFar: number, input: number) => totalSoFar + input,
        onError,
        onSuccess,
      });
      return (
        <button type="button" onClick={() => run(1)}>
          Add one
        </button>
      );
    }

    render(<Wired />);
    await clickAdd();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      { code: "validation", message: "A block has to end after it starts." },
      1,
    );
  });

  it("hands the server's data to onSuccess and shows no toast", async () => {
    const onSuccess = vi.fn();
    const action = vi
      .fn<(input: number) => Promise<ActionResult<number>>>()
      .mockResolvedValue({ ok: true, data: 42 });

    function Wired() {
      const { run } = useOptimisticAction({
        serverState: 0,
        action,
        optimistic: (totalSoFar: number, input: number) => totalSoFar + input,
        onSuccess,
      });
      return (
        <button type="button" onClick={() => run(1)}>
          Add one
        </button>
      );
    }

    render(<Wired />);
    await clickAdd();

    expect(onSuccess).toHaveBeenCalledWith(42, 1);
    expect(errorToast).not.toHaveBeenCalled();
  });

  /*
   * The other half of "on !ok or throw" (docs/ARCHITECTURE.md §8). An action
   * reports expected failure by returning, but the call itself still rejects
   * when the device is offline, the response is a 5xx, the request is aborted
   * or the action id went stale in a deploy — and React re-throws a rejection
   * out of the transition at the next render, which would hand the route's
   * error boundary a whole blanked surface in place of one failed drag.
   */
  describe("when the call rejects instead of returning", () => {
    it("rolls back and toasts, the same as a returned failure", async () => {
      const onError = vi.fn();
      const action = vi
        .fn<(input: number) => Promise<ActionResult<number>>>()
        .mockRejectedValue(new TypeError("Failed to fetch"));

      function Wired() {
        const { state, run } = useOptimisticAction({
          serverState: 0,
          action,
          optimistic: (totalSoFar: number, input: number) => totalSoFar + input,
          onError,
        });
        return (
          <div>
            <output data-testid="total">{state}</output>
            <button type="button" onClick={() => run(1)}>
              Add one
            </button>
          </div>
        );
      }

      render(
        <ErrorBoundary section="Counter">
          <Wired />
        </ErrorBoundary>,
      );
      await clickAdd();

      // The surface is still there; the boundary never saw it.
      expect(screen.queryByRole("alert")).toBeNull();
      expect(total()).toBe("0");

      // The server's own `unavailable` wording, so there is one message for
      // "could not reach the server" whichever side noticed.
      expect(errorToast).toHaveBeenCalledTimes(1);
      const [message, options] = errorToast.mock.calls[0] as [
        string,
        { action: { label: string } },
      ];
      expect(message).toBe("Momentum could not reach the server. Your change was not saved.");
      expect(options.action.label).toBe("Retry");

      // Feature cleanup runs, so pending marks are released rather than left
      // on rows with no write behind them (Domain Rule 11).
      expect(onError).toHaveBeenCalledWith(
        {
          code: "unavailable",
          message: "Momentum could not reach the server. Your change was not saved.",
        },
        1,
      );

      // Swallowed for the user, not for us: a bug in the action is still
      // reported even though it no longer blanks the route.
      expect(reportError).toHaveBeenCalledTimes(1);
    });

    it("lets a redirect through, because that is control flow and not failure", async () => {
      // `redirect()` travels as a thrown value. Turning it into a toast would
      // strand the user on the page they were being moved off, so
      // `unstable_rethrow` re-throws it and the boundary above takes it.
      const action = vi
        .fn<(input: number) => Promise<ActionResult<number>>>()
        .mockImplementation(() => redirect("/login"));

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary section="Counter">
          <Counter action={action} />
        </ErrorBoundary>,
      );
      await clickAdd();

      consoleError.mockRestore();

      expect(screen.getByRole("alert").textContent).toContain("Counter could not be loaded");
      expect(errorToast).not.toHaveBeenCalled();
    });
  });
});
