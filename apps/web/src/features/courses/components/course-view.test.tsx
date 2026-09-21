import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { instant, localDate } from "@momentum/core/time";
import type { Course, Task, Uuid } from "@momentum/core/types";

import type { CoursePageData } from "@/features/courses/types";
import { QuickAddContext } from "@/features/tasks/components/quick-add-context";

const { actions, openQuickAdd, pushMock, errorToast, successToast } = vi.hoisted(() => ({
  actions: {
    setCourseWeek: vi.fn(),
    updateSyllabus: vi.fn(),
    updateCourse: vi.fn(),
    deleteCourse: vi.fn(),
  },
  openQuickAdd: vi.fn(),
  pushMock: vi.fn(),
  errorToast: vi.fn(),
  successToast: vi.fn(),
}));

vi.mock("@/features/courses/actions", () => actions);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@momentum/ui/components/toast", () => ({
  toast: { success: successToast, error: errorToast, info: vi.fn(), warning: vi.fn() },
}));

const { CourseView } = await import("@/features/courses/components/course-view");

const COURSE_ID = "3f1a2b6c-9d4e-4a7b-8c5d-1e2f3a4b5c6d" as Uuid;
const PROJECT_ID = "8a7b6c5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d" as Uuid;
const USER_ID = "11111111-1111-4111-8111-111111111111" as Uuid;
const TODAY = localDate("2026-09-17");

const course: Course = {
  id: COURSE_ID,
  userId: USER_ID,
  projectId: PROJECT_ID,
  code: "STAT 201",
  instructor: "Dr. Okafor",
  location: null,
  syllabus: "Grading: problem sets 40%.",
  termStart: localDate("2026-09-07"),
  termEnd: localDate("2026-09-27"),
  createdAt: instant("2026-09-01T00:00:00.000Z"),
  updatedAt: instant("2026-09-01T00:00:00.000Z"),
};

function task(
  id: string,
  title: string,
  dueDate: string | null,
  status: Task["status"] = "open",
): Task {
  return {
    id: id as Uuid,
    userId: USER_ID,
    projectId: PROJECT_ID,
    parentTaskId: null,
    title,
    description: null,
    status,
    priority: 4,
    estimatedMinutes: null,
    actualMinutes: 0,
    dueDate: dueDate === null ? null : localDate(dueDate),
    completedAt: null,
    archivedAt: null,
    sortOrder: 0,
    createdAt: instant("2026-09-01T00:00:00.000Z"),
    updatedAt: instant("2026-09-01T00:00:00.000Z"),
  };
}

const PS2 = task("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Problem set 2", "2026-09-18");
const READING = task(
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "Read chapter 1",
  "2026-09-10",
  "completed",
);
const UNDATED = task("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Find a study group", null);

function data(): CoursePageData {
  return {
    today: TODAY,
    weekStart: 1,
    summary: {
      course,
      name: "Statistics",
      color: "blue",
      status: "current",
      currentWeek: 2,
      weekCount: 3,
      openAssignments: 2,
    },
    weeks: [
      {
        span: { number: 1, start: localDate("2026-09-07"), end: localDate("2026-09-13") },
        week: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as Uuid,
          userId: USER_ID,
          courseId: COURSE_ID,
          weekNumber: 1,
          topic: "Descriptive statistics",
          materials: "Chapter 1",
          createdAt: instant("2026-09-01T00:00:00.000Z"),
          updatedAt: instant("2026-09-01T00:00:00.000Z"),
        },
        assignments: [READING],
        isCurrent: false,
      },
      {
        span: { number: 2, start: localDate("2026-09-14"), end: localDate("2026-09-20") },
        week: null,
        assignments: [PS2],
        isCurrent: true,
      },
      {
        span: { number: 3, start: localDate("2026-09-21"), end: localDate("2026-09-27") },
        week: null,
        assignments: [],
        isCurrent: false,
      },
    ],
    unplaced: [UNDATED],
  };
}

function renderView(page = data()) {
  render(
    <QuickAddContext value={{ open: openQuickAdd, setDefaults: vi.fn() }}>
      <CourseView data={page} />
    </QuickAddContext>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.setCourseWeek.mockResolvedValue({ ok: true, data: null });
  actions.updateSyllabus.mockResolvedValue({ ok: true, data: null });
});

