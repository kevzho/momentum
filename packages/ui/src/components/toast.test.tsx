import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

const sonner = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  custom: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: sonner,
  Toaster: React.forwardRef<HTMLElement, { className?: string }>(function Toaster(props, ref) {
    return <section ref={ref} aria-live="polite" data-sonner-toaster className={props.className} />;
  }),
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));

import { AnnouncerProvider } from "@momentum/ui/components/announcer";
import { Toaster, toast } from "@momentum/ui/components/toast";

describe("toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps an error that offers an action until it is dismissed", () => {
    const onClick = vi.fn();
    toast.error("Could not reach the server.", { action: { label: "Retry", onClick } });
    expect(sonner.error).toHaveBeenCalledWith(
      "Could not reach the server.",
      expect.objectContaining({ duration: Infinity, action: { label: "Retry", onClick } }),
    );
  });

  it("lets an error without an action, or with an explicit duration, use the default", () => {
    toast.error("Saved nothing.");
    expect(sonner.error).toHaveBeenLastCalledWith("Saved nothing.", { duration: undefined });

    toast.error("Brief.", { duration: 2000, action: { label: "Undo", onClick: vi.fn() } });
    expect(sonner.error).toHaveBeenLastCalledWith(
      "Brief.",
      expect.objectContaining({ duration: 2000 }),
    );
  });

  it("speaks a message toast through the Announcer, and an XP toast not at all", async () => {
    vi.useFakeTimers();
    try {
      render(
        <AnnouncerProvider>
          <Toaster />
        </AnnouncerProvider>,
      );

      expect(document.querySelector("[data-sonner-toaster]")?.getAttribute("aria-live")).toBe(
        "off",
      );

      const polite = document.querySelector("[aria-live=polite]");
      expect(polite).not.toBeNull();

      await act(async () => {
        toast.error("Could not reach the server.", { description: "Nothing was saved." });
        await vi.runAllTimersAsync();
      });
      expect(polite?.textContent).toBe("Could not reach the server. Nothing was saved.");

      await act(async () => {
        toast.xp(15);
        toast.celebrate({ kind: "goal", title: "Weekly goal reached" });
        await vi.runAllTimersAsync();
      });
      // The caller announces XP itself.
      expect(polite?.textContent).toBe("Could not reach the server. Nothing was saved.");
      expect(sonner.custom).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opts the toaster back into pointer events, for use under a modal", () => {
    render(<Toaster />);
    expect(document.querySelector("[data-sonner-toaster]")?.className).toContain(
      "pointer-events-auto",
    );
  });
});
