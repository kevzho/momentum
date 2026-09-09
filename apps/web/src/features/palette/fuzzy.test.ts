import { describe, expect, it } from "vitest";

import { fuzzyScore, fuzzyScoreAny } from "@/features/palette/fuzzy";

/** Ranks `texts` best-first against `query`, dropping the ones that do not match. */
function rank(query: string, texts: readonly string[]): string[] {
  return texts
    .map((text) => ({ text, score: fuzzyScore(query, text) }))
    .filter((entry): entry is { text: string; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.text);
}

describe("fuzzyScore", () => {
  it("matches a subsequence and refuses anything else", () => {
    expect(fuzzyScore("tdy", "Today")).not.toBeNull();
    expect(fuzzyScore("today", "Today")).not.toBeNull();
    expect(fuzzyScore("tyd", "Today")).toBeNull();
    expect(fuzzyScore("zzz", "Today")).toBeNull();
  });

  it("matches everything on an empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("ignores case and diacritics", () => {
    expect(fuzzyScore("ECOLE", "École")).not.toBeNull();
    expect(fuzzyScore("ecole", "École")).not.toBeNull();
  });

  it("prefers a prefix, then a word start, then a scattered match", () => {
    expect(rank("cal", ["Calendar", "Recalibrate the model", "Clear all"])).toEqual([
      "Calendar",
      "Recalibrate the model",
      "Clear all",
    ]);
  });

  it("finds initials across words", () => {
    expect(rank("sfs", ["Start focus session", "Settings"])[0]).toBe("Start focus session");
  });

  it("prefers the shorter of two equally good matches", () => {
    expect(rank("task", ["Add task", "Add task to the shared inbox later"])[0]).toBe("Add task");
  });

  it("never returns a score for a query longer than the text", () => {
    expect(fuzzyScore("calendars are long", "Calendar")).toBeNull();
    expect(fuzzyScore("x", "")).toBeNull();
  });
});

describe("fuzzyScoreAny", () => {
  it("falls back to a keyword when the label does not match", () => {
    expect(fuzzyScoreAny("timer", "Start focus session", ["pomodoro", "timer"])).not.toBeNull();
    expect(fuzzyScoreAny("timer", "Start focus session")).toBeNull();
  });

  it("scores a label match above the same match in a keyword", () => {
    const onLabel = fuzzyScoreAny("focus", "Focus", []);
    const onKeyword = fuzzyScoreAny("focus", "Deep work", ["focus"]);
    expect(onLabel).not.toBeNull();
    expect(onKeyword).not.toBeNull();
    expect(onLabel ?? 0).toBeGreaterThan(onKeyword ?? 0);
  });

  it("takes the best keyword, not the first", () => {
    const score = fuzzyScoreAny("habit", "Add habit", ["routine", "habit"]);
    expect(score).not.toBeNull();
  });
});
