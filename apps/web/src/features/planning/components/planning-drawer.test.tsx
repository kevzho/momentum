import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import type {
  CapacityInput,
  Commitment,
  ConflictInput,
  DayWorkload,
  FindTimeCandidate,
  FindTimeInput,
  FindTimeResult,
  PlanningTask,
  PlanningWarning,
  WeekCapacity,
} from "@momentum/core/scheduling";
import { ianaTimeZone, instant, localDate, localTime, weekdayOf } from "@momentum/core/time";
import type { LocalDate, WorkingHours } from "@momentum/core/types";

import type {
  CalendarItem,
  CalendarSettings,
  PlanTask,
  PlanningData,
  PlanningGoal,
} from "@/features/calendar/types";
import { PlanningDrawer } from "@/features/planning/components/planning-drawer";
import type { PlanningDrawerProps } from "@/features/planning/types";

// The engine is stubbed; `scheduledMinutesOf` gets a small real
// implementation so live coverage can be tested end to end.

const { engine } = vi.hoisted(() => ({
  engine: {
    weekCapacity: vi.fn<(input: CapacityInput) => WeekCapacity>(),
    detectConflicts: vi.fn<(input: ConflictInput) => PlanningWarning[]>(),
    findTime: vi.fn<(input: FindTimeInput) => FindTimeResult>(),
  },
}));

vi.mock("@momentum/core/scheduling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@momentum/core/scheduling")>();
  const time = await import("@momentum/core/time");
  return {
    ...actual,
    weekCapacity: (input: CapacityInput) => engine.weekCapacity(input),
    detectConflicts: (input: ConflictInput) => engine.detectConflicts(input),
    findTime: (input: FindTimeInput) => engine.findTime(input),
    describeWarning: (warning: PlanningWarning) => `described ${warning.kind}`,
    warningKey: (warning: PlanningWarning) => JSON.stringify(warning),
    scheduledMinutesOf: (task: PlanningTask, commitments: readonly Commitment[]) =>
      task.scheduledOutsideMinutes +
      commitments
        .filter((commitment) => commitment.taskId === task.id)
        .reduce((sum, c) => sum + time.durationMinutes(c.startAt, c.endAt), 0),
  };
});

const DAYS: readonly LocalDate[] = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
].map(localDate);

const TODAY = localDate("2026-09-08");
const NOW = instant("2026-09-08T14:30:00.000Z");

const SETTINGS: CalendarSettings = {
  timezone: ianaTimeZone("America/New_York"),
  weekStart: 1,
  snapMinutes: 15,
  spec: DEFAULT_GRID_SPEC,
};

const OFFICE = { start: localTime("09:00"), end: localTime("17:00") };
const WORKING_HOURS: WorkingHours = {
  0: [],
  1: [OFFICE],
  2: [OFFICE],
  3: [OFFICE],
  4: [OFFICE],
  5: [OFFICE],
  6: [],
};

function planTask(overrides: Partial<PlanTask> & Pick<PlanTask, "id" | "title">): PlanTask {
  return {
    priority: 4,
    estimatedMinutes: null,
    dueDate: null,
    projectName: null,
    projectColor: null,
    scheduledOutsideMinutes: 0,
    ...overrides,
  };
}

const LAB = planTask({
  id: "task-lab",
  title: "Lab report",
  priority: 1,
  estimatedMinutes: 60,
  dueDate: localDate("2026-09-04"),
});

const ESSAY = planTask({
  id: "task-essay",
  title: "History essay",
  priority: 2,
  estimatedMinutes: 120,
  dueDate: localDate("2026-09-11"),
  projectName: "History 210",
  projectColor: "amber",
  scheduledOutsideMinutes: 30,
});

const HOMEWORK = planTask({
  id: "task-homework",
  title: "Finish statistics homework",
  estimatedMinutes: 45,
});

const GOALS: PlanningGoal[] = [
  {
    id: "goal-1",
    title: "Ship the essay",
    metric: "tasks_completed",
    target: 3,
    completedAt: null,
  },
  {
    id: "goal-2",
    title: null,
    metric: "focus_minutes",
    target: 300,
    completedAt: instant("2026-09-07T12:00:00.000Z"),
  },
];

