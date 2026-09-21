import { describe, expect, it } from "vitest";

import {
  createCourseInput,
  setCourseWeekInput,
  updateSyllabusInput,
} from "@/features/courses/schemas";

const ID = "3f1a2b6c-9d4e-4a7b-8c5d-1e2f3a4b5c6d";
const PROJECT = "8a7b6c5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d";

function course(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    projectId: PROJECT,
    name: "  Organic Chemistry ",
    color: "green",
    code: "CHEM 101",
    instructor: "",
    location: null,
    termStart: "2026-09-07",
    termEnd: "2026-12-11",
    ...overrides,
  };
}

describe("createCourseInput", () => {
  it("trims the name, brands the dates, and reads empty text as nothing", () => {
    const parsed = createCourseInput.safeParse(course());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.name).toBe("Organic Chemistry");
    expect(parsed.data.termStart).toBe("2026-09-07");
    expect(parsed.data.instructor).toBeNull();
    expect(parsed.data.location).toBeNull();
    expect(parsed.data.code).toBe("CHEM 101");
  });

  it("refuses a term that ends before it starts, or runs a year or more", () => {
    const backwards = createCourseInput.safeParse(course({ termEnd: "2026-09-06" }));
    expect(backwards.success).toBe(false);
    expect(!backwards.success && backwards.error.issues[0]?.path).toEqual(["termEnd"]);

    // 366 days on is a year; 365 days on is still under one.
    expect(createCourseInput.safeParse(course({ termEnd: "2027-09-08" })).success).toBe(false);
    expect(createCourseInput.safeParse(course({ termEnd: "2027-09-07" })).success).toBe(true);
    expect(createCourseInput.safeParse(course({ termEnd: "2026-09-07" })).success).toBe(true);
  });

  it("refuses a nameless course, a long code, and a colour outside the palette", () => {
    expect(createCourseInput.safeParse(course({ name: "  " })).success).toBe(false);
    expect(createCourseInput.safeParse(course({ code: "A".repeat(21) })).success).toBe(false);
    expect(createCourseInput.safeParse(course({ color: "mauve" })).success).toBe(false);
  });
});

describe("setCourseWeekInput", () => {
  it("keeps a week inside the term's possible range and reads blank text as nothing", () => {
    const parsed = setCourseWeekInput.safeParse({
      courseId: ID,
      weekNumber: 3,
      topic: "  ",
      materials: "Chapter 5",
    });
    expect(parsed.success && parsed.data.topic).toBeNull();
    expect(parsed.success && parsed.data.materials).toBe("Chapter 5");

    expect(setCourseWeekInput.safeParse({ courseId: ID, weekNumber: 0 }).success).toBe(false);
    expect(setCourseWeekInput.safeParse({ courseId: ID, weekNumber: 54 }).success).toBe(false);
    expect(setCourseWeekInput.safeParse({ courseId: ID, weekNumber: 1.5 }).success).toBe(false);
  });
});

describe("updateSyllabusInput", () => {
  it("clears the syllabus with empty text and bounds it", () => {
    expect(updateSyllabusInput.safeParse({ id: ID, syllabus: "" }).success && true).toBe(true);
    const cleared = updateSyllabusInput.safeParse({ id: ID, syllabus: "   " });
    expect(cleared.success && cleared.data.syllabus).toBeNull();
    expect(updateSyllabusInput.safeParse({ id: ID, syllabus: "x".repeat(20001) }).success).toBe(
      false,
    );
  });
});
