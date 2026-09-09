import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { localDate } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

/**
 * The Today page, end to end from the island down.
 *
 * The clock is the thing under test as much as the markup: `useNow` is replaced
 * by a value this file sets, so "what is next at 10:30" and "what is next at
 * 18:00" are two renders of the same page rather than two fixtures. The `null`
 * case is the server render and React's hydration pass, where the page falls
 * back to the instant the server rendered at.
 *
 * Every server action is mocked at the module boundary, so what is asserted is
 * the contract the page has with the server — an id, a boolean, and at most a
 * wall-clock span. Never an XP amount, never a timestamp (Domain Rules 6, 15).
 */

const clock = vi.hoisted(() => ({ now: null as Instant | null }));

const actions = vi.hoisted(() => ({
  setBlockCompletion: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
  setTaskCompletion: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
  setHabitCompletion: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
  rescheduleBlock: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
  rescheduleOccurrence: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
  claimQuest: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
}));

vi.mock("@/lib/time/use-now", () => ({ useNow: () => clock.now }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: () => {},
}));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("@/features/calendar/actions", () => ({
  setBlockCompletion: actions.setBlockCompletion,
  rescheduleBlock: actions.rescheduleBlock,
  rescheduleOccurrence: actions.rescheduleOccurrence,
}));

vi.mock("@/features/tasks/actions", () => ({ setTaskCompletion: actions.setTaskCompletion }));
vi.mock("@/features/habits/actions", () => ({ setHabitCompletion: actions.setHabitCompletion }));
vi.mock("@/features/gamification/actions", () => ({ claimQuest: actions.claimQuest }));

const { toast } = await import("@momentum/ui/components/toast");
const { TodayView } = await import("@/features/today/components/today-view");
const { ErrorBoundary } = await import("@/components/error-boundary");
const { AnnouncerProvider } = await import("@momentum/ui/components/announcer");
const { UserSettingsProvider } = await import("@/lib/time/user-settings");
const {
  TODAY,
  TZ,
  at,
  completion,
  eventItem,
  habit,
  habitItem,
  timelineOf,
  todayHabit,
  todayPage,
  todayTask,
  workItem,
} = await import("@/features/today/fixtures");
const { habitDay } = await import("@momentum/core/habits");
const { TODAY_COPY } = await import("@/features/today/copy");

type PageData = Parameters<typeof TodayView>[0]["data"];

/** The Next Up surface, by the slot the component labels it with. */
function nextUpPanel(): HTMLElement {
  const panel = document.querySelector<HTMLElement>("[data-slot=next-up]");
  if (panel === null) throw new Error("Next Up is always rendered.");
  return panel;
}

function renderPage(data: PageData) {
  return render(
    <AnnouncerProvider>
      <UserSettingsProvider settings={{ timezone: TZ, weekStart: 1, snapMinutes: 15 }}>
        <TodayView data={data} />
      </UserSettingsProvider>
    </AnnouncerProvider>,
  );
}

const MORNING = workItem({
  id: "morning",
  taskId: "task-morning",
  title: "Analyse benchmarks",
  startAt: at("2026-09-08", 9),
  endAt: at("2026-09-08", 10),
});
const LECTURE = eventItem({
  id: "lecture",
  title: "Chemistry lecture",
  startAt: at("2026-09-08", 11),
  endAt: at("2026-09-08", 12),
});
const PIANO = habitItem({
  id: "piano",
  title: "Piano",
  startAt: at("2026-09-08", 17),
  endAt: at("2026-09-08", 17, 30),
});

function fullDay(overrides: Partial<PageData> = {}): PageData {
  return todayPage({
    timeline: timelineOf([LECTURE, MORNING, PIANO], { name: "Research", color: "amber" }),
    ...overrides,
  });
}

