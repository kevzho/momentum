import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidePanel } from "@momentum/ui/components/side-panel";

/** Not a modal: nothing but `returnFocusTo` keeps a keyboard user off `<body>` after the close button unmounts. */
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
