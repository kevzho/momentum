import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { summariseFocus } from "@momentum/core/focus";
import { addDays, ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { FocusSession, FocusSessionStatus, LocalDate } from "@momentum/core/types";

import { ErrorBoundary } from "@/components/error-boundary";
import { FOCUS_COPY } from "@/features/focus/copy";
import type { FocusPageData, FocusTaskOption } from "@/features/focus/types";
import type { ActionResult } from "@/lib/actions/result";

/**
 * The focus page, from the island down.
 *
 * What is worth asserting here — and cannot be asserted anywhere else — is the
 * *contract with the server*: what the client sends when a user presses each
 * control. Domain Rules 6 and 15 say the client may send an id and a length and
 * nothing else, and this is the only place that claim is checked against the
 * code that actually runs.
 *
 * The countdown maths is `packages/core/src/focus/timer.test.ts`; the loop that
 * calls it is `use-focus-timer.test.tsx`.
 */

/**
 * The six actions, stubbed with the real signature — one `unknown` argument in,
 * an `ActionResult` out — so the assertions below are about what the component
 * actually sends, not about a convenience shape invented here.
 */
type FocusAction = (input: unknown) => Promise<ActionResult<null>>;

const actions = vi.hoisted(() => {
  const ok: (input: unknown) => Promise<ActionResult<null>> = () =>
    Promise.resolve({ ok: true, data: null });

  return {
    startFocusSession: vi.fn<FocusAction>(ok),
    pauseFocusSession: vi.fn<FocusAction>(ok),
    resumeFocusSession: vi.fn<FocusAction>(ok),
    finishFocusSession: vi.fn<FocusAction>(ok),
    endFocusSession: vi.fn<FocusAction>(ok),
    markFocusInterruption: vi.fn<FocusAction>(ok),
  };
});

vi.mock("@momentum/ui/components/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { toast } = await import("@momentum/ui/components/toast");

vi.mock("@/features/focus/actions", () => actions);

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
const { reportError } = await import("@/lib/report-error");

const { FocusView } = await import("@/features/focus/components/focus-view");

const TIMEZONE = ianaTimeZone("America/New_York");
const TODAY = localDate("2026-09-07");
const WEEK: LocalDate[] = Array.from({ length: 7 }, (_, index) => addDays(TODAY, index));
const SERVER_NOW = instant("2026-09-07T14:00:00.000Z");

const TASK: FocusTaskOption = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "History essay",
  priority: 1,
  estimatedMinutes: 135,
  actualMinutes: 45,
  projectId: null,
  projectName: null,
  projectColor: null,
};

function sessionOf(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "user-1",
    taskId: TASK.id,
    projectId: null,
    plannedMinutes: 25,
    actualMinutes: null,
    startedAt: instant("2026-09-07T13:50:00.000Z"),
    endedAt: null,
    status: "running",
    interruptionCount: 0,
    createdAt: instant("2026-09-07T13:50:00.000Z"),
    ...overrides,
  };
}

function pageOf(overrides: Partial<FocusPageData> = {}): FocusPageData {
  const sessions: FocusSession[] = [];
  return {
    serverNow: SERVER_NOW,
    timezone: TIMEZONE,
    today: TODAY,
    week: WEEK,
    live: null,
    history: summariseFocus({ sessions, timezone: TIMEZONE, today: TODAY, week: WEEK }),
    recent: [],
    projects: [],
    tasks: [TASK],
    requestedTaskId: null,
    requestedMinutes: null,
    focusXpInCapWindow: 0,
    ...overrides,
  };
}

function liveOf(status: FocusSessionStatus = "running", overrides: Partial<FocusSession> = {}) {
  return {
    session: sessionOf({ status, ...overrides }),
    pauses: [],
    task: TASK,
  };
}