beforeEach(() => {
  clock.now = null;
  for (const action of Object.values(actions)) action.mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("the header", () => {
  it("greets by name and states the date, with exactly one h1", () => {
    renderPage(todayPage());

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Good morning, Kevin");
    expect(screen.getAllByText("Tuesday, September 8, 2026").length).toBeGreaterThan(0);
  });

  it("shows the level and the day's XP, and never asserts an amount", () => {
    renderPage(todayPage({ xpToday: 40 }));

    expect(screen.getByText("+40 XP today")).toBeDefined();
    expect(screen.getByRole("progressbar", { name: /^Level/ })).toBeDefined();
  });
});

describe("the timeline", () => {
  it("lists events, work blocks and habit blocks in chronological order", () => {
    renderPage(fullDay());

    const rows = screen
      .getAllByRole("listitem")
      .filter((row) => row.dataset.slot === "timeline-row");
    expect(rows.map((row) => row.querySelector("[data-slot=numeric]")?.textContent)).toEqual([
      "09:00",
      "11:00",
      "17:00",
    ]);
    expect(rows[1]?.textContent).toContain("Chemistry lecture");
    expect(rows[2]?.textContent).toContain("Piano");
  });

  it("distinguishes past, current and future, in the markup and in words", () => {
    clock.now = at("2026-09-08", 11, 30);
    renderPage(fullDay());

    const rows = screen
      .getAllByRole("listitem")
      .filter((row) => row.dataset.slot === "timeline-row");
    expect(rows.map((row) => row.dataset.state)).toEqual(["past", "current", "future"]);
    // Not colour alone: each state carries a word.
    expect(rows[0]?.textContent).toContain("Earlier");
    expect(rows[1]?.textContent).toContain("Now");
    expect(rows[2]?.textContent).toContain("Later");
  });

  it("offers a completion control on work and habit blocks, and not on events", () => {
    renderPage(fullDay());

    expect(screen.getByRole("checkbox", { name: "Complete task" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Mark habit done" })).toBeDefined();
    expect(screen.queryByRole("checkbox", { name: /Chemistry/ })).toBeNull();
  });

  it("completes a block optimistically and sends only ids and booleans", async () => {
    renderPage(fullDay());

    fireEvent.click(screen.getByRole("checkbox", { name: "Complete task" }));

    await waitFor(() => {
      expect(actions.setBlockCompletion).toHaveBeenCalledWith({
        id: "morning",
        completed: true,
        alsoCompleteTask: true,
        alsoUncompleteTask: false,
        habitId: null,
      });
    });
  });

  it("routes a habit block to the habit path, which records the day too", async () => {
    renderPage(fullDay());

    fireEvent.click(screen.getByRole("checkbox", { name: "Mark habit done" }));

    await waitFor(() => {
      expect(actions.setBlockCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ id: "piano", habitId: "habit-1", completed: true }),
      );
    });
  });

  it("rolls back a failed completion and surfaces the failure (Domain Rule 11)", async () => {
    actions.setBlockCompletion.mockResolvedValueOnce({
      ok: false as const,
      error: { code: "unavailable" as const, message: "Momentum could not save that change." },
    } as never);

    renderPage(fullDay());
    const control = screen.getByRole("checkbox", { name: "Complete task" });
    fireEvent.click(control);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // The transition settled against unchanged props, so React discarded the
    // overlay: the row is outstanding again and the control still reads as the
    // action it will perform.
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Complete task" }).dataset.state).not.toBe(
        "checked",
      ),
    );
  });

  it("says so when the day holds nothing, rather than showing an empty list", () => {
    renderPage(todayPage());
    expect(screen.getByText(TODAY_COPY.timeline.emptyTitle)).toBeDefined();
  });
});

describe("next up", () => {
  it("names the next incomplete item by the current time", () => {
    clock.now = at("2026-09-08", 10, 30);
    renderPage(fullDay());

    const panel = nextUpPanel();
    expect(panel.textContent).toContain("Chemistry lecture");
    expect(panel.textContent).not.toContain(TODAY_COPY.nextUp.now);
  });

  it("names the running item and says it is happening now", () => {
    clock.now = at("2026-09-08", 9, 20);
    renderPage(fullDay());

    const panel = nextUpPanel();
    expect(panel.textContent).toContain("Analyse benchmarks");
    expect(panel.textContent).toContain(TODAY_COPY.nextUp.now);
  });

  it("falls back to the instant the server rendered at before the clock ticks", () => {
    // `useNow` is null on the server and through hydration; the page still has
    // to name the right item, or the markup React hydrates is not the markup it
    // renders.
    clock.now = null;
    renderPage(fullDay());
    expect(nextUpPanel().textContent).toContain("Chemistry lecture");
  });

  it("starts a focus session through a link carrying the task and the length", () => {
    clock.now = at("2026-09-08", 8);
    renderPage(fullDay());

    const link = within(nextUpPanel()).getByRole("link", {
      name: TODAY_COPY.nextUp.startFocus,
    });
    expect(link.getAttribute("href")).toBe("/focus?task=task-morning&minutes=60");
  });

  it("completes from Next Up", async () => {
    clock.now = at("2026-09-08", 8);
    renderPage(fullDay());

    fireEvent.click(within(nextUpPanel()).getByRole("button", { name: "Complete task" }));

    await waitFor(() =>
      expect(actions.setBlockCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ id: "morning", completed: true }),
      ),
    );
  });

  it("reschedules from Next Up, sending wall clock and never an instant", async () => {
    clock.now = at("2026-09-08", 8);
    renderPage(fullDay());

    fireEvent.click(
      within(nextUpPanel()).getByRole("button", {
        name: TODAY_COPY.nextUp.reschedule,
      }),
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(TODAY_COPY.reschedule.start), {
      target: { value: "16:00" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: TODAY_COPY.reschedule.submit }));

    await waitFor(() =>
      expect(actions.rescheduleBlock).toHaveBeenCalledWith({
        id: "morning",
        date: TODAY,
        startMinutes: 960,
        endMinutes: 1020,
      }),
    );
  });

  it("offers what is due soonest when nothing is scheduled", () => {
    renderPage(
      todayPage({
        candidates: [
          todayTask({ id: "t1", title: "Lab report", dueDate: localDate("2026-09-05") }),
        ],
      }),
    );

    const panel = nextUpPanel();
    expect(panel.textContent).toContain(TODAY_COPY.nextUp.unscheduled);
    expect(panel.textContent).toContain("Lab report");
    expect(panel.textContent).toContain("Was due Sep 5");
  });

  it("is pleasant when the day's work is finished", () => {
    clock.now = at("2026-09-08", 20);
    renderPage(
      todayPage({
        timeline: timelineOf([{ ...MORNING, completedAt: at("2026-09-08", 9, 45) }]),
        completedTasksToday: 2,
      }),
    );

    expect(screen.getByText(TODAY_COPY.nextUp.doneTitle)).toBeDefined();
    expect(screen.getByText(/3 things finished today/)).toBeDefined();
  });

  it("says the day is open when it holds nothing at all", () => {
    renderPage(todayPage());
    expect(screen.getByText(TODAY_COPY.nextUp.emptyTitle)).toBeDefined();
  });
});

