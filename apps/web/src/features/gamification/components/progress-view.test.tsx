import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_QUEST_FACTS, questProgress } from "@momentum/core/gamification";
import { ianaTimeZone, instant, localDate } from "@momentum/core/time";
import type { QuestDefinition } from "@momentum/core/types";

import { PROGRESS_COPY } from "@/features/gamification/copy";
import type { ProgressPageData, QuestRow } from "@/features/gamification/types";
import type { ActionResult } from "@/lib/actions/result";

/**
 * The progress page, from the island down.
 *
 * What is worth asserting here — and cannot be asserted anywhere else — is the
 * **contract with the server**: what the client sends when a user presses each
 * control. Domain Rule 6 says the client may name a row and nothing more, and
 * this is the only place that claim is checked against the code that runs.
 *
 * The award arithmetic is `packages/core/src/gamification`; the fact that the
 * database refuses an early claim is `packages/db/tests/gamification.test.ts`.
 */

type Action = (input: unknown) => Promise<ActionResult<null>>;

const actions = vi.hoisted(() => {
  const ok: Action = () => Promise.resolve({ ok: true, data: null });
  return {
    claimQuest: vi.fn<Action>(ok),
    claimWeeklyGoal: vi.fn<Action>(ok),
    createWeeklyGoal: vi.fn<Action>(ok),
    deleteWeeklyGoal: vi.fn<Action>(ok),
    equipCosmetic: vi.fn<Action>(ok),
    purchaseCosmetic: vi.fn<Action>(ok),
  };
});

vi.mock("@/features/gamification/actions", () => actions);
vi.mock("@momentum/ui/components/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    xp: vi.fn(),
    celebrate: vi.fn(),
  },
}));

const { toast } = await import("@momentum/ui/components/toast");
const { ProgressView } = await import("@/features/gamification/components/progress-view");

const TZ = ianaTimeZone("America/New_York");
const ASSIGNMENT_ID = "ad72fcea-d19a-d1b0-3a5e-0f7f5a1b2c3d";

function definitionOf(overrides: Partial<QuestDefinition> = {}): QuestDefinition {
  return {
    id: "quest-def-1",
    key: "daily_three_tasks",
    period: "daily",
    metric: "tasks_completed",
    target: 3,
    xpReward: 20,
    coinReward: 5,
    title: "Three down",
    description: "Complete three tasks today.",
    active: true,
    ...overrides,
  };
}

function questOf(value: number, overrides: Partial<QuestRow> = {}): QuestRow {
  const definition = overrides.definition ?? definitionOf();
  const progress = questProgress(
    { ...EMPTY_QUEST_FACTS, tasksCompleted: value },
    definition.metric,
    definition.target,
  );
  return {
    // The shape the database mints: `md5(...)::uuid`, version nibble `d`. What
    // a Claim actually sends, and what the real schema has to accept.
    assignmentId: ASSIGNMENT_ID,
    definition,
    progress,
    completedAt: null,
    claimable: progress.met,
    ...overrides,
  };
}

function dataOf(overrides: Partial<ProgressPageData> = {}): ProgressPageData {
  return {
    timezone: TZ,
    today: localDate("2026-09-07"),
    weekStart: localDate("2026-09-07"),
    badge: {
      level: 5,
      xpTotal: 900,
      xpIntoLevel: 100,
      xpForNextLevel: 318,
      fraction: 100 / 318,
      xpRemaining: 218,
      coins: 60,
      frame: null,
      unlocked: [],
      weeklyGoalsClaimed: 0,
    },
    todayFacts: EMPTY_QUEST_FACTS,
    weekFacts: EMPTY_QUEST_FACTS,
    daily: [],
    weekly: [],
    goals: [],
    achievements: [
      {
        definition: {
          id: "a1",
          key: "first_step",
          name: "First step",
          description: "Complete your first task.",
          sortOrder: 1,
        },
        unlockedAt: null,
      },
    ],
    cosmetics: [],
    recent: [],
    cappedToday: [{ source: "task", awarded: 30, cap: 200 }],
    ...overrides,
  };
}

