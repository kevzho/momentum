import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { localDate } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

/**
 * `useNow` is replaced by a value this file sets; `null` is the server render
 * and hydration pass. Actions are mocked at the module boundary, so what is
 * asserted is the contract with the server: an id, a boolean, at most a span.
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
const { QuickAddContext } = await import("@/features/tasks/components/quick-add-context");
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
    // React discarded the overlay: the row is outstanding again.
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
    // `useNow` is null on the server and through hydration; the page must still name the right item.
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

  it("points a brand-new account at capture, and the button opens Quick Add", () => {
    const open = vi.fn();
    render(
      <AnnouncerProvider>
        <UserSettingsProvider settings={{ timezone: TZ, weekStart: 1, snapMinutes: 15 }}>
          <QuickAddContext value={{ open, setDefaults: vi.fn() }}>
            <TodayView data={todayPage({ openTaskCount: 0, hasScheduledWork: false })} />
          </QuickAddContext>
        </UserSettingsProvider>
      </AnnouncerProvider>,
    );

    const panel = nextUpPanel();
    expect(within(panel).getByText(TODAY_COPY.nextUp.captureTitle)).toBeDefined();
    expect(within(panel).queryByRole("link", { name: TODAY_COPY.nextUp.planWeek })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: TODAY_COPY.nextUp.addTask }));
    expect(open).toHaveBeenCalledTimes(1);

    // The timeline's empty state agrees, and carries no second button: Next Up has the one.
    expect(screen.getByText(TODAY_COPY.timeline.captureDescription)).toBeDefined();
    expect(screen.queryByRole("link", { name: TODAY_COPY.timeline.openCalendar })).toBeNull();
    expect(screen.getAllByRole("button", { name: TODAY_COPY.nextUp.addTask })).toHaveLength(1);
  });

  it("points an account with tasks and no slot anywhere at scheduling one", () => {
    renderPage(todayPage({ openTaskCount: 3, hasScheduledWork: false }));

    const panel = nextUpPanel();
    expect(within(panel).getByText(TODAY_COPY.nextUp.scheduleTitle)).toBeDefined();
    expect(panel.textContent).toContain("3 open tasks have no time reserved");
    expect(within(panel).getByRole("link", { name: TODAY_COPY.nextUp.planWeek })).toBeDefined();
    expect(screen.getByRole("link", { name: TODAY_COPY.timeline.openCalendar })).toBeDefined();
  });

  it("uses the singular for one open task", () => {
    renderPage(todayPage({ openTaskCount: 1, hasScheduledWork: false }));
    expect(nextUpPanel().textContent).toContain("One open task has no time reserved");
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
    // A tick must top the amount up to the target, not record 1 unit.
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

    // ...and the failed write put it back.
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(await screen.findByText(sentence)).toBeDefined();
  });
});

describe("quests", () => {
  // `quest_assignment_id()` is `md5(...)::uuid`, so the version nibble (here `d`)
  // is not a UUID version; the real schema has to accept it.
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

  // A rejected call, uncaught, would hand the route's error boundary a blanked page.
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
    // The page is still there and the control is live again.
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

// No control disables itself while a write is in flight: the browser blurs a
// disabled element, dropping a keyboard user on `<body>`.
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
      // Every one of them is named.
      expect(
        (control.textContent ?? "").trim() !== "" || control.getAttribute("aria-label") !== null,
      ).toBe(true);
    }
  });

  // jsdom does not synthesise keyboard activation of a native button, so the
  // structure (element, role, name) and the click a browser would dispatch are asserted.
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