describe("tasks due today", () => {
  it("lists the unscheduled ones and completes them inline", async () => {
    renderPage(todayPage({ tasks: [todayTask({ id: "t1", title: "Renew library loans" })] }));

    fireEvent.click(screen.getByRole("checkbox", { name: 'Complete "Renew library loans"' }));

    await waitFor(() =>
      expect(actions.setTaskCompletion).toHaveBeenCalledWith({ id: "t1", completed: true }),
    );
  });
});

describe("habits", () => {
  const reading = habit({ id: "habit-1", name: "Reading" });

  it("counts what is met today and records a day in one press", async () => {
    renderPage(
      todayPage({
        habits: [todayHabit({ habit: reading, day: habitDay(reading, TODAY, 0, TODAY) })],
      }),
    );

    expect(screen.getByText("0/1")).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox", { name: /Reading/ }));

    await waitFor(() =>
      expect(actions.setHabitCompletion).toHaveBeenCalledWith({
        habitId: "habit-1",
        date: TODAY,
        recorded: true,
        amount: 1,
      }),
    );
    // The overlay moved the count in the same frame, without a round trip.
    expect(screen.getByText("1/1")).toBeDefined();
  });

  it("un-records a day that is already met", async () => {
    renderPage(
      todayPage({
        habits: [
          todayHabit({
            habit: reading,
            completions: [completion("habit-1", TODAY)],
            day: habitDay(reading, TODAY, 1, TODAY),
          }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Reading/ }));

    await waitFor(() =>
      expect(actions.setHabitCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ recorded: false }),
      ),
    );
  });

  it("tops a per-week amount habit up to its week target from one press", async () => {
    // Phase 13 (PROG-15): a tick used to record 1 unit and call the day done.
    const language = habit({
      id: "habit-2",
      name: "Language practice",
      frequencyType: "amount_per_week",
      target: 120,
      unit: "minutes",
    });
    renderPage(
      todayPage({
        habits: [
          todayHabit({
            habit: language,
            day: habitDay(language, TODAY, 0, TODAY),
            progress: { achieved: 40, target: 120, fraction: 40 / 120 },
          }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Language practice/ }));

    await waitFor(() =>
      expect(actions.setHabitCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ habitId: "habit-2", recorded: true, amount: 80 }),
      ),
    );
  });
});

