import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { habitDays, habitStats, weekProgress } from "@momentum/core/habits";
import { addDays, ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { Habit, HabitCompletion, LocalDate } from "@momentum/core/types";

import { HABITS_COPY } from "@/features/habits/copy";
import type { HabitView, HabitsPageData } from "@/features/habits/types";

const {
  setHabitCompletionMock,
  addHabitToWeekMock,
  createHabitMock,
  deleteHabitMock,
  replaceMock,
} = vi.hoisted(() => ({
  setHabitCompletionMock: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
  addHabitToWeekMock: vi.fn(() => Promise.resolve({ ok: true as const, data: [] })),
  createHabitMock: vi.fn<(input: unknown) => Promise<{ ok: true; data: null }>>(() =>
    Promise.resolve({ ok: true as const, data: null }),
  ),
  deleteHabitMock: vi.fn<(input: unknown) => Promise<{ ok: true; data: null }>>(() =>
    Promise.resolve({ ok: true as const, data: null }),
  ),
  replaceMock: vi.fn(),
}));

// The page calls `router.replace` after opening the palette's form; jsdom has no router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
}));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { toast } = await import("@momentum/ui/components/toast");

vi.mock("@/features/habits/actions", () => ({
  setHabitCompletion: setHabitCompletionMock,
  addHabitToWeek: addHabitToWeekMock,
  createHabit: createHabitMock,
  updateHabit: vi.fn(),
  archiveHabit: vi.fn(),
  deleteHabit: deleteHabitMock,
}));

const { HabitsView } = await import("@/features/habits/components/habits-view");

/** Monday 2026-09-07 … Sunday 2026-09-13, with Wednesday as today. */
const WEEK: readonly LocalDate[] = Array.from({ length: 7 }, (_, i) =>
  addDays(localDate("2026-09-07"), i),
);
const TODAY = localDate("2026-09-09");

