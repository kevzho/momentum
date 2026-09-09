import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OfflineNotice } from "@/components/offline-notice";

// Pins the claim: no offline store and no replay queue, so the notice must
// never promise a later sync.

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

function goOffline(): void {
  act(() => {
    setOnline(false);
    window.dispatchEvent(new Event("offline"));
  });
}

afterEach(() => setOnline(true));

describe("OfflineNotice", () => {
  it("says nothing while the connection is up", () => {
    setOnline(true);
    render(<OfflineNotice />);

    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("appears when the connection drops, without a remount", () => {
    setOnline(true);
    render(<OfflineNotice />);

    // A polite region inserted together with its message is frequently not announced.
    const region = screen.getByRole("status");
    goOffline();

    expect(region.textContent).toMatch(/offline/i);
    expect(screen.getByRole("status")).toBe(region);
  });

  it("tells the user both true things and promises nothing else", () => {
    setOnline(true);
    render(<OfflineNotice />);
    goOffline();

    const text = screen.getByRole("status").textContent ?? "";

    expect(text).toMatch(/may be out of date/i);
    expect(text).toMatch(/will not save/i);
    // The forbidden reassurances. There is no queue and no sync.
    expect(text).not.toMatch(/sync|queue|saved locally|when you (are|'re) back/i);
  });

  it("disappears again when the connection returns", () => {
    setOnline(true);
    render(<OfflineNotice />);
    goOffline();
    expect(screen.getByRole("status").textContent).toMatch(/offline/i);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("is a row in the layout, never an overlay over the chrome", () => {
    setOnline(true);
    render(<OfflineNotice />);
    goOffline();

    // An overlay covered the top bar at 393px; the notice takes a row of its own.
    const region = screen.getByRole("status");
    expect(region.className).not.toContain("fixed");
    expect(region.className).not.toContain("absolute");
    expect(region.className).not.toContain("pointer-events-none");
  });

  it("occupies nothing while there is nothing to say", () => {
    setOnline(true);
    render(<OfflineNotice />);

    // An empty row in a flex column must not push the frame down by a hair.
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");
    expect(region.className).toContain("empty:hidden");
  });
});