describe("at risk", () => {
  it("is not rendered at all when there is nothing to say", () => {
    renderPage(fullDay());
    expect(screen.queryByRole("region", { name: TODAY_COPY.risk.title })).toBeNull();
    expect(screen.queryByText(TODAY_COPY.risk.title)).toBeNull();
  });

  it("states an overdue deadline as a fact, with no verdict about the person", () => {
    renderPage(
      todayPage({
        overdue: [
          todayTask({ id: "t1", title: "History essay", dueDate: localDate("2026-09-01") }),
        ],
      }),
    );

    expect(screen.getByText("History essay was due Sep 1, 7 days ago.")).toBeDefined();
    expect(screen.getByText(TODAY_COPY.risk.count(1))).toBeDefined();
  });

  it("clears a row the moment its task is completed, and restores it on failure", async () => {
    actions.setTaskCompletion.mockResolvedValueOnce({
      ok: false as const,
      error: { code: "unavailable" as const, message: "Momentum could not save that change." },
    } as never);

    const overdue = todayTask({
      id: "t1",
      title: "History essay",
      dueDate: localDate("2026-09-01"),
    });
    renderPage(todayPage({ overdue: [overdue], candidates: [overdue] }));

    const sentence = "History essay was due Sep 1, 7 days ago.";
    expect(screen.getByText(sentence)).toBeDefined();

    fireEvent.click(
      within(nextUpPanel()).getByRole("button", {
        name: TODAY_COPY.nextUp.completeTask,
      }),
    );

    // The overlay cleared the row in the same frame as the press...
    expect(screen.queryByText(sentence)).toBeNull();

    // ...and the failed write put it back, because the transition settled
    // against unchanged props (Domain Rule 11).
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(await screen.findByText(sentence)).toBeDefined();
  });
});

describe("quests", () => {
  /**
   * The shape the database mints: `quest_assignment_id()` is `md5(...)::uuid`,
   * so the version nibble is whatever the hash produced — here `d`, which is
   * not a UUID version. This is what a Claim button actually sends, and the
   * real schema has to accept it (`features/gamification/schemas.test.ts`).
   */
  const ASSIGNMENT_ID = "ad72fcea-d19a-d1b0-3a5e-0f7f5a1b2c3d";

  function claimable() {
    return todayPage({
      quests: [
        {
          assignmentId: ASSIGNMENT_ID,
          definition: {
            id: "q1",
            key: "three-tasks",
            title: "Complete 3 tasks",
            description: "Three finished tasks, of any size.",
            metric: "tasks_completed",
            target: 3,
            period: "daily",
            xpReward: 40,
            coinReward: 5,
            active: true,
          },
          progress: { value: 3, target: 3, fraction: 1, met: true },
          completedAt: null,
          claimable: true,
        },
      ],
    });
  }

  it("shows today's progress and claims one that is met", async () => {
    renderPage(claimable());

    expect(screen.getByText("Complete 3 tasks")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: TODAY_COPY.quests.claim }));

    await waitFor(() => expect(actions.claimQuest).toHaveBeenCalledWith({ id: ASSIGNMENT_ID }));
  });

  it("shows the server's refusal without a Retry that could never succeed", async () => {
    actions.claimQuest.mockResolvedValueOnce({
      ok: false as const,
      error: { code: "validation" as const, message: "that quest is not finished yet" },
    } as never);
    renderPage(claimable());

    fireEvent.click(screen.getByRole("button", { name: TODAY_COPY.quests.claim }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("that quest is not finished yet", {
        action: undefined,
      }),
    );
  });

  /*
   * The other half of "on failure" (Domain Rules §19): the call itself rejects
   * when the device is offline or the server answers 5xx, and React re-throws
   * a rejection out of the transition at the next render — which, uncaught,
   * hands the route's error boundary a blanked page over one press.
   */
  it("keeps the page and offers Retry when the claim rejects instead of returning", async () => {
    actions.claimQuest.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(
      <ErrorBoundary section="Today">
        <AnnouncerProvider>
          <UserSettingsProvider settings={{ timezone: TZ, weekStart: 1, snapMinutes: 15 }}>
            <TodayView data={claimable()} />
          </UserSettingsProvider>
        </AnnouncerProvider>
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: TODAY_COPY.quests.claim }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Momentum could not reach the server. Your change was not saved.",
        expect.objectContaining({ action: expect.objectContaining({ label: "Retry" }) }),
      ),
    );
    // The page is still there; the boundary never saw it, and the control is
    // live again rather than stuck reading as busy.
    expect(screen.queryByRole("alert")).toBeNull();
    const button = screen.getByRole("button", { name: TODAY_COPY.quests.claim });
    expect(button.hasAttribute("data-pending")).toBe(false);

    // Retry sends the same id again.
    const call = vi.mocked(toast.error).mock.calls.at(-1)?.[1] as
      { action?: { onClick: () => void } } | undefined;
    call?.action?.onClick();
    await waitFor(() => expect(actions.claimQuest).toHaveBeenCalledTimes(2));
    expect(actions.claimQuest).toHaveBeenLastCalledWith({ id: ASSIGNMENT_ID });
  });
});

