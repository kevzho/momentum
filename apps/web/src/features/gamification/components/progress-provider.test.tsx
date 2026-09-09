import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { instant } from "@momentum/core/time";

import type { ProgressBadge } from "@/features/gamification/types";

/**
 * Celebration, and — mostly — the absence of it.
 *
 * specs/08-gamification.md is more specific about what must *not* happen than
 * about what must: no confetti for every checkbox, celebration reserved for a
 * level up, an achievement and a weekly goal, and never a queue of toasts. Each
 * of those is a case below.
 */

vi.mock("@momentum/ui/components/toast", () => ({
  toast: {
    xp: vi.fn(),
    celebrate: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const { toast } = await import("@momentum/ui/components/toast");
const { AnnouncerProvider } = await import("@momentum/ui/components/announcer");
const { ProgressProvider } = await import("@/features/gamification/components/progress-provider");

function badgeOf(overrides: Partial<ProgressBadge> = {}): ProgressBadge {
  return {
    level: 5,
    xpTotal: 900,
    xpIntoLevel: 100,
    xpForNextLevel: 318,
    fraction: 100 / 318,
    xpRemaining: 218,
    coins: 40,
    frame: null,
    unlocked: [],
    weeklyGoalsClaimed: 0,
    ...overrides,
  };
}

const UNLOCK = {
  key: "first_step",
  name: "First step",
  unlockedAt: instant("2026-09-07T12:00:00.000Z"),
};

describe("ProgressProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("celebrates nothing on first render", () => {
    render(<ProgressProvider badge={badgeOf({ unlocked: [UNLOCK] })} />);

    expect(toast.celebrate).not.toHaveBeenCalled();
    expect(toast.xp).not.toHaveBeenCalled();
  });

  it("shows a small XP toast when a total moves and nothing else changed", () => {
    const { rerender } = render(<ProgressProvider badge={badgeOf()} />);
    rerender(<ProgressProvider badge={badgeOf({ xpTotal: 915, xpIntoLevel: 115 })} />);

    expect(toast.xp).toHaveBeenCalledWith(15);
    expect(toast.celebrate).not.toHaveBeenCalled();
  });

  it("celebrates a level up, and does not also toast the XP that caused it", () => {
    const { rerender } = render(<ProgressProvider badge={badgeOf()} />);
    rerender(<ProgressProvider badge={badgeOf({ level: 6, xpTotal: 1_200 })} />);

    expect(toast.celebrate).toHaveBeenCalledTimes(1);
    expect(toast.celebrate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "level", title: "Level 6" }),
    );
    expect(toast.xp).not.toHaveBeenCalled();
  });

  it("celebrates an achievement in preference to the level it arrived with", () => {
    const { rerender } = render(<ProgressProvider badge={badgeOf()} />);
    rerender(
      <ProgressProvider badge={badgeOf({ level: 6, xpTotal: 1_200, unlocked: [UNLOCK] })} />,
    );

    expect(toast.celebrate).toHaveBeenCalledTimes(1);
    expect(toast.celebrate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "achievement", title: "First step" }),
    );
  });

  it("never queues celebrations: two unlocks at once are one toast", () => {
    const second = { key: "deep_work", name: "Deep work", unlockedAt: UNLOCK.unlockedAt };
    const { rerender } = render(<ProgressProvider badge={badgeOf()} />);
    rerender(<ProgressProvider badge={badgeOf({ unlocked: [UNLOCK, second] })} />);

    expect(toast.celebrate).toHaveBeenCalledTimes(1);
  });

  it("celebrates a weekly goal", () => {
    const { rerender } = render(<ProgressProvider badge={badgeOf()} />);
    rerender(<ProgressProvider badge={badgeOf({ weeklyGoalsClaimed: 1 })} />);

    expect(toast.celebrate).toHaveBeenCalledWith(expect.objectContaining({ kind: "goal" }));
  });

  it("says nothing when the same props render again", () => {
    const badge = badgeOf({ unlocked: [UNLOCK] });
    const { rerender } = render(<ProgressProvider badge={badge} />);
    rerender(<ProgressProvider badge={{ ...badge }} />);
    rerender(<ProgressProvider badge={{ ...badge }} />);

    expect(toast.celebrate).not.toHaveBeenCalled();
    expect(toast.xp).not.toHaveBeenCalled();
  });

  /*
   * One live region, one announcement. `toast.xp` and `toast.celebrate` say
   * nothing themselves and sonner's own region is switched off in the toast
   * primitive, so this component is the only voice for an XP change — and it
   * speaks through the `Announcer`, once, in the same region as everything
   * else (docs/ARCHITECTURE.md §15).
   */
  it("announces an XP change exactly once, through the Announcer", async () => {
    const { rerender } = render(
      <AnnouncerProvider>
        <ProgressProvider badge={badgeOf()} />
      </AnnouncerProvider>,
    );
    rerender(
      <AnnouncerProvider>
        <ProgressProvider badge={badgeOf({ xpTotal: 915, xpIntoLevel: 115 })} />
      </AnnouncerProvider>,
    );

    expect(toast.xp).toHaveBeenCalledWith(15);
    // The announcer sets its text on the next animation frame.
    const spoken = () =>
      [...document.querySelectorAll("[aria-live]")]
        .map((region) => region.textContent ?? "")
        .filter((text) => text !== "");
    await waitFor(() => expect(spoken()).toEqual(["15 XP earned"]));
  });

  it("never announces a loss when a total somehow goes down", () => {
    // Nothing in the product lowers XP (Domain Rule 7), and if a number ever
    // arrived lower this must stay silent rather than invent a "-20 XP".
    const { rerender } = render(<ProgressProvider badge={badgeOf()} />);
    rerender(<ProgressProvider badge={badgeOf({ xpTotal: 800, level: 4 })} />);

    expect(toast.xp).not.toHaveBeenCalled();
    expect(toast.celebrate).not.toHaveBeenCalled();
  });
});