/** Narrows a captured argument without asserting a shape onto it. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the resting focus screen", () => {
  it("offers all three presets and a custom length", () => {
    render(<FocusView data={pageOf()} />);

    expect(screen.getByRole("radio", { name: "25 minutes, 5 minute break" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "50 minutes, 10 minute break" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "90 minutes, 20 minute break" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: FOCUS_COPY.custom })).toBeTruthy();
  });

  it("starts a session with the chosen preset and task, and no time and no amount", async () => {
    render(<FocusView data={pageOf({ requestedTaskId: TASK.id })} />);

    fireEvent.click(screen.getByRole("radio", { name: "50 minutes, 10 minute break" }));
    fireEvent.click(screen.getByRole("button", { name: "Start 50 minutes" }));

    await waitFor(() => expect(actions.startFocusSession).toHaveBeenCalledTimes(1));

    const [input] = actions.startFocusSession.mock.calls[0] ?? [];
    expect(isRecord(input)).toBe(true);
    if (!isRecord(input)) return;
    expect(input.plannedMinutes).toBe(50);
    expect(input.taskId).toBe(TASK.id);
    // Domain Rule 17: a client-generated id, so a retry is idempotent.
    expect(input.id).toMatch(/^[0-9a-f-]{36}$/);
    // Domain Rules 6 and 15: no timestamp, and no XP amount.
    expect(Object.keys(input).sort()).toEqual(["id", "plannedMinutes", "projectId", "taskId"]);
  });

  it("starts a custom length", async () => {
    render(<FocusView data={pageOf()} />);

    fireEvent.click(screen.getByRole("radio", { name: FOCUS_COPY.custom }));
    const field = screen.getByLabelText(FOCUS_COPY.customLabel);
    // Focus first: the field shows the committed value until it is being
    // edited, so a change without a focus is re-rendered away.
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "45m" } });
    fireEvent.blur(field);

    fireEvent.click(screen.getByRole("button", { name: "Start 45 minutes" }));

    await waitFor(() => expect(actions.startFocusSession).toHaveBeenCalledTimes(1));
    const [input] = actions.startFocusSession.mock.calls[0] ?? [];
    expect(isRecord(input) && input.plannedMinutes).toBe(45);
  });

  it("opens on the length a calendar block asked for", () => {
    render(<FocusView data={pageOf({ requestedMinutes: 45, requestedTaskId: TASK.id })} />);

    expect(screen.getByRole("button", { name: "Start 45 minutes" })).toBeTruthy();
  });

  it("starts a session with no task at all", async () => {
    render(<FocusView data={pageOf()} />);

    fireEvent.click(screen.getByRole("button", { name: "Start 25 minutes" }));

    await waitFor(() => expect(actions.startFocusSession).toHaveBeenCalledTimes(1));
    const [input] = actions.startFocusSession.mock.calls[0] ?? [];
    expect(isRecord(input) ? input.taskId : undefined).toBeNull();
  });

  it("promises a length only while it has one", () => {
    render(<FocusView data={pageOf()} />);

    fireEvent.click(screen.getByRole("radio", { name: FOCUS_COPY.custom }));
    const field = screen.getByLabelText(FOCUS_COPY.customLabel);
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);

    // Not "Start 0 minutes": the button is refusing, and says so plainly.
    const start = screen.getByRole("button", { name: FOCUS_COPY.start });
    expect(start.getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("button", { name: /Start 0 minutes/ })).toBeNull();
  });

  it("shows the failure and leaves the screen as it was", async () => {
    actions.startFocusSession.mockResolvedValueOnce({
      ok: false,
      error: { code: "conflict", message: "A focus session is already running." },
    });

    render(<FocusView data={pageOf()} />);
    fireEvent.click(screen.getByRole("button", { name: "Start 25 minutes" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toBe("A focus session is already running.");
    expect(screen.getByRole("button", { name: "Start 25 minutes" })).toBeTruthy();
  });

  /*
   * The other half of "on !ok or throw" (docs/DOMAIN_RULES.md §19): a call that
   * rejects — offline, aborted, a 5xx — must reach the same toast, not the
   * route's error boundary.
   */
  it("treats a rejected call as a failed one, with the same toast and a Retry", async () => {
    actions.startFocusSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    actions.pauseFocusSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { unmount } = render(
      <ErrorBoundary section="Focus">
        <FocusView data={pageOf()} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start 25 minutes" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    const [message, options] = vi.mocked(toast.error).mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("Momentum could not reach the server. Your change was not saved.");
    expect(options.action.label).toBe("Retry");
    // The surface is still there; the boundary never saw it; the bug is reported.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Start 25 minutes" })).toBeTruthy();
    expect(reportError).toHaveBeenCalledTimes(1);

    // Retry sends the same session id (Domain Rule 17).
    options.action.onClick();
    await waitFor(() => expect(actions.startFocusSession).toHaveBeenCalledTimes(2));
    const [first, second] = actions.startFocusSession.mock.calls.map(([input]) => input);
    expect(isRecord(first) && isRecord(second) && first.id === second.id).toBe(true);

    unmount();

    // And the live session's own controls, which used to blank the page mid-session.
    render(
      <ErrorBoundary section="Focus">
        <FocusView data={pageOf({ live: liveOf() })} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: FOCUS_COPY.pause }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: FOCUS_COPY.pause })).toBeTruthy();
  });
});

