import { describe, expect, it } from "vitest";

import { NEW_HABIT_HREF, wantsNewHabit } from "@/features/habits/navigation";

describe("the creation intent", () => {
  it("recognises the palette's own link, and nothing else", () => {
    expect(NEW_HABIT_HREF).toBe("/habits?new=habit");
    expect(wantsNewHabit({ new: "habit" })).toBe(true);
    expect(wantsNewHabit({ new: ["habit", "event"] })).toBe(true);
    expect(wantsNewHabit({ new: "event" })).toBe(false);
    expect(wantsNewHabit({})).toBe(false);
  });
});
