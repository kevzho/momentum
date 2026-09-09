import { describe, expect, it } from "vitest";

import { NEW_HABIT_HREF, wantsNewHabit } from "@/features/habits/navigation";

/**
 * The palette's "Add habit" link, and the page's reading of it. A stale or
 * hand-edited value is simply not the intent — never an error.
 */
describe("the creation intent", () => {
  it("recognises the palette's own link, and nothing else", () => {
    expect(NEW_HABIT_HREF).toBe("/habits?new=habit");
    expect(wantsNewHabit({ new: "habit" })).toBe(true);
    expect(wantsNewHabit({ new: ["habit", "event"] })).toBe(true);
    expect(wantsNewHabit({ new: "event" })).toBe(false);
    expect(wantsNewHabit({})).toBe(false);
  });
});
