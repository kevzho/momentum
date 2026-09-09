import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Dialog, DialogContent, DialogTitle } from "@momentum/ui/components/dialog";
import { Sheet, SheetContent, SheetTitle } from "@momentum/ui/components/sheet";

/** Radix wires its outside-pointer listener a tick after the layer mounts. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A press, as Radix sees one: it decides on the click that follows the pointer down. */
function press(target: Element) {
  fireEvent.pointerDown(target);
  fireEvent.click(target);
}

function Toaster() {
  return (
    <div data-sonner-toaster="">
      <button type="button">Retry</button>
    </div>
  );
}

describe("modal surfaces and the toaster", () => {
  it("keeps a dialog open when the press lands on a toast, and closes it for the overlay", async () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Quick add</DialogTitle>
          </DialogContent>
        </Dialog>
        <Toaster />
      </>,
    );
    await settle();

    press(screen.getByRole("button", { name: "Retry", hidden: true }));
    expect(onOpenChange).not.toHaveBeenCalled();

    press(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does the same for a sheet, and still runs the caller's own handler", async () => {
    const onOpenChange = vi.fn();
    const onInteractOutside = vi.fn();
    render(
      <>
        <Sheet open onOpenChange={onOpenChange}>
          <SheetContent onInteractOutside={onInteractOutside}>
            <SheetTitle>Task</SheetTitle>
          </SheetContent>
        </Sheet>
        <Toaster />
      </>,
    );
    await settle();

    press(screen.getByRole("button", { name: "Retry", hidden: true }));
    expect(onInteractOutside).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();

    press(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
