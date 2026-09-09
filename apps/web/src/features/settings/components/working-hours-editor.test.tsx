import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { localTime } from "@momentum/core/time";
import type { WorkingHours } from "@momentum/core/types";

import { WorkingHoursEditor } from "@/features/settings/components/working-hours-editor";

/**
 * The editor's contract: it reports the whole `WorkingHours` object with one
 * day changed, and nothing it does is a mutation. What is tested is the value
 * handed to `onChange` for each control, not the markup around it.
 */

const window = (start: string, end: string) => ({ start: localTime(start), end: localTime(end) });

const HOURS: WorkingHours = {
  0: [],
  1: [window("09:00", "17:00")],
  2: [window("09:00", "12:00"), window("13:00", "17:00")],
  3: [window("09:00", "17:00")],
  4: [window("09:00", "17:00")],
  5: [window("09:00", "15:00")],
  6: [],
};

function renderEditor(overrides: { weekStart?: 0 | 1 | 6; value?: WorkingHours } = {}) {
  const onChange = vi.fn();
  render(
    <WorkingHoursEditor
      value={overrides.value ?? HOURS}
      weekStart={overrides.weekStart ?? 1}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("the rows", () => {
  it("run in the user's own week order", () => {
    renderEditor({ weekStart: 0 });
    const group = screen.getByRole("group", { name: "Working hours" });
    const labels = within(group)
      .getAllByText(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/)
      .map((node) => node.textContent);

    expect(labels).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
  });

  it("start from Monday for a Monday week", () => {
    renderEditor({ weekStart: 1 });
    const group = screen.getByRole("group", { name: "Working hours" });
    const first = within(group).getAllByText(/^(Sunday|Monday|Saturday)$/)[0];
    expect(first?.textContent).toBe("Monday");
  });

  it("call a day with no windows a day off", () => {
    renderEditor();
    // Sunday and Saturday are the two empty days in the fixture.
    expect(screen.getAllByText("Day off")).toHaveLength(2);
  });
});

describe("adding a window", () => {
  it("starts an empty day at 09:00–17:00", () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Saturday window" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...HOURS, 6: [window("09:00", "17:00")] });
  });

  it("appends after the day's latest window, with a gap, and leaves the other days alone", () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Tuesday window" }));

    expect(onChange).toHaveBeenCalledWith({
      ...HOURS,
      2: [...HOURS[2], window("18:00", "21:00")],
    });
  });

  it("caps the new window at the last step of the day", () => {
    const { onChange } = renderEditor({
      value: { ...HOURS, 5: [window("09:00", "20:30")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Friday window" }));

    expect(onChange).toHaveBeenCalledWith({
      ...HOURS,
      5: [window("09:00", "20:30"), window("21:30", "23:45")],
    });
  });

  it("is not offered when the day has no room for another hour", () => {
    renderEditor({ value: { ...HOURS, 5: [window("09:00", "22:30")] } });

    expect(screen.getByRole("button", { name: "Add Friday window" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

describe("removing a window", () => {
  it("reports the day without it", () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Remove Tuesday window 1" }));

    expect(onChange).toHaveBeenCalledWith({ ...HOURS, 2: [window("13:00", "17:00")] });
  });

  it("turns a one-window day into a day off", () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday window 1" }));

    expect(onChange).toHaveBeenCalledWith({ ...HOURS, 1: [] });
  });
});

describe("editing a window", () => {
  it("commits a changed start when the field is left", () => {
    const { onChange } = renderEditor();
    const start = screen.getByLabelText("Monday window 1 start");

    fireEvent.change(start, { target: { value: "10:00" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(start);
    expect(onChange).toHaveBeenCalledWith({ ...HOURS, 1: [window("10:00", "17:00")] });
  });

  it("commits on Enter", () => {
    const { onChange } = renderEditor();
    const end = screen.getByLabelText("Monday window 1 end");

    fireEvent.change(end, { target: { value: "18:30" } });
    fireEvent.keyDown(end, { key: "Enter" });
    fireEvent.blur(end);

    expect(onChange).toHaveBeenCalledWith({ ...HOURS, 1: [window("09:00", "18:30")] });
  });

  it("does not commit a blur that changed nothing", () => {
    const { onChange } = renderEditor();
    fireEvent.blur(screen.getByLabelText("Monday window 1 start"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("holds a window that runs backwards until the other field catches up", () => {
    const { onChange } = renderEditor();
    const start = screen.getByLabelText("Monday window 1 start");
    const end = screen.getByLabelText("Monday window 1 end");

    // Moving the whole window later: start first, which is now after the end.
    fireEvent.change(start, { target: { value: "18:00" } });
    fireEvent.blur(start);
    expect(onChange).not.toHaveBeenCalled();
    expect(end.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(end, { target: { value: "20:00" } });
    fireEvent.blur(end);
    expect(onChange).toHaveBeenCalledWith({ ...HOURS, 1: [window("18:00", "20:00")] });
    expect(end.getAttribute("aria-invalid")).toBeNull();
  });

  it("abandons the edit on Escape rather than committing it", () => {
    const { onChange } = renderEditor();
    const start = screen.getByLabelText<HTMLInputElement>("Monday window 1 start");

    // Genuinely focused, so the component's own `blur()` really dispatches —
    // which is the whole defect: it runs synchronously, before React has
    // re-rendered with the reset draft, so the blur handler still sees the
    // abandoned time. Firing the blur by hand instead lets a re-render happen
    // in between, which is a sequence the browser never produces.
    start.focus();
    expect(document.activeElement).toBe(start);
    fireEvent.change(start, { target: { value: "10:00" } });
    fireEvent.keyDown(start, { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(start.value).toBe("09:00");
  });

  it("commits again after an abandoned edit, from either field", () => {
    const { onChange } = renderEditor();
    const start = screen.getByLabelText<HTMLInputElement>("Monday window 1 start");
    const end = screen.getByLabelText<HTMLInputElement>("Monday window 1 end");

    start.focus();
    fireEvent.change(start, { target: { value: "10:00" } });
    fireEvent.keyDown(start, { key: "Escape" });

    // Both fields blur into the one `commit`, which is where the flag is read;
    // a leaked one would silently swallow the next edit to either of them.
    end.focus();
    fireEvent.change(end, { target: { value: "18:30" } });
    fireEvent.blur(end);

    expect(onChange).toHaveBeenCalledWith({ ...HOURS, 1: [window("09:00", "18:30")] });
  });
});