function habitOf(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    userId: "user-1",
    name: "Read 20 pages",
    description: null,
    frequencyType: "daily",
    target: 1,
    unit: "count",
    activeDays: [],
    preferredStartTime: null,
    estimatedMinutes: null,
    xpReward: 5,
    color: null,
    archivedAt: null,
    createdAt: instant("2026-08-01T00:00:00.000Z"),
    updatedAt: instant("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function viewOf(habit: Habit, history: readonly HabitCompletion[] = []): HabitView {
  const trackedFrom = localDate("2026-08-01");
  return {
    habit,
    week: habitDays(habit, WEEK, history, TODAY),
    progress: weekProgress(habit, WEEK, history),
    stats: habitStats({ habit, completions: history, today: TODAY, weekStart: 1, trackedFrom }),
    reservedDates: [],
    trackedFrom,
    history,
  };
}

function pageOf(active: readonly HabitView[], archived: readonly HabitView[] = []): HabitsPageData {
  return {
    today: TODAY,
    timezone: ianaTimeZone("America/New_York"),
    weekStart: 1,
    week: WEEK,
    historyFrom: localDate("2026-08-01"),
    active,
    archived,
  };
}

beforeEach(() => {
  setHabitCompletionMock.mockClear();
  addHabitToWeekMock.mockClear();
  createHabitMock.mockClear();
  deleteHabitMock.mockClear();
  vi.mocked(toast.info).mockClear();
  vi.mocked(toast.error).mockClear();
});

function completionOf(habitId: string, date: LocalDate, amount = 1): HabitCompletion {
  return {
    id: `row-${habitId}-${date}`,
    habitId,
    userId: "user-1",
    completionDate: date,
    amount,
    sourceBlockId: null,
    completedAt: instant(`${date}T12:00:00.000Z`),
  };
}

/** Today's cell on the first (or only) row with a control for it. */
function todayCell(): HTMLElement {
  const cell = screen
    .getAllByRole("button")
    .find((button) => button.getAttribute("title")?.includes("September 9"));
  if (cell === undefined) throw new Error("no cell for today");
  return cell;
}

/** Opens a row's menu by keyboard and chooses an item; resolves once the item has acted. */
async function chooseFromMenu(habitName: string, item: string): Promise<void> {
  const trigger = screen.getByRole("button", { name: `Options for ${habitName}` });
  fireEvent.keyDown(trigger, { key: "Enter" });
  const entry = await screen.findByRole("menuitem", { name: item });
  fireEvent.click(entry);
  await waitFor(() => expect(screen.queryByRole("menuitem", { name: item })).toBeNull());
}

describe("HabitsView", () => {
  it("shows the target, the week's progress and consistency on every row", () => {
    render(
      <HabitsView
        data={pageOf([viewOf(habitOf({ frequencyType: "times_per_week", target: 3 }))])}
      />,
    );

    expect(screen.getByText(/3 days a week/)).toBeDefined();
    expect(screen.getByText(/0 of 3 days/)).toBeDefined();
    // The rate is a percentage of what the window asked for, stated plainly.
    expect(screen.getByText("0%")).toBeDefined();
  });

  it("offers a control only on the three days the database will record", () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);

    // Yesterday, today and tomorrow: the window `record_habit_completion` enforces.
    const recordable = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("title") ?? "")
      .filter((title) => title.includes("September"));

    expect(recordable).toHaveLength(3);
    expect(recordable.some((title) => title.includes("September 8"))).toBe(true);
    expect(recordable.some((title) => title.includes("September 9"))).toBe(true);
    expect(recordable.some((title) => title.includes("September 10"))).toBe(true);
    expect(recordable.some((title) => title.includes("September 7"))).toBe(false);
  });

  it("records a day from the page, as a calendar date and never an instant", async () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);

    const today = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("title")?.includes("September 9"));
    today?.click();

    await waitFor(() => expect(setHabitCompletionMock).toHaveBeenCalledOnce());
    expect(setHabitCompletionMock).toHaveBeenCalledWith({
      habitId: "habit-1",
      date: "2026-09-09",
      recorded: true,
      amount: 1,
    });
  });

  it("un-records a day that is already recorded, rather than recording it twice", async () => {
    const completion: HabitCompletion = {
      id: "row-1",
      habitId: "habit-1",
      userId: "user-1",
      completionDate: TODAY,
      amount: 1,
      sourceBlockId: null,
      completedAt: instant("2026-09-09T12:00:00.000Z"),
    };

    render(<HabitsView data={pageOf([viewOf(habitOf(), [completion])])} />);

    const today = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("title")?.includes("September 9"));
    expect(today?.getAttribute("aria-pressed")).toBe("true");
    today?.click();

    await waitFor(() =>
      expect(setHabitCompletionMock).toHaveBeenCalledWith(
        expect.objectContaining({ recorded: false }),
      ),
    );
  });

  it("tops an amount habit's day up to its target in one press", async () => {
    const habit = habitOf({ frequencyType: "amount_per_day", target: 30, unit: "minutes" });
    const completion: HabitCompletion = {
      id: "row-1",
      habitId: "habit-1",
      userId: "user-1",
      completionDate: TODAY,
      amount: 10,
      sourceBlockId: null,
      completedAt: instant("2026-09-09T12:00:00.000Z"),
    };

    render(<HabitsView data={pageOf([viewOf(habit, [completion])])} />);

    const today = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("title")?.includes("September 9"));
    today?.click();

    await waitFor(() =>
      expect(setHabitCompletionMock).toHaveBeenCalledWith(
        expect.objectContaining({ recorded: true, amount: 20 }),
      ),
    );
  });

  it("tops a per-week amount habit up to the week's target, never up to one unit", async () => {
    // `dailyTargetOf` is null for the per-week cadence, so a press that read
    // the day's target sent 1 — one minute toward two hours, called Done.
    const habit = habitOf({ frequencyType: "amount_per_week", target: 120, unit: "minutes" });
    const monday = completionOf("habit-1", localDate("2026-09-07"), 40);

    render(<HabitsView data={pageOf([viewOf(habit, [monday])])} />);
    expect(screen.getByText(/40m of 2h/)).toBeDefined();

    todayCell().click();

    await waitFor(() =>
      expect(setHabitCompletionMock).toHaveBeenCalledWith(
        expect.objectContaining({ recorded: true, amount: 80 }),
      ),
    );
  });

  it("refuses a second press while the first is still in flight", async () => {
    // A quick double press must not read the optimistic "done" and un-record the day.
    let release: () => void = () => {};
    setHabitCompletionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true as const, data: null });
        }),
    );

    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);

    const cell = todayCell();
    fireEvent.click(cell);
    await waitFor(() => expect(cell.getAttribute("aria-disabled")).toBe("true"));
    fireEvent.click(cell);
    fireEvent.click(cell);

    expect(setHabitCompletionMock).toHaveBeenCalledTimes(1);
    expect(setHabitCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ recorded: true }),
    );

    release();
    await waitFor(() => expect(cell.getAttribute("aria-disabled")).toBeNull());
  });

  it("reserves this week's time through the same action the planner uses", async () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);

    screen.getByRole("button", { name: /Add to week: Read 20 pages/ }).click();

    await waitFor(() =>
      expect(addHabitToWeekMock).toHaveBeenCalledWith({
        habitId: "habit-1",
        weekStartDate: "2026-09-07",
      }),
    );
  });

  it("says the week was already reserved rather than claiming blocks it did not create", async () => {
    // The second press creates nothing, and the toast must say so.
    addHabitToWeekMock.mockResolvedValueOnce({ ok: true as const, data: [] });
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);

    screen.getByRole("button", { name: /Add to week: Read 20 pages/ }).click();

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(HABITS_COPY.alreadyReserved));
  });

  it("keeps archived habits out of the active list and offers them their own scope", () => {
    const archived = viewOf(
      habitOf({
        id: "habit-2",
        name: "Old habit",
        archivedAt: instant("2026-09-01T00:00:00.000Z"),
      }),
    );
    render(<HabitsView data={pageOf([viewOf(habitOf())], [archived])} />);

    expect(screen.queryByText("Old habit")).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Habit scope" })).toBeDefined();
  });

  it("says nothing punitive about a week with gaps in it", () => {
    const history: HabitCompletion[] = [
      {
        id: "row-1",
        habitId: "habit-1",
        userId: "user-1",
        completionDate: localDate("2026-09-07"),
        amount: 1,
        sourceBlockId: null,
        completedAt: instant("2026-09-07T12:00:00.000Z"),
      },
    ];

    const { container } = render(<HabitsView data={pageOf([viewOf(habitOf(), history)])} />);

    // Tuesday has nothing on it, and the page still says only what happened.
    expect(container.textContent?.toLowerCase()).not.toMatch(
      /\b(lazy|failed|failure|missed|behind|unproductive|broken|streak lost)\b/,
    );
    expect(screen.getAllByText(/not recorded/i).length).toBeGreaterThan(0);
  });
});

