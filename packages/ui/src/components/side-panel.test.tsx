import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidePanel } from "@momentum/ui/components/side-panel";

/**
 * Domain Rule 10. The close button lives inside the panel it closes, so
 * pressing it removes the pressed element from the DOM. Nothing else restores
 * focus — this is not a modal and there is no Radix focus scope around it — so
 * the panel has to hand focus to the control that brings it back, or a
 * keyboard user lands on `<body>` and tabs from the top of the shell.
 */
describe("SidePanel", () => {
  function Harness({ withReturnFocus }: { withReturnFocus: boolean }) {
    const toggle = React.useRef<HTMLButtonElement>(null);
    const [open, setOpen] = React.useState(true);

    return (
      <>
        <button type="button" ref={toggle} onClick={() => setOpen(true)}>
          Show plan panel
        </button>
        <SidePanel
          title="Plan"
          open={open}
          onOpenChange={setOpen}
          closeLabel="Hide plan panel"
          returnFocusTo={withReturnFocus ? toggle : undefined}
        >
          <p>Unscheduled work</p>
        </SidePanel>
      </>
    );
  }

  it("moves focus to the re-opening control when it closes itself", () => {
    render(<Harness withReturnFocus />);

    const close = screen.getByRole("button", { name: "Hide plan panel" });
    close.focus();
    fireEvent.click(close);

    expect(screen.queryByText("Unscheduled work")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show plan panel" }));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("still closes when the caller has nowhere to send focus", () => {
    render(<Harness withReturnFocus={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Hide plan panel" }));

    expect(screen.queryByText("Unscheduled work")).toBeNull();
  });
});
