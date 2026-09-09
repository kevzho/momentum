import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { XPBar } from "@momentum/ui/components/xp-bar";

describe("XPBar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes progress to assistive technology", () => {
    render(<XPBar level={7} xpIntoLevel={1240} xpForNextLevel={2000} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("1240");
    expect(bar.getAttribute("aria-valuemax")).toBe("2000");
  });

  it("does not divide by zero when the next level is unknown", () => {
    render(<XPBar level={1} xpIntoLevel={0} xpForNextLevel={0} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  /**
   * The bar is server-rendered into the top bar on every authenticated route,
   * so the digits have to group identically on both sides of hydration. The
   * spy is the load-bearing half of this: on a machine whose default locale is
   * already en-US, a reverted `toLocaleString()` produces the same text.
   */
  it("groups digits with a pinned locale, never the host's", () => {
    const toLocaleString = vi.spyOn(Number.prototype, "toLocaleString");
    render(<XPBar level={7} xpIntoLevel={1240} xpForNextLevel={2000} />);

    expect(screen.getByText("1,240/2,000")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toBe(
      "Level 7 progress: 1,240 of 2,000 XP",
    );
    expect(toLocaleString).not.toHaveBeenCalled();
  });
});