describe("the running focus screen", () => {
  it("shows the task, the remaining time and the three controls", () => {
    render(<FocusView data={pageOf({ live: liveOf() })} />);

    expect(screen.getByText(TASK.title)).toBeTruthy();
    // Ten minutes in, fifteen left of twenty-five.
    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toBe(
      "15m left of 25 minutes",
    );
    expect(screen.getByRole("button", { name: FOCUS_COPY.pause })).toBeTruthy();
    expect(screen.getByRole("button", { name: FOCUS_COPY.finish })).toBeTruthy();
    expect(screen.getByRole("button", { name: FOCUS_COPY.end })).toBeTruthy();
  });

  it("offers Resume, not Pause, while paused", () => {
    render(
      <FocusView
        data={pageOf({
          live: {
            session: sessionOf({ status: "paused" }),
            pauses: [
              {
                id: "p1",
                sessionId: "s1",
                pausedAt: instant("2026-09-07T13:55:00.000Z"),
                resumedAt: null,
              },
            ],
            task: TASK,
          },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: FOCUS_COPY.resume })).toBeTruthy();
    expect(screen.queryByRole("button", { name: FOCUS_COPY.pause })).toBeNull();
    expect(screen.getByText(FOCUS_COPY.pausedHint)).toBeTruthy();
  });

  it("sends nothing but the session id to pause, finish and end", async () => {
    render(<FocusView data={pageOf({ live: liveOf() })} />);

    // One at a time: a control refuses while a write is in flight, which is the
    // subject of its own test below.
    for (const [name, action] of [
      [FOCUS_COPY.pause, actions.pauseFocusSession],
      [FOCUS_COPY.finish, actions.finishFocusSession],
      [FOCUS_COPY.end, actions.endFocusSession],
    ] as const) {
      const control = screen.getByRole("button", { name });
      fireEvent.click(control);
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(control.getAttribute("aria-disabled")).toBe("false"));

      // The whole payload: an id. No timestamp (Domain Rule 15) and no amount
      // (Domain Rule 6).
      expect(action.mock.calls[0]?.[0]).toEqual({ id: sessionOf().id });
    }
  });

  it("marks an interruption only when asked, and says it costs nothing", async () => {
    render(<FocusView data={pageOf({ live: liveOf() })} />);

    expect(actions.markFocusInterruption).not.toHaveBeenCalled();
    expect(screen.getByText(FOCUS_COPY.interruptionHint)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(FOCUS_COPY.markInterruption) }));
    await waitFor(() => expect(actions.markFocusInterruption).toHaveBeenCalledTimes(1));
  });

  it("keeps counting past the planned length rather than stopping at the bell", () => {
    render(
      <FocusView
        data={pageOf({
          live: liveOf("running", { startedAt: instant("2026-09-07T13:20:00.000Z") }),
        })}
      />,
    );

    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toBe(
      "Past the planned 25 minutes by 15m",
    );
  });

  it("does not offer the setup panel while a session is live", () => {
    render(<FocusView data={pageOf({ live: liveOf() })} />);

    expect(screen.queryByRole("button", { name: /^Start \d+ minutes$/ })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Domain Rule 10 — no control drops focus by working                          */
/* -------------------------------------------------------------------------- */

/**
 * jsdom does not implement the browser's blur-on-disable, so
 * `document.activeElement` cannot discriminate here — the same limitation the
 * Phase 5 audit recorded. These tests pin the *mechanism* instead: the native
 * attribute is absent, `aria-disabled` carries the state, and the handler
 * refuses while a write is in flight, which is what makes that attribute
 * truthful rather than decorative.
 */
describe("the focus controls keep the keyboard", () => {
  it("never natively disables the button that causes the transition", () => {
    render(<FocusView data={pageOf()} />);

    const start = screen.getByRole("button", { name: "Start 25 minutes" });
    expect(start.hasAttribute("disabled")).toBe(false);
  });

  it("refuses a second press while the first is still in flight", async () => {
    let release: (result: ActionResult<null>) => void = () => {};
    actions.startFocusSession.mockImplementationOnce(
      () => new Promise<ActionResult<null>>((resolve) => (release = resolve)),
    );

    render(<FocusView data={pageOf()} />);
    const start = screen.getByRole("button", { name: "Start 25 minutes" });

    fireEvent.click(start);
    await waitFor(() => expect(start.getAttribute("aria-disabled")).toBe("true"));

    fireEvent.click(start);
    fireEvent.click(start);
    expect(actions.startFocusSession).toHaveBeenCalledTimes(1);

    release({ ok: true, data: null });
    await waitFor(() => expect(start.getAttribute("aria-disabled")).toBe("false"));
  });

  it("does the same for the live session's own controls", async () => {
    let release: (result: ActionResult<null>) => void = () => {};
    actions.pauseFocusSession.mockImplementationOnce(
      () => new Promise<ActionResult<null>>((resolve) => (release = resolve)),
    );

    render(<FocusView data={pageOf({ live: liveOf() })} />);
    const pause = screen.getByRole("button", { name: FOCUS_COPY.pause });
    const finish = screen.getByRole("button", { name: FOCUS_COPY.finish });

    expect(pause.hasAttribute("disabled")).toBe(false);

    fireEvent.click(pause);
    await waitFor(() => expect(pause.getAttribute("aria-disabled")).toBe("true"));

    fireEvent.click(pause);
    fireEvent.click(finish);
    expect(actions.pauseFocusSession).toHaveBeenCalledTimes(1);
    expect(actions.finishFocusSession).not.toHaveBeenCalled();

    release({ ok: true, data: null });
    await waitFor(() => expect(pause.getAttribute("aria-disabled")).toBe("false"));
  });

  it("moves focus to the timer when a session appears, and not on a reload", () => {
    const { rerender, unmount } = render(<FocusView data={pageOf()} />);

    rerender(<FocusView data={pageOf({ live: liveOf() })} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: FOCUS_COPY.pause }));

    // Finishing or ending unmounts the control that was pressed; focus moves
    // to Start rather than to <body>.
    rerender(<FocusView data={pageOf()} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Start 25 minutes" }));

    unmount();

    // A page that loads with a session already running leaves focus alone.
    render(<FocusView data={pageOf({ live: liveOf() })} />);
    expect(document.activeElement).toBe(document.body);
  });
});
