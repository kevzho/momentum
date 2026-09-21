import { describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";

import { dayLabel, splitLink } from "@/features/courses/components/week-checklist";

describe("splitLink", () => {
  it("keeps plain text as the title with no link", () => {
    expect(splitLink("Read chapter 4")).toEqual({ title: "Read chapter 4", url: null });
  });

  it("lifts a pasted URL out of the text, wherever it sits", () => {
    expect(splitLink("Lecture notes https://x.test/notes.pdf")).toEqual({
      title: "Lecture notes",
      url: "https://x.test/notes.pdf",
    });
    expect(splitLink("https://x.test/notes.pdf lecture notes")).toEqual({
      title: "lecture notes",
      url: "https://x.test/notes.pdf",
    });
  });

  it("names a bare link after its host, without a trailing punctuation mark", () => {
    expect(splitLink("https://www.example.com/a/b.")).toEqual({
      title: "example.com",
      url: "https://www.example.com/a/b",
    });
  });

  it("is null for nothing", () => {
    expect(splitLink("   ")).toBeNull();
  });
});

describe("dayLabel", () => {
  it("says Today for today and the weekday and day otherwise", () => {
    const today = localDate("2026-09-17");
    expect(dayLabel(today, today)).toBe("Today");
    expect(dayLabel(localDate("2026-09-15"), today)).toBe("Tue 15");
  });
});