describe("the course page", () => {
  it("lays the term out week by week, with what is written and what is due", () => {
    renderView();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Statistics");
    expect(
      screen.getByText(/STAT 201 · Dr\. Okafor · Sep 7, 2026 – Sep 27, 2026 · Week 2 of 3/),
    ).toBeTruthy();

    expect(screen.getByLabelText<HTMLInputElement>("Week 1 topic").value).toBe(
      "Descriptive statistics",
    );
    expect(screen.getByLabelText<HTMLInputElement>("Week 2 topic").value).toBe("");
    expect(screen.getByText("This week")).toBeTruthy();

    const week1 = screen.getByRole("list", { name: "Week 1 assignments" });
    expect(week1.textContent).toContain("Read chapter 1");
    const week2 = screen.getByRole("list", { name: "Week 2 assignments" });
    expect(week2.textContent).toContain("Problem set 2");
    expect(screen.getByRole("list", { name: "Week 3 assignments" }).textContent).toContain(
      "Nothing due this week.",
    );

    // Not in a week: no due date, or outside the term.
    expect(screen.getByText("Find a study group")).toBeTruthy();
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Syllabus" }).value).toBe(
      "Grading: problem sets 40%.",
    );
  });

  it("writes a week's topic once, on Enter, and shows it at once", async () => {
    renderView();
    const topic = screen.getByLabelText<HTMLInputElement>("Week 2 topic");

    fireEvent.focus(topic);
    fireEvent.change(topic, { target: { value: "Sampling" } });
    await act(async () => {
      fireEvent.keyDown(topic, { key: "Enter" });
    });

    expect(actions.setCourseWeek).toHaveBeenCalledTimes(1);
    expect(actions.setCourseWeek).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      weekNumber: 2,
      topic: "Sampling",
      materials: null,
    });

    // The blur that follows commits nothing new.
    await act(async () => {
      fireEvent.blur(topic);
    });
    expect(actions.setCourseWeek).toHaveBeenCalledTimes(1);
  });

  it("keeps the other field's text when one is edited", async () => {
    renderView();
    const materials = screen.getByLabelText<HTMLTextAreaElement>("Week 1 material");

    fireEvent.focus(materials);
    fireEvent.change(materials, { target: { value: "Chapter 1, sections 1–3" } });
    await act(async () => {
      fireEvent.blur(materials);
    });

    expect(actions.setCourseWeek).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      weekNumber: 1,
      topic: "Descriptive statistics",
      materials: "Chapter 1, sections 1–3",
    });
  });

  it("seeds Quick Add with the project and the week's last day", () => {
    renderView();

    const week3 = screen.getByRole("region", { name: /^Week 3/ });
    fireEvent.click(
      // The heading names the section; the button is inside it.
      Array.from(week3.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Add assignment"),
      ) as HTMLButtonElement,
    );

    expect(openQuickAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "task",
        projectId: PROJECT_ID,
        dueDate: localDate("2026-09-27"),
      }),
    );

    // The header's button lands on the current week.
    openQuickAdd.mockClear();
    fireEvent.click(screen.getAllByRole("button", { name: "Add assignment" })[0] as HTMLElement);
    expect(openQuickAdd).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, dueDate: localDate("2026-09-20") }),
    );
  });

  it("saves the syllabus on blur and reports a failure with the text still shown", async () => {
    actions.updateSyllabus.mockResolvedValueOnce({
      ok: false,
      error: { code: "unavailable", message: "Could not save." },
    });
    renderView();
    const syllabus = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Syllabus" });

    fireEvent.focus(syllabus);
    fireEvent.change(syllabus, { target: { value: "Office hours Tue." } });
    await act(async () => {
      fireEvent.blur(syllabus);
    });

    expect(actions.updateSyllabus).toHaveBeenCalledWith({
      id: COURSE_ID,
      syllabus: "Office hours Tue.",
    });
    await waitFor(() => expect(errorToast).toHaveBeenCalled());
    // Rolled back to the server's text once the failure landed.
    await waitFor(() => expect(syllabus.value).toBe("Grading: problem sets 40%."));
  });

  it("links every assignment to its task sheet", () => {
    renderView();
    const link = screen.getByRole("link", { name: /Problem set 2/ });
    expect(link.getAttribute("href")).toBe(`/tasks?task=${PS2.id}`);
  });
});
