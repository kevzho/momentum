import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import { ianaTimeZone, instant, localDate, localTime } from "@momentum/core/time";
import type { LocalDate, WorkingHours } from "@momentum/core/types";
import { AnnouncerProvider } from "@momentum/ui/components/announcer";
import { TooltipProvider } from "@momentum/ui/components/tooltip";

import { CalendarView, DragGhost } from "@/features/calendar/components/calendar-view";
import type { CalendarParams } from "@/features/calendar/navigation";
import type {
  CalendarItem,
  CalendarSettings,
  CalendarWeekData,
  PlanningData,
  WorkBlockContext,
} from "@/features/calendar/types";
import { UserSettingsProvider } from "@/lib/time/user-settings";

const { actions, router } = vi.hoisted(() => ({
  actions: {
    updateBlock: vi.fn(),
    rescheduleBlock: vi.fn(),
  },
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("@momentum/ui/components/toast", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/features/calendar/actions", () => ({
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
  deleteOccurrence: vi.fn(),
  rescheduleBlock: (input: unknown) => actions.rescheduleBlock(input),
  rescheduleOccurrence: vi.fn(),
  scheduleTask: vi.fn(),
  setBlockCompletion: vi.fn(),
  updateBlock: (input: unknown) => actions.updateBlock(input),
}));

// A `'use server'` module reaches `server-only` through `requireSession`.
vi.mock("@/features/habits/actions", () => ({ addHabitToWeek: vi.fn() }));

const TZ = ianaTimeZone("America/New_York");
const TODAY = localDate("2026-09-07");
const DAYS: readonly LocalDate[] = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
].map(localDate);

const SETTINGS: CalendarSettings = {
  timezone: TZ,
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

const PLAN: PlanningData = {
  overdue: [],
  dueInRange: [],
  unscheduled: [],
  habits: [],
  weeklyGoals: [],
  workingHours: WORKING_HOURS,
  focusWindows: [],
};

const WORK: WorkBlockContext = {
  taskId: "task-1",
  taskTitle: "History essay",
  taskCompletedAt: null,
  taskDueDate: null,
  taskEstimatedMinutes: 120,
  blockCount: 2,
  completesTask: false,
};

function item(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "block-1",
    blockId: "block-1",
    kind: "work",
    title: "History essay",
    description: null,
    startAt: instant("2026-09-07T20:00:00.000Z"),
    endAt: instant("2026-09-07T21:00:00.000Z"),
    allDay: false,
    ownColor: null,
    color: "amber",
    completedAt: null,
    occurrence: null,
    work: WORK,
    habitId: null,
    habitRecordable: false,
    ...overrides,
  };
}

const PARAMS: CalendarParams = { anchor: TODAY, view: "week" };

function renderBoard(items: readonly CalendarItem[], newEvent = false) {
  const data: CalendarWeekData = {
    rangeStart: DAYS[0]!,
    days: DAYS,
    today: TODAY,
    items,
    plan: PLAN,
  };

  return render(
    <UserSettingsProvider settings={{ timezone: TZ, weekStart: 1, snapMinutes: 15 }}>
      <TooltipProvider>
        <AnnouncerProvider>
          <CalendarView data={data} params={PARAMS} newEvent={newEvent} />
        </AnnouncerProvider>
      </TooltipProvider>
    </UserSettingsProvider>,
  );
}

/** Opens the block editor the way a user does, then saves without changing anything. */
function saveFirstBlock(view: ReturnType<typeof renderBoard>) {
  const block = view.container.querySelector<HTMLElement>('[data-slot="block-shell"]');
  fireEvent.click(block!);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  router.replace.mockClear();
  actions.updateBlock.mockReset().mockResolvedValue({ ok: true, data: {} });
  actions.rescheduleBlock.mockReset().mockResolvedValue({ ok: true, data: {} });
});

describe("saving a block from the editor", () => {
  it("sends no title for a work block, so the column keeps resolving from the task", () => {
    saveFirstBlock(renderBoard([item()]));

    return waitFor(() => {
      expect(actions.updateBlock).toHaveBeenCalledTimes(1);
      const [input] = actions.updateBlock.mock.calls[0] as [Record<string, unknown>];
      expect("title" in input).toBe(false);
      expect(input.id).toBe("block-1");
    });
  });

  it("sends no title for a habit block either, which borrows its habit's name", () => {
    saveFirstBlock(renderBoard([item({ kind: "habit", title: "Read", work: null, habitId: "h" })]));

    return waitFor(() => {
      const [input] = actions.updateBlock.mock.calls[0] as [Record<string, unknown>];
      expect("title" in input).toBe(false);
    });
  });

  it("sends the title for an event, which is the one kind that owns one", () => {
    saveFirstBlock(renderBoard([item({ kind: "event", title: "Chemistry lecture", work: null })]));

    return waitFor(() => {
      const [input] = actions.updateBlock.mock.calls[0] as [Record<string, unknown>];
      expect(input.title).toBe("Chemistry lecture");
    });
  });
});

describe("the Plan panel toggle", () => {
  it("takes focus back when the panel's own close button hides it", () => {
    const view = renderBoard([]);

    // Both controls read "Hide plan panel"; the header toggle is the pressed one.
    const toggle = screen.getByRole("button", { name: "Hide plan panel", pressed: true });
    const panel = view.container.querySelector<HTMLElement>('[data-slot="side-panel"]');
    const hide = within(panel!).getByRole("button", { name: "Hide plan panel" });

    hide.focus();
    fireEvent.click(hide);

    expect(view.container.querySelector('[data-slot="side-panel"]')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect(document.activeElement).not.toBe(document.body);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the Plan panel below lg", () => {
  function narrow(): void {
    const query = (media: string): MediaQueryList => ({
      media,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    vi.stubGlobal("matchMedia", query);
  }

  // Not `unstubAllGlobals`: that would also drop the suite-wide ResizeObserver stub.
  afterEach(() => vi.stubGlobal("matchMedia", undefined));

  it("opens the plan as a sheet from the header toggle, closed by default", () => {
    narrow();
    const view = renderBoard([]);

    expect(view.container.querySelector('[data-slot="side-panel"]')).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show plan panel" });
    expect(toggle.getAttribute("aria-haspopup")).toBe("dialog");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    expect(screen.getByRole("dialog", { name: "Plan my week" })).toBeDefined();
    // The modal has hidden the page behind it from queries by role.
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("Hide plan panel");
  });

  it("returns focus to the toggle when the sheet closes", async () => {
    narrow();
    renderBoard([]);
    const toggle = screen.getByRole("button", { name: "Show plan panel" });

    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByRole("dialog", { name: "Plan my week" })).toBeDefined();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });
});

describe("the drag ghost", () => {
  it("reads a task's length in the product's one duration convention", () => {
    render(
      <DragGhost
        settings={SETTINGS}
        drag={{
          item: null,
          data: {
            type: "task",
            taskId: "task-1",
            title: "History essay",
            durationMinutes: 135,
          },
        }}
      />,
    );

    expect(screen.getByText("2h 15m")).toBeDefined();
  });
});

describe("the palette's Add event intent", () => {
  it("opens a create draft and drops the intent from the URL", async () => {
    renderBoard([item()], true);

    const title = await screen.findByLabelText<HTMLInputElement>("Title");
    expect(title.value).toBe("");
    expect(title.hasAttribute("readonly")).toBe(false);
    expect(router.replace).toHaveBeenCalledWith("/calendar");
  });

  it("opens nothing without the intent", () => {
    renderBoard([item()]);
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