/**
 * Domain Rule 10 and the accessibility floor: every action on this page is
 * reachable and operable by keyboard, and no control disables itself while a
 * write is in flight — the browser blurs an element the moment it is disabled,
 * so a control that did would drop a keyboard user on `<body>` by working.
 */
describe("keyboard", () => {
  it("puts every action in the tab order, and none of them behind a pointer", () => {
    clock.now = at("2026-09-08", 8);
    renderPage(
      fullDay({
        tasks: [todayTask({ id: "t1", title: "Renew library loans" })],
        habits: [todayHabit({ habit: habit({ id: "habit-1", name: "Reading" }) })],
      }),
    );

    const controls = [
      ...screen.getAllByRole("button"),
      ...screen.getAllByRole("link"),
      ...screen.getAllByRole("checkbox"),
    ];

    expect(controls.length).toBeGreaterThan(5);
    for (const control of controls) {
      expect(control.getAttribute("tabindex"), control.textContent ?? "").not.toBe("-1");
      expect(control.hasAttribute("disabled"), control.textContent ?? "").toBe(false);
      // Every one of them is named, or a screen reader reaches an unlabelled
      // control it cannot describe.
      expect(
        (control.textContent ?? "").trim() !== "" || control.getAttribute("aria-label") !== null,
      ).toBe(true);
    }
  });

  /**
   * The completion control is a native `button` carrying the checkbox role, so
   * Space and Enter activate it through the platform rather than through a
   * handler this page would have to write and could get wrong. jsdom does not
   * synthesise that activation, so what is asserted is the structure the
   * browser acts on — the element, its role, its name — and the effect is
   * asserted through the activation event a browser would dispatch.
   */
  it("completes a block through a focusable native control", async () => {
    renderPage(fullDay());
    const control = screen.getByRole("checkbox", { name: "Complete task" });

    control.focus();
    expect(document.activeElement).toBe(control);
    expect(control.tagName).toBe("BUTTON");

    fireEvent.click(control);

    await waitFor(() =>
      expect(actions.setBlockCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ id: "morning" }),
      ),
    );
  });

  it("keeps a control focused while its own write is in flight", async () => {
    renderPage(fullDay());
    const control = screen.getByRole("checkbox", { name: "Complete task" });

    control.focus();
    fireEvent.click(control);

    await waitFor(() => expect(actions.setBlockCompletion).toHaveBeenCalled());
    expect(document.activeElement).not.toBe(document.body);
  });
});

/**
 * The habit row's number.
 *
 * Three shapes, because the habits have three: a boolean habit shows its
 * state as a word, a per-day amount habit shows today against today's target,
 * and a per-week habit shows the week — which is the only target it names.
 */
describe("habit rows", () => {
  it("shows a boolean habit's state as a word, never as a bare number", () => {
    const reading = habit({ id: "h1", name: "Reading", frequencyType: "daily" });
    renderPage(
      todayPage({
        habits: [todayHabit({ habit: reading, day: habitDay(reading, TODAY, 0, TODAY) })],
      }),
    );
    expect(screen.getByText("Coming up")).toBeDefined();
  });

  it("measures a per-day amount habit against today, not against the week", () => {
    const meditate = habit({
      id: "h2",
      name: "Meditate",
      frequencyType: "amount_per_day",
      target: 15,
      unit: "minutes",
    });
    renderPage(
      todayPage({
        habits: [
          todayHabit({
            habit: meditate,
            day: habitDay(meditate, TODAY, 5, TODAY),
            progress: { achieved: 65, target: 105, fraction: 65 / 105 },
          }),
        ],
      }),
    );
    expect(screen.getByText("5m of 15m")).toBeDefined();
  });

  it("measures a per-week habit against the week, which is the only target it names", () => {
    const run = habit({ id: "h3", name: "Run", frequencyType: "times_per_week", target: 3 });
    renderPage(
      todayPage({
        habits: [
          todayHabit({
            habit: run,
            day: habitDay(run, TODAY, 0, TODAY),
            progress: { achieved: 1, target: 3, fraction: 1 / 3 },
          }),
        ],
      }),
    );
    expect(screen.getByText("1 of 3 days")).toBeDefined();
  });
});
