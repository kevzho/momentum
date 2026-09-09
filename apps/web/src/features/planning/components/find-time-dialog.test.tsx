import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import type {
  FindTimeCandidate,
  FindTimeInput,
  FindTimeResult,
  PlanningContext,
} from "@momentum/core/scheduling";
import { ianaTimeZone, instant, localDate, localTime } from "@momentum/core/time";
import type { LocalDate, WorkingHours } from "@momentum/core/types";

import type { CalendarSettings, PlanTask } from "@/features/calendar/types";
import {
  FindTimeDialog,
  type FindTimeDialogProps,
} from "@/features/planning/components/find-time-dialog";

const { findTimeMock } = vi.hoisted(() => ({ findTimeMock: vi.fn() }));

vi.mock("@momentum/core/scheduling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@momentum/core/scheduling")>();
  return {
    ...actual,
    findTime: (input: FindTimeInput): FindTimeResult => findTimeMock(input),
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

const CONTEXT: PlanningContext = {
  timezone: SETTINGS.timezone,
  workingHours: WORKING_HOURS,
  focusWindows: [],
  days: DAYS,
  today: TODAY,
};

const HOMEWORK: PlanTask = {
  id: "task-homework",
  title: "Finish statistics homework",
  priority: 4,
  estimatedMinutes: 45,
  dueDate: localDate("2026-09-10"),
  projectName: null,
  projectColor: null,
  scheduledOutsideMinutes: 0,
};

function candidate(
  date: string,
  startMinutes: number,
  explanation: string,
  overrides: Partial<FindTimeCandidate> = {},
): FindTimeCandidate {
  return {
    span: { date: localDate(date), startMinutes, endMinutes: startMinutes + 45 },
    startAt: instant(
      `${date}T${String(Math.floor(startMinutes / 60) + 4).padStart(2, "0")}:00:00.000Z`,
    ),
    endAt: instant(
      `${date}T${String(Math.floor(startMinutes / 60) + 4).padStart(2, "0")}:45:00.000Z`,
    ),
    score: {
      beforeDeadline: true,
      withinWorkingHours: true,
      conflicts: 0,
      fragments: 0,
      focusFit: 0,
    },
    openWindowMinutes: 120,
    overlaps: [],
    explanation,
    ...overrides,
  };
}

const FIRST = candidate(
  "2026-09-09",
  16 * 60,
  "Wednesday 4:00–4:45 PM — 2-hour open window before Thursday deadline.",
);
const SECOND = candidate(
  "2026-09-09",
  9 * 60,
  "Wednesday 9:00–9:45 AM — 1-hour open window before Thursday deadline.",
  { openWindowMinutes: 60 },
);

const FOUND: FindTimeResult = { outcome: "found", candidates: [FIRST, SECOND], note: null };

function renderDialog(overrides: Partial<FindTimeDialogProps> = {}) {
  const props: FindTimeDialogProps = {
    task: HOMEWORK,
    commitments: [],
    context: CONTEXT,
    settings: SETTINGS,
    days: DAYS,
    today: TODAY,
    now: NOW,
    onScheduleTask: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<FindTimeDialog {...props} />);
  return props;
}

beforeEach(() => {
  findTimeMock.mockReset();
  findTimeMock.mockReturnValue(FOUND);
});

describe("FindTimeDialog", () => {
  it("asks the engine with the task, its block length, the live board and the clock", () => {
    renderDialog();

    expect(findTimeMock).toHaveBeenCalledTimes(1);
    expect(findTimeMock).toHaveBeenCalledWith({
      task: { id: "task-homework", title: "Finish statistics homework", dueDate: "2026-09-10" },
      durationMinutes: 45,
      commitments: [],
      context: CONTEXT,
      now: NOW,
      snapMinutes: 15,
    });
  });

  it("counts from the start of today when the clock has not hydrated", () => {
    renderDialog({ now: null });

    expect(findTimeMock.mock.calls[0]?.[0]).toMatchObject({ now: "2026-09-08T04:00:00.000Z" });
  });

  it("lists the candidates in the engine's words, and focuses the first Schedule button", async () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Find time" });
    expect(within(dialog).getByText("Finish statistics homework")).toBeDefined();
    const rows = within(screen.getByRole("list", { name: "Suggested times" })).getAllByRole(
      "listitem",
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      `${FIRST.explanation}Schedule`,
      `${SECOND.explanation}Schedule`,
    ]);

    const buttons = within(dialog).getAllByRole("button", { name: "Schedule" });
    expect(buttons).toHaveLength(2);
    await waitFor(() => expect(document.activeElement).toBe(buttons[0]));
  });

  it("schedules a candidate's span verbatim, then closes", () => {
    const { onScheduleTask, onClose } = renderDialog();

    fireEvent.click(screen.getAllByRole("button", { name: "Schedule" })[1]!);

    expect(onScheduleTask).toHaveBeenCalledTimes(1);
    expect(onScheduleTask).toHaveBeenCalledWith("task-homework", SECOND.span);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the engine's note when it has one", () => {
    findTimeMock.mockReturnValue({
      outcome: "fallback-overlaps",
      candidates: [
        candidate("2026-09-09", 13 * 60, "Wednesday 1:00–1:45 PM — overlaps Chemistry lecture.", {
          score: {
            beforeDeadline: true,
            withinWorkingHours: true,
            conflicts: 1,
            fragments: 0,
            focusFit: 0,
          },
          overlaps: ["Chemistry lecture"],
        }),
      ],
      note: "No open slot fits before the deadline; these overlap existing blocks.",
    });
    renderDialog();

    expect(
      screen.getByText("No open slot fits before the deadline; these overlap existing blocks."),
    ).toBeDefined();
    expect(screen.getByText("Wednesday 1:00–1:45 PM — overlaps Chemistry lecture.")).toBeDefined();
  });

  it("offers only the note and the manual route when there is nothing to suggest", async () => {
    findTimeMock.mockReturnValue({
      outcome: "range-past",
      candidates: [],
      note: "Every day in this range is over.",
    });
    renderDialog();

    expect(screen.getByText("Every day in this range is over.")).toBeDefined();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
    const fallback = screen.getByRole("button", { name: "Pick a time instead" });
    await waitFor(() => expect(document.activeElement).toBe(fallback));
  });

  it("switches to the manual form for the same task, inside the same dialog", async () => {
    const { onScheduleTask, onClose } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Pick a time instead" }));

    // One dialog throughout, so the opener survives the switch.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Schedule task" })).toBeDefined();
    expect(screen.getByText("Finish statistics homework")).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Date")));

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(onScheduleTask).toHaveBeenCalledWith("task-homework", {
      date: "2026-09-08",
      startMinutes: 540,
      endMinutes: 585,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape without scheduling", () => {
    const { onScheduleTask, onClose } = renderDialog();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onScheduleTask).not.toHaveBeenCalled();
  });

  it("renders nothing without a task", () => {
    renderDialog({ task: null });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(findTimeMock).not.toHaveBeenCalled();
  });
});