describe("the claim control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is not offered for a quest that is not finished", () => {
    render(<ProgressView data={dataOf({ daily: [questOf(1)] })} />);

    expect(screen.queryByRole("button", { name: PROGRESS_COPY.quests.claim })).toBeNull();
    expect(screen.getByText("1 of 3 · tasks completed")).toBeTruthy();
  });

  it("sends the assignment id and nothing else", async () => {
    render(<ProgressView data={dataOf({ daily: [questOf(3)] })} />);

    fireEvent.click(screen.getByRole("button", { name: PROGRESS_COPY.quests.claim }));

    await waitFor(() => expect(actions.claimQuest).toHaveBeenCalledTimes(1));
    // No amount, no progress, no target: the server decides all three.
    expect(actions.claimQuest).toHaveBeenCalledWith({ id: ASSIGNMENT_ID });
  });

  it("is replaced by a done marker once the quest is claimed", () => {
    render(
      <ProgressView
        data={dataOf({
          daily: [
            questOf(3, { completedAt: instant("2026-09-07T18:00:00.000Z"), claimable: false }),
          ],
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: PROGRESS_COPY.quests.claim })).toBeNull();
    expect(screen.getByText(PROGRESS_COPY.quests.claimed)).toBeTruthy();
  });

  it("refuses a second press while the first write is in flight", async () => {
    let release: (() => void) | undefined;
    actions.claimQuest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: null });
        }),
    );

    render(<ProgressView data={dataOf({ daily: [questOf(3)] })} />);
    const button = screen.getByRole("button", { name: PROGRESS_COPY.quests.claim });

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(actions.claimQuest).toHaveBeenCalledTimes(1);
    release?.();
  });

  it("keeps the control focusable while it writes (Domain Rule 10)", async () => {
    render(<ProgressView data={dataOf({ daily: [questOf(3)] })} />);
    const button = screen.getByRole("button", { name: PROGRESS_COPY.quests.claim });

    button.focus();
    fireEvent.click(button);

    // A control that disabled itself would blur to <body> by working.
    expect(document.activeElement).toBe(button);
    await waitFor(() => expect(actions.claimQuest).toHaveBeenCalled());
  });

  it("shows the server's own message when a claim is refused", async () => {
    actions.claimQuest.mockResolvedValueOnce({
      ok: false,
      error: { code: "validation", message: "that quest is not finished yet" },
    });

    render(<ProgressView data={dataOf({ daily: [questOf(3)] })} />);
    fireEvent.click(screen.getByRole("button", { name: PROGRESS_COPY.quests.claim }));

    // No Retry: a refusal cannot be retried into success.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("that quest is not finished yet", {
        action: undefined,
      }),
    );
  });

  it("offers Retry when the server could not save, and Retry sends the same id", async () => {
    actions.claimQuest.mockResolvedValueOnce({
      ok: false,
      error: { code: "unavailable", message: "Momentum could not save that change." },
    });

    render(<ProgressView data={dataOf({ daily: [questOf(3)] })} />);
    fireEvent.click(screen.getByRole("button", { name: PROGRESS_COPY.quests.claim }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Momentum could not save that change.",
        expect.objectContaining({ action: expect.objectContaining({ label: "Retry" }) }),
      ),
    );

    const options = vi.mocked(toast.error).mock.calls.at(-1)?.[1] as
      { action?: { onClick: () => void } } | undefined;
    options?.action?.onClick();

    await waitFor(() => expect(actions.claimQuest).toHaveBeenCalledTimes(2));
    expect(actions.claimQuest).toHaveBeenLastCalledWith({ id: ASSIGNMENT_ID });
  });

  /*
   * The other half of "on failure" (Domain Rules §19): a call that rejects —
   * offline, a 5xx — takes the same path as a returned refusal rather than
   * reaching the route's error boundary.
   */
  it("keeps the page and offers Retry when the claim rejects instead of returning", async () => {
    actions.claimQuest.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<ProgressView data={dataOf({ daily: [questOf(3)] })} />);
    fireEvent.click(screen.getByRole("button", { name: PROGRESS_COPY.quests.claim }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Momentum could not reach the server. Your change was not saved.",
        expect.objectContaining({ action: expect.objectContaining({ label: "Retry" }) }),
      ),
    );
    // The control is live again rather than stuck reading as busy.
    const button = screen.getByRole("button", { name: PROGRESS_COPY.quests.claim });
    expect(button.hasAttribute("data-pending")).toBe(false);
  });

  it("does not swallow a write to a different row while one is in flight", async () => {
    let release: (() => void) | undefined;
    actions.claimQuest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: null });
        }),
    );

    render(<ProgressView data={dataOf({ daily: [questOf(3)] })} />);
    fireEvent.click(screen.getByRole("button", { name: PROGRESS_COPY.quests.claim }));

    // A goal set while the claim is still writing is a goal, not a press to drop.
    fireEvent.click(screen.getByRole("button", { name: PROGRESS_COPY.goals.add }));
    fireEvent.click(await screen.findByRole("button", { name: PROGRESS_COPY.goals.save }));

    await waitFor(() => expect(actions.createWeeklyGoal).toHaveBeenCalledTimes(1));
    expect(actions.createWeeklyGoal).toHaveBeenCalledWith(
      expect.objectContaining({ metric: "tasks_completed", target: 5 }),
    );
    release?.();
  });
});

