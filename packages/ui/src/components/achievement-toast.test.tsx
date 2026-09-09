import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AchievementToast } from "@momentum/ui/components/achievement-toast";
import { ProfileFrame, FRAME_RING, RENDERED_FRAMES } from "@momentum/ui/components/profile-frame";
import { XPToast } from "@momentum/ui/components/xp-toast";

/**
 * Celebration, and the accessibility floor under it.
 *
 * The acceptance criterion is specific: `prefers-reduced-motion` suppresses the
 * celebration animation. Suppressing the *message* would be a different and
 * much worse thing, so both halves are asserted — the flourish disappears, the
 * news does not.
 */

function matchMedia(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

describe("AchievementToast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("names what happened and what it was", () => {
    matchMedia(false);
    render(<AchievementToast kind="achievement" title="First step" />);

    expect(screen.getByText("Achievement unlocked")).toBeTruthy();
    expect(screen.getByText("First step")).toBeTruthy();
  });

  it("labels each of the three things worth celebrating, and only those", () => {
    matchMedia(false);
    const { rerender, container } = render(<AchievementToast kind="level" title="Level 6" />);
    expect(screen.getByText("Level up")).toBeTruthy();

    rerender(<AchievementToast kind="goal" title="Weekly goal reached" />);
    expect(screen.getByText("Weekly goal complete")).toBeTruthy();

    expect(
      container.querySelector("[data-slot='achievement-toast']")?.getAttribute("data-kind"),
    ).toBe("goal");
  });

  it("animates a flourish when motion is welcome", () => {
    matchMedia(false);
    const { container } = render(<AchievementToast kind="level" title="Level 6" />);

    expect(container.querySelector("[data-slot='flourish']")).not.toBeNull();
  });

  it("renders no flourish at all under prefers-reduced-motion", () => {
    matchMedia(true);
    const { container } = render(<AchievementToast kind="level" title="Level 6" />);

    // Not merely a zero-duration animation: the element is not in the tree.
    expect(container.querySelector("[data-slot='flourish']")).toBeNull();
    // The news still arrives.
    expect(screen.getByText("Level 6")).toBeTruthy();
    expect(screen.getByText("Level up")).toBeTruthy();
  });

  it("is skippable", () => {
    matchMedia(false);
    const onDismiss = vi.fn();
    render(<AchievementToast kind="level" title="Level 6" onDismiss={onDismiss} />);

    screen.getByRole("button", { name: "Dismiss" }).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("XPToast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the amount the server awarded, and the reason when there is one", () => {
    matchMedia(false);
    render(<XPToast amount={12} reason='Completed "History essay"' />);

    expect(screen.getByText("+12 XP")).toBeTruthy();
    expect(screen.getByText('Completed "History essay"')).toBeTruthy();
  });

  it("does not animate when motion is unwelcome", () => {
    matchMedia(true);
    const { container } = render(<XPToast amount={12} />);

    expect(container.querySelector(".animate-in")).toBeNull();
  });
});

describe("ProfileFrame", () => {
  it("draws every frame the shop can sell", () => {
    // A key added to PROFILE_FRAME_KEYS without a style here is a type error;
    // this asserts the other direction — nothing is sold that is not drawn.
    for (const key of RENDERED_FRAMES) {
      expect(FRAME_RING[key], key).toBeTruthy();
    }
  });

  it("draws nothing when no frame is worn", () => {
    const { container } = render(
      <ProfileFrame frame={null}>
        <span>avatar</span>
      </ProfileFrame>,
    );

    const frame = container.querySelector("[data-slot='profile-frame']");
    expect(frame?.getAttribute("data-frame")).toBeNull();
    expect(frame?.className).not.toContain("ring-2");
  });

  it("draws the worn frame", () => {
    const { container } = render(
      <ProfileFrame frame="frame_copper">
        <span>avatar</span>
      </ProfileFrame>,
    );

    const frame = container.querySelector("[data-slot='profile-frame']");
    expect(frame?.getAttribute("data-frame")).toBe("frame_copper");
    expect(frame?.className).toContain("ring-2");
  });
});