const PLAN: PlanningData = {
  overdue: [LAB],
  dueInRange: [ESSAY],
  unscheduled: [HOMEWORK],
  habits: [],
  weeklyGoals: GOALS,
  workingHours: WORKING_HOURS,
  focusWindows: [],
};

const EMPTY_PLAN: PlanningData = {
  ...PLAN,
  overdue: [],
  dueInRange: [],
  unscheduled: [],
  weeklyGoals: [],
};

function workload(date: LocalDate, plannedMinutes: number, workingMinutes: number): DayWorkload {
  return {
    date,
    weekday: weekdayOf(date),
    plannedMinutes,
    workMinutes: plannedMinutes,
    eventMinutes: 0,
    workingMinutes,
    availableMinutes: Math.max(0, workingMinutes - plannedMinutes),
    isPast: date < TODAY,
  };
}

const CAPACITY: WeekCapacity = {
  plannedMinutes: 18 * 60 + 35,
  availableMinutes: 12 * 60 + 10,
  unscheduledMinutes: 4 * 60 + 20,
  workingMinutes: 40 * 60,
  days: [
    workload(DAYS[0]!, 390, 480),
    workload(DAYS[1]!, 240, 480),
    workload(DAYS[2]!, 0, 480),
    workload(DAYS[3]!, 0, 480),
    workload(DAYS[4]!, 0, 480),
    workload(DAYS[5]!, 0, 0),
    workload(DAYS[6]!, 0, 0),
  ],
};

const WARNINGS: PlanningWarning[] = [
  {
    kind: "past-deadline",
    block: { id: "block-1", title: "History essay" },
    taskId: "task-essay",
    dueDate: localDate("2026-09-11"),
    date: localDate("2026-09-12"),
  },
  {
    kind: "overlap",
    date: localDate("2026-09-09"),
    first: { id: "block-2", title: "Chemistry lecture" },
    second: { id: "block-3", title: "Study group" },
    overlapMinutes: 30,
  },
];

const CANDIDATE: FindTimeCandidate = {
  span: { date: localDate("2026-09-09"), startMinutes: 16 * 60, endMinutes: 16 * 60 + 45 },
  startAt: instant("2026-09-09T20:00:00.000Z"),
  endAt: instant("2026-09-09T20:45:00.000Z"),
  score: {
    beforeDeadline: true,
    withinWorkingHours: true,
    conflicts: 0,
    fragments: 0,
    focusFit: 0,
  },
  openWindowMinutes: 120,
  overlaps: [],
  explanation: "Wednesday 4:00–4:45 PM — 2-hour open window.",
};

function workItem(id: string, task: PlanTask, startAt: string, endAt: string): CalendarItem {
  return {
    id,
    blockId: id,
    kind: "work",
    title: task.title,
    description: null,
    startAt: instant(startAt),
    endAt: instant(endAt),
    allDay: false,
    ownColor: null,
    color: task.projectColor ?? "slate",
    completedAt: null,
    occurrence: null,
    work: {
      taskId: task.id,
      taskTitle: task.title,
      taskCompletedAt: null,
      taskDueDate: task.dueDate,
      taskEstimatedMinutes: task.estimatedMinutes,
      blockCount: 1,
      completesTask: true,
    },
    habitId: null,
    habitRecordable: false,
  };
}

function drawerProps(overrides: Partial<PlanningDrawerProps> = {}): PlanningDrawerProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    presentation: "panel",
    // The panel tolerates an empty ref and simply closes.
    returnFocusTo: { current: null },
    plan: PLAN,
    onAddHabitToWeek: vi.fn(),
    pendingHabitIds: new Set<string>(),
    items: [],
    settings: SETTINGS,
    days: DAYS,
    today: TODAY,
    now: NOW,
    onScheduleTask: vi.fn(),
    pendingTaskIds: new Set(),
    ...overrides,
  };
}