describe("the habit form", () => {
  it("mints the new habit's id once per opened form, so a retry cannot duplicate it", async () => {
    // The id identifies the row, not the attempt: a retry must send the same one
    // or `createHabit`'s unique-violation-as-success path never fires.
    createHabitMock.mockResolvedValueOnce({
      ok: false as const,
      error: { code: "unavailable" as const, message: "Could not reach the server." },
    } as never);

    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);
    fireEvent.click(screen.getByRole("button", { name: "New habit" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Stretch" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Create habit" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    // The form stays open on failure, and the next press is a retry.
    fireEvent.click(within(dialog).getByRole("button", { name: "Create habit" }));
    await waitFor(() => expect(createHabitMock).toHaveBeenCalledTimes(2));

    const ids = createHabitMock.mock.calls.map(([input]) =>
      typeof input === "object" && input !== null && "id" in input ? String(input.id) : null,
    );
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
  });

  it("lets the target be cleared and retyped rather than snapping to 1", async () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);
    fireEvent.click(screen.getByRole("button", { name: "New habit" }));
    const dialog = await screen.findByRole("dialog");

    // The target field only exists for the shapes that have one.
    fireEvent.keyDown(within(dialog).getByLabelText("How often"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Days per week" }));
    const target = await within(dialog).findByLabelText("Days a week");

    fireEvent.change(target, { target: { value: "" } });
    expect((target as HTMLInputElement).value).toBe("");
    fireEvent.change(target, { target: { value: "3" } });
    expect((target as HTMLInputElement).value).toBe("3");

    // Blur resyncs an emptied field to the committed value.
    fireEvent.change(target, { target: { value: "" } });
    fireEvent.blur(target);
    expect((target as HTMLInputElement).value).toBe("3");
  });

  it("returns focus to the control that opened it", async () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);
    const opener = screen.getByRole("button", { name: "New habit" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("deleting a habit", () => {
  it("asks first, with Cancel as the default, and deletes nothing until confirmed", async () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);

    await chooseFromMenu("Read 20 pages", "Delete");
    const dialog = await screen.findByRole("dialog", { name: "Delete Read 20 pages?" });
    expect(within(dialog).getByText(HABITS_COPY.deleteHint)).toBeDefined();
    expect(deleteHabitMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" })),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete habit" }));
    await waitFor(() => expect(deleteHabitMock).toHaveBeenCalledWith({ id: "habit-1" }));
  });

  it("cancels on Escape and hands focus back to the row's menu", async () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);

    await chooseFromMenu("Read 20 pages", "Delete");
    const dialog = await screen.findByRole("dialog", { name: "Delete Read 20 pages?" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deleteHabitMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Options for Read 20 pages" }),
      ),
    );
  });

  it("moves focus to the neighbouring row once the deleted one is gone", async () => {
    const second = viewOf(habitOf({ id: "habit-2", name: "Stretch" }));
    render(<HabitsView data={pageOf([viewOf(habitOf()), second])} />);

    await chooseFromMenu("Read 20 pages", "Delete");
    const dialog = await screen.findByRole("dialog", { name: "Delete Read 20 pages?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete habit" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stretch" })),
    );
  });

  it("moves focus to New habit when the deleted row was the last one", async () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);

    await chooseFromMenu("Read 20 pages", "Delete");
    const dialog = await screen.findByRole("dialog", { name: "Delete Read 20 pages?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete habit" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "New habit" })),
    );
  });
});

describe("the palette's Add habit intent", () => {
  it("opens the form once and drops the intent from the URL", async () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} newHabit />);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(replaceMock).toHaveBeenCalledWith("/habits");
  });

  it("opens nothing without the intent", () => {
    render(<HabitsView data={pageOf([viewOf(habitOf())])} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
