import { describe, expect, it } from "vitest";

import { validationError } from "@/lib/actions/result";

/**
 * A validation failure has to say what was wrong. Most surfaces show
 * `message` alone, so when zod's only complaint is about a field, that
 * complaint is the message — "check the highlighted fields" with nothing
 * highlighted is what a toast used to say about a 600-character title.
 */
describe("validationError", () => {
  it("uses the first field's message when nothing was said about the form as a whole", () => {
    const result = validationError([
      { path: ["title"], message: "Titles are at most 500 characters." },
      { path: ["estimatedMinutes"], message: "An estimate is at most one week." },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("Titles are at most 500 characters.");
    expect(result.error.fieldErrors).toEqual({
      title: ["Titles are at most 500 characters."],
      estimatedMinutes: ["An estimate is at most one week."],
    });
  });

  it("still prefers a message about the form as a whole", () => {
    const result = validationError([
      { path: ["endMinutes"], message: "A block has to end after it starts." },
      { path: [], message: "That is not a task." },
    ]);

    if (result.ok) return;
    expect(result.error.message).toBe("That is not a task.");
  });

  it("falls back to the generic sentence only when there is no message at all", () => {
    const result = validationError([]);
    if (result.ok) return;
    expect(result.error.message).toBe("Please check the highlighted fields.");
    expect(result.error.fieldErrors).toBeUndefined();
  });
});
