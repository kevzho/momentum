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

/**
 * The board's job is routing intent to actions, so what is pinned here is the
 * argument it sends — the half no editor test can see. The actions themselves
 * are stubbed at the module boundary; nothing in this file talks to a database.
 */

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

// The board calls the habits feature's own action for "Add to week" (Phase 6),
// and a `'use server'` module reaches `server-only` through `requireSession`.
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
    // A work block's title is the *task's*, resolved on read: the column itself
    // is empty, which is what keeps the two from ever disagreeing.
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
    // `values.title` for a work block is the task's name, resolved on read
    // (`queries.ts`). Writing it back would stamp a copy into
    // `calendar_blocks.title`, and from then on the block shows that frozen
    // string while a rename of the task never reaches it (Domain Rule 2). The
    // field is read-only in the editor precisely so this cannot happen.
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
  /*
   * Domain Rule 10. Hiding the panel unmounts the button that was pressed to
   * hide it, and the panel is not a modal, so nothing restores focus on its
   * own: `SidePanel` sends focus wherever the board points it. The board has
   * to point it at this toggle — the one control that brings the panel back —
   * or focus lands on `<body>` and a keyboard user tabs from the top of the
   * shell again.
   */
  it("takes focus back when the panel's own close button hides it", () => {
    const view = renderBoard([]);

    // Both controls read "Hide plan panel" while the panel is open; the header
    // toggle is the one that is a pressed toggle.
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

/**
 * Below `lg` the panel has no room beside the calendar, so the toggle opens
 * the same content as a sheet — at every width there is a control that shows
 * the week plan (the mobile audit's "nothing hidden").
 */
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
    // The same element; the modal has hidden the page behind it from queries by role.
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
    // The row the ghost was dragged out of is still on screen underneath it,
    // showing `formatDuration` of the same number; a raw minute count here
    // would be the same fact in two formats.
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

/**
 * The command palette's "Add event" cannot open the editor itself — the editor
 * needs this island's week, grid and settings — so it navigates with
 * `?new=event` and the island honours the intent. Once.
 */
describe("the palette's Add event intent", () => {
  it("opens a create draft and drops the intent from the URL", async () => {
    renderBoard([item()], true);

    // A create draft, not an edit: the title field is editable and empty.
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