/**
 * Domain Rule 10: the dialog is opened from a button rather than a
 * `DialogTrigger`, so nothing returns focus on its own. Escape, Cancel and
 * "Set goal" all have to put the keyboard user back on that button, never on
 * `<body>`.
 */
describe("the weekly goal dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function openFromKeyboard() {
    const opener = screen.getByRole("button", { name: PROGRESS_COPY.goals.add });
    opener.focus();
    fireEvent.click(opener);
    return opener;
  }

  it("returns focus to 'Set a goal' on Escape", async () => {
    render(<ProgressView data={dataOf()} />);
    const opener = openFromKeyboard();

    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to 'Set a goal' after the goal is set", async () => {
    render(<ProgressView data={dataOf()} />);
    const opener = openFromKeyboard();

    fireEvent.click(await screen.findByRole("button", { name: PROGRESS_COPY.goals.save }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(document.activeElement).not.toBe(document.body);
    await waitFor(() => expect(actions.createWeeklyGoal).toHaveBeenCalledTimes(1));
  });
});

describe("the shop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const frame = {
    id: "c1",
    key: "frame_copper",
    kind: "profile_frame" as const,
    name: "Copper frame",
    description: "A warm ring around your avatar.",
    price: 50,
    sortOrder: 1,
    available: true,
  };

  it("sends only the cosmetic id when buying", async () => {
    render(
      <ProgressView
        data={dataOf({
          cosmetics: [{ definition: frame, owned: false, equipped: false, affordable: true }],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Buy/ }));

    await waitFor(() => expect(actions.purchaseCosmetic).toHaveBeenCalledTimes(1));
    expect(actions.purchaseCosmetic).toHaveBeenCalledWith({ id: "c1" });
  });

  it("states the price instead of offering a control the balance cannot cover", () => {
    render(
      <ProgressView
        data={dataOf({
          badge: { ...dataOf().badge, coins: 10 },
          cosmetics: [{ definition: frame, owned: false, equipped: false, affordable: false }],
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /Buy/ })).toBeNull();
    expect(screen.getByText("50 coins — you have 10")).toBeTruthy();
  });

  it("does not sell a cosmetic the product cannot draw yet", () => {
    render(
      <ProgressView
        data={dataOf({
          cosmetics: [
            {
              definition: {
                ...frame,
                id: "c2",
                key: "theme_dusk",
                kind: "theme",
                available: false,
              },
              owned: false,
              equipped: false,
              affordable: true,
            },
          ],
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /Buy/ })).toBeNull();
    expect(screen.getByText(PROGRESS_COPY.cosmetics.notYet)).toBeTruthy();
  });

  it("wears something owned, sending the id and the new state", async () => {
    render(
      <ProgressView
        data={dataOf({
          cosmetics: [{ definition: frame, owned: true, equipped: false, affordable: true }],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: PROGRESS_COPY.cosmetics.equip }));

    await waitFor(() => expect(actions.equipCosmetic).toHaveBeenCalledTimes(1));
    expect(actions.equipCosmetic).toHaveBeenCalledWith({ id: "c1", equipped: true });
  });
});

describe("what the page states", () => {
  it("shows the level, the progress into it and the coin balance", () => {
    render(<ProgressView data={dataOf()} />);

    expect(screen.getByText("Level 5")).toBeTruthy();
    expect(screen.getByText("100 / 318 XP")).toBeTruthy();
    expect(screen.getByText("218 XP to level 6")).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();
  });

  it("states the day's caps and that reaching one removes nothing", () => {
    render(<ProgressView data={dataOf()} />);

    expect(screen.getByText("Tasks: 30 of 200 XP")).toBeTruthy();
    expect(screen.getByText(PROGRESS_COPY.caps.description)).toBeTruthy();
  });

  it("describes an achievement that is not yet earned without characterising anyone", () => {
    render(<ProgressView data={dataOf()} />);

    const list = screen.getByText("First step").closest("li");
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getByText(PROGRESS_COPY.achievements.locked)).toBeTruthy();
  });
});