function renderDrawer(overrides: Partial<PlanningDrawerProps> = {}) {
  const props = drawerProps(overrides);
  const view = render(<PlanningDrawer {...props} />);
  return {
    ...props,
    rerender: (next: Partial<PlanningDrawerProps>) =>
      view.rerender(<PlanningDrawer {...props} {...next} />),
  };
}

function sectionFor(name: string | RegExp): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");
  if (!section) throw new Error(`No section for ${String(name)}`);
  return section;
}

beforeEach(() => {
  engine.weekCapacity.mockReset().mockReturnValue(CAPACITY);
  engine.detectConflicts.mockReset().mockReturnValue([]);
  engine.findTime
    .mockReset()
    .mockReturnValue({ outcome: "found", candidates: [CANDIDATE], note: null });
});

describe("PlanningDrawer", () => {
  it("is titled, and renders the five sections in order", () => {
    renderDrawer();

    expect(screen.getByText("Plan my week")).toBeDefined();
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    const sections = headings.filter((text) =>
      ["Overdue", "Due this week", "Unscheduled", "Habits", "Weekly goals"].includes(text ?? ""),
    );
    expect(sections).toEqual(["Overdue", "Due this week", "Unscheduled", "Habits", "Weekly goals"]);
  });

  it("renders nothing while closed", () => {
    renderDrawer({ open: false });

    expect(screen.queryByText("Plan my week")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hands focus to the board's toggle when its own header button hides it", () => {
    function Board() {
      const toggle = React.useRef<HTMLButtonElement>(null);
      const [open, setOpen] = React.useState(true);

      return (
        <>
          <button type="button" ref={toggle} onClick={() => setOpen(true)}>
            Show plan panel
          </button>
          <PlanningDrawer
            {...drawerProps({ open, onOpenChange: setOpen, returnFocusTo: toggle })}
          />
        </>
      );
    }

    render(<Board />);

    const hide = screen.getByRole("button", { name: "Hide plan panel" });
    hide.focus();
    fireEvent.click(hide);

    expect(screen.queryByText("Plan my week")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show plan panel" }));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("puts each task under its own section, once", () => {
    renderDrawer();

    expect(within(sectionFor("Overdue")).getByRole("button", { name: /Lab report/ })).toBeDefined();
    expect(
      within(sectionFor("Due this week")).getByRole("button", { name: /History essay/ }),
    ).toBeDefined();
    expect(
      within(sectionFor("Unscheduled")).getByRole("button", { name: /statistics homework/ }),
    ).toBeDefined();
    for (const title of [/Lab report/, /History essay/, /statistics homework/]) {
      expect(screen.getAllByRole("button", { name: title })).toHaveLength(1);
    }
  });

  it("states each empty section rather than leaving it blank", () => {
    renderDrawer({ plan: EMPTY_PLAN });

    expect(within(sectionFor("Overdue")).getByText("Nothing overdue")).toBeDefined();
    expect(within(sectionFor("Due this week")).getByText("Nothing due")).toBeDefined();
    expect(within(sectionFor("Unscheduled")).getByText("Everything has a time")).toBeDefined();
    expect(within(sectionFor("Weekly goals")).getByText("No weekly goals")).toBeDefined();
  });

  it("titles the due section by the range in day view", () => {
    renderDrawer({ days: [TODAY] });

    expect(screen.getByRole("heading", { name: "Due today" })).toBeDefined();
  });

  it("prints the capacity totals with formatDuration, available as an estimate", () => {
    renderDrawer();

    expect(screen.getByText("Planned").nextElementSibling?.textContent).toBe("18h 35m");
    expect(screen.getByText("Available").nextElementSibling?.textContent).toBe("~12h 10m");
    expect(screen.getByText("Unscheduled work").nextElementSibling?.textContent).toBe("4h 20m");
  });

  it("draws a workload row per displayed day, named and scaled from the capacity", () => {
    renderDrawer();

    const monday = screen.getByRole("img", { name: "Mon: 6h 30m planned, 8h of working hours." });
    const tuesday = screen.getByRole("img", {
      name: "Tue, today: 4h planned, 8h of working hours.",
    });
    expect(screen.getByRole("img", { name: "Sat: 0m planned, no working hours." })).toBeDefined();
    expect(screen.getAllByRole("img")).toHaveLength(7);

    // Scale is 480 (the working window), so Monday's 390 is 81.3% and Tuesday's 240 is 50%.
    expect(monday.querySelector<HTMLElement>('[data-slot="workload-bar"]')?.style.width).toBe(
      "81.3%",
    );
    expect(tuesday.querySelector<HTMLElement>('[data-slot="workload-bar"]')?.style.width).toBe(
      "50%",
    );
    expect(tuesday.querySelector<HTMLElement>('[data-slot="workload-track"]')?.style.width).toBe(
      "100%",
    );
    expect(monday.getAttribute("data-past")).toBe("true");
    expect(tuesday.getAttribute("data-today")).toBe("true");
  });

  it("lists the engine's warnings in its words, or one line when there are none", () => {
    const { rerender } = renderDrawer();
    expect(screen.getByText("No warnings for this range.")).toBeDefined();

    engine.detectConflicts.mockReturnValue(WARNINGS);
    rerender({
      items: [workItem("block-1", ESSAY, "2026-09-12T13:00:00.000Z", "2026-09-12T14:00:00.000Z")],
    });

    const list = within(sectionFor(/^Warnings/)).getByRole("list");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["described past-deadline", "described overlap"]);
    expect(screen.getByRole("heading", { name: "Warnings 2" })).toBeDefined();
  });

  it("hands the engine the live board, the deduplicated tasks and the clock", () => {
    renderDrawer({
      items: [workItem("block-1", ESSAY, "2026-09-09T13:00:00.000Z", "2026-09-09T14:00:00.000Z")],
    });

    const capacityInput = engine.weekCapacity.mock.calls[0]?.[0];
    expect(capacityInput?.context).toEqual({
      timezone: "America/New_York",
      workingHours: WORKING_HOURS,
      focusWindows: [],
      days: DAYS,
      today: TODAY,
    });
    expect(capacityInput?.commitments).toEqual([
      expect.objectContaining({
        id: "block-1",
        kind: "work",
        taskId: "task-essay",
        taskDueDate: "2026-09-11",
        taskCompletedAt: null,
        startAt: "2026-09-09T13:00:00.000Z",
        endAt: "2026-09-09T14:00:00.000Z",
      }),
    ]);
    expect(capacityInput?.tasks.map((task) => task.id)).toEqual([
      "task-lab",
      "task-essay",
      "task-homework",
    ]);

    const conflictInput = engine.detectConflicts.mock.calls[0]?.[0];
    expect(conflictInput?.now).toBe(NOW);
    expect(conflictInput?.tasks).toEqual(capacityInput?.tasks);
  });

  it("moves an unscheduled row out of the list as soon as the board holds a block for it", () => {
    const { rerender } = renderDrawer();
    expect(
      within(sectionFor("Unscheduled")).getByRole("button", { name: /statistics homework/ }),
    ).toBeDefined();

    rerender({
      items: [
        workItem("optimistic-1", HOMEWORK, "2026-09-09T20:00:00.000Z", "2026-09-09T20:45:00.000Z"),
      ],
    });

    expect(screen.queryByRole("button", { name: /statistics homework/ })).toBeNull();
    expect(within(sectionFor("Unscheduled")).getByText("Everything has a time")).toBeDefined();
    // Still counted for capacity: its remaining estimate is unscheduled work.
    expect(engine.weekCapacity.mock.lastCall?.[0].tasks.map((task) => task.id)).toContain(
      "task-homework",
    );

    // A rollback brings it back.
    rerender({ items: [] });
    expect(
      within(sectionFor("Unscheduled")).getByRole("button", { name: /statistics homework/ }),
    ).toBeDefined();
  });

  it("updates a row's coverage from the board, adding what lies outside the range", () => {
    const { rerender } = renderDrawer();

    const before = screen.getByRole("button", { name: /History essay/ });
    expect(within(before).getByText("30m of 2h scheduled")).toBeDefined();

    rerender({
      items: [workItem("block-1", ESSAY, "2026-09-09T20:00:00.000Z", "2026-09-09T20:45:00.000Z")],
    });

    const after = screen.getByRole("button", { name: /History essay/ });
    expect(within(after).getByText("1h 15m of 2h scheduled")).toBeDefined();
    expect(after.getAttribute("aria-label")).toContain("1h 15m of 2h scheduled");
  });

  it("opens Find Time from a row's F key, lists the engine's candidates, and schedules one", async () => {
    const { onScheduleTask } = renderDrawer();

    const row = screen.getByRole("button", { name: /statistics homework/ });
    row.focus();
    fireEvent.keyDown(row, { key: "f" });

    const dialog = screen.getByRole("dialog", { name: "Find time" });
    expect(within(dialog).getByText("Finish statistics homework")).toBeDefined();
    expect(engine.findTime).toHaveBeenCalledWith(
      expect.objectContaining({
        task: { id: "task-homework", title: "Finish statistics homework", dueDate: null },
        durationMinutes: 45,
        now: NOW,
        snapMinutes: 15,
      }),
    );
    expect(within(dialog).getByText(CANDIDATE.explanation)).toBeDefined();

    const schedule = within(dialog).getByRole("button", { name: "Schedule" });
    await waitFor(() => expect(document.activeElement).toBe(schedule));
    fireEvent.click(schedule);

    expect(onScheduleTask).toHaveBeenCalledWith("task-homework", CANDIDATE.span);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(row));
  });

  it("opens Find Time on activation too", () => {
    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: /Lab report/ }));

    expect(screen.getByRole("dialog", { name: "Find time" })).toBeDefined();
  });

  it("opens the manual dialog from a row's S key and commits an estimate-length block", async () => {
    const { onScheduleTask } = renderDrawer();

    const row = screen.getByRole("button", { name: /statistics homework/ });
    row.focus();
    fireEvent.keyDown(row, { key: "s" });

    expect(screen.getByRole("dialog", { name: "Schedule task" })).toBeDefined();
    expect(engine.findTime).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(onScheduleTask).toHaveBeenCalledWith("task-homework", {
      date: "2026-09-08",
      startMinutes: 540,
      endMinutes: 585,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(row));
  });

  it("returns focus to the row after Find Time hands over to the manual form and closes", async () => {
    const { onScheduleTask } = renderDrawer();

    const row = screen.getByRole("button", { name: /History essay/ });
    row.focus();
    fireEvent.keyDown(row, { key: "F" });
    fireEvent.click(screen.getByRole("button", { name: "Pick a time instead" }));

    expect(screen.getByRole("dialog", { name: "Schedule task" })).toBeDefined();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onScheduleTask).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(row));
  });

  // Scheduling removes the row in the same frame the block appears, so the
  // dialog's opener is gone by the time focus would return to it.
  describe("focus after scheduling removes the row it came from", () => {
    const READING = planTask({ id: "task-reading", title: "Reading", estimatedMinutes: 30 });
    const TWO_UNSCHEDULED: PlanningData = { ...PLAN, unscheduled: [HOMEWORK, READING] };

    function Board({ deferApply = false }: { deferApply?: boolean }) {
      const [items, setItems] = React.useState<readonly CalendarItem[]>([]);
      const [queued, setQueued] = React.useState<CalendarItem | null>(null);
      const schedule = (taskId: string) => {
        const task = TWO_UNSCHEDULED.unscheduled.find((candidate) => candidate.id === taskId)!;
        const block = workItem(
          `optimistic-${taskId}`,
          task,
          "2026-09-08T13:00:00.000Z",
          "2026-09-08T13:45:00.000Z",
        );
        if (deferApply) setQueued(block);
        else setItems((current) => [...current, block]);
      };
      return (
        <>
          <button
            type="button"
            onClick={() => {
              if (queued) setItems((current) => [...current, queued]);
            }}
          >
            apply
          </button>
          <PlanningDrawer
            {...drawerProps({ plan: TWO_UNSCHEDULED, items, onScheduleTask: schedule })}
          />
        </>
      );
    }

    it("lands on the next row when the row leaves as the dialog closes", async () => {
      render(<Board />);
      const homework = screen.getByRole("button", { name: /statistics homework/ });
      const reading = screen.getByRole("button", { name: /^Reading/ });

      homework.focus();
      fireEvent.keyDown(homework, { key: "s" });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("button", { name: /statistics homework/ })).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(reading));
      expect(document.activeElement).not.toBe(document.body);
    });

    it("lands on the next row when the row leaves after the dialog has closed", async () => {
      // The optimistic commit is a transition and may land a frame after the
      // dialog's close.
      render(<Board deferApply />);
      const homework = screen.getByRole("button", { name: /statistics homework/ });
      const reading = screen.getByRole("button", { name: /^Reading/ });

      homework.focus();
      fireEvent.keyDown(homework, { key: "s" });
      fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
      await waitFor(() => expect(document.activeElement).toBe(homework));

      fireEvent.click(screen.getByRole("button", { name: "apply" }));

      expect(screen.queryByRole("button", { name: /statistics homework/ })).toBeNull();
      expect(document.activeElement).toBe(reading);
    });

    it("lands on the next row from Find Time as well", async () => {
      render(<Board />);
      const homework = screen.getByRole("button", { name: /statistics homework/ });
      const reading = screen.getByRole("button", { name: /^Reading/ });

      homework.focus();
      fireEvent.keyDown(homework, { key: "f" });
      const schedule = within(screen.getByRole("dialog", { name: "Find time" })).getByRole(
        "button",
        { name: "Schedule" },
      );
      await waitFor(() => expect(document.activeElement).toBe(schedule));
      fireEvent.click(schedule);

      await waitFor(() => expect(document.activeElement).toBe(reading));
    });
  });

  describe("as a sheet", () => {
    it("presents the same sections and hint in a dialog named for the drawer", () => {
      renderDrawer({ presentation: "sheet" });

      const sheet = screen.getByRole("dialog", { name: "Plan my week" });
      const headings = within(sheet)
        .getAllByRole("heading")
        .map((heading) => heading.textContent);
      for (const title of ["Overdue", "Due this week", "Unscheduled", "Habits", "Weekly goals"]) {
        expect(headings).toContain(title);
      }
      expect(within(sheet).getByRole("button", { name: /statistics homework/ })).toBeDefined();
      expect(within(sheet).getByText(/Drag a task onto the week/)).toBeDefined();
      expect(sheet.querySelector('[data-slot="side-panel"]')).toBeNull();
    });

    it("renders nothing while closed", () => {
      renderDrawer({ presentation: "sheet", open: false });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByText("Plan my week")).toBeNull();
    });

    it("still opens the keyboard routes from a row", () => {
      renderDrawer({ presentation: "sheet" });

      const row = screen.getByRole("button", { name: /statistics homework/ });
      row.focus();
      fireEvent.keyDown(row, { key: "s" });

      expect(screen.getByRole("dialog", { name: "Schedule task" })).toBeDefined();
    });
  });

  it("keeps a pending row in the tab order but opens nothing from it", () => {
    renderDrawer({ pendingTaskIds: new Set(["task-homework"]) });

    const row = screen.getByRole("button", { name: /statistics homework/ });
    expect(row.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "f" });
    fireEvent.keyDown(row, { key: "s" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists weekly goals read-only: a title with its target, or a phrase from the metric, and a done mark", () => {
    renderDrawer();

    const goals = within(sectionFor("Weekly goals")).getAllByRole("listitem");
    expect(goals).toHaveLength(2);
    expect(goals[0]?.textContent).toBe("Ship the essay3 tasks");
    expect(goals[0]?.getAttribute("data-done")).toBeNull();
    expect(goals[1]?.textContent).toBe("Focus 5hDone");
    expect(goals[1]?.getAttribute("data-done")).toBe("true");
    expect(within(sectionFor("Weekly goals")).queryByRole("button")).toBeNull();
  });

  it("shows the keyboard hint once, with its keys as glyphs", () => {
    renderDrawer();

    const hint = screen.getByText(/Drag a task onto the week/);
    expect(hint.textContent).toBe(
      "Drag a task onto the week, press F to find a time, or S to pick one.",
    );
    expect(hint.querySelectorAll("kbd")).toHaveLength(2);
  });
});
