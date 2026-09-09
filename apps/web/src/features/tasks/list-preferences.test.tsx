import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ListPreferences } from "@/features/tasks/list-preferences";

/**
 * Sort and filter "persist within a session" — but persistence is the second
 * clause. The first is that they work. Storage can refuse a write (Safari in
 * private mode, site data blocked, a full quota), and when it does the change
 * still has to take effect: a toolbar whose every control snaps back is a
 * broken feature, not a forgotten preference.
 *
 * The store keeps module state, so each test loads a fresh copy of it.
 */

/** A minimal consumer: shows the live sort and offers one change. */
async function renderStore() {
  vi.resetModules();
  const { useListPreferences } = await import("@/features/tasks/list-preferences");

  function Harness() {
    const [preferences, setPreferences] = useListPreferences();
    return (
      <div>
        <output data-testid="sort">{preferences.sort}</output>
        <button type="button" onClick={() => setPreferences({ sort: "due" })}>
          Sort by due date
        </button>
      </div>
    );
  }

  render(<Harness />);
}

const sort = () => screen.getByTestId("sort").textContent;
const chooseDue = () => fireEvent.click(screen.getByRole("button", { name: "Sort by due date" }));

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

/** Stands in for a browser that refuses site data: every access throws. */
function blockStorage(): void {
  vi.stubGlobal("sessionStorage", {
    getItem: () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  });
}

describe("list preferences", () => {
  it("applies a change and remembers it for the session", async () => {
    await renderStore();
    expect(sort()).toBe("manual");

    chooseDue();

    expect(sort()).toBe("due");
    const stored = JSON.parse(
      window.sessionStorage.getItem("momentum.tasks.list") ?? "null",
    ) as ListPreferences | null;
    expect(stored?.sort).toBe("due");
  });

  it("still applies a change when storage refuses to keep it", async () => {
    blockStorage();
    await renderStore();
    expect(sort()).toBe("manual");

    chooseDue();

    // Only the persistence is lost. Re-reading storage here would return
    // nothing and snap the control back to the default.
    expect(sort()).toBe("due");
  });

  it("re-reads storage when another tab writes", async () => {
    window.sessionStorage.setItem(
      "momentum.tasks.list",
      JSON.stringify({ sort: "priority", direction: "asc", filter: {} }),
    );
    await renderStore();
    expect(sort()).toBe("priority");

    window.sessionStorage.setItem(
      "momentum.tasks.list",
      JSON.stringify({ sort: "title", direction: "asc", filter: {} }),
    );
    fireEvent(window, new Event("storage"));

    expect(sort()).toBe("title");
  });
});
