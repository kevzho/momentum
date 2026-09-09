import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";

import * as copy from "@/features/analytics/copy";

/**
 * Forbidden vocabulary, checked against every string the copy module can
 * produce and against the comment-stripped source of every other file in the
 * feature. Comments are stripped because the JSDoc explaining these rules
 * names the words it forbids. The insight sentences are gated in
 * `@momentum/core/analytics` and checked by `insights.test.ts`.
 */

/** Words that judge the person or the period. */
const FORBIDDEN = [
  "lazy",
  "unproductive",
  "productive",
  "productivity",
  "failure",
  "failed",
  "slacking",
  "wasted",
  "behind",
  "missed",
  "poor",
  "bad",
  "good",
  "great",
  "better",
  "worse",
  "best",
  "worst",
  "guilt",
  "shame",
  "overcommitted",
  "overbooked",
  "should",
  "you're",
  "impressive",
  "disappointing",
  "streak",
] as const;

/** Connectives that would claim a cause the data cannot support. */
const CAUSAL = [
  "because",
  "due to",
  "caused",
  "causes",
  "leads to",
  "results in",
  "therefore",
  "thanks to",
  "makes you",
  "helps you",
  "explains",
  "means you",
] as const;

function offendingWords(text: string, words: readonly string[]): string[] {
  return words.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    // macOS AppleDouble sidecars are binary metadata, not source.
    if (name.startsWith("._")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

/** Every string the module holds, plus what its functions say for real inputs. */
function everyString(): string[] {
  const strings: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") strings.push(value);
    else if (typeof value === "function") return;
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(walk);
  };
  walk(copy.ANALYTICS_COPY);

  for (const range of ["7", "30", "90"] as const) strings.push(copy.rangeSentence(range));
  for (const count of [0, 1, 2, 17]) {
    strings.push(copy.ANALYTICS_COPY.charts.plannedVsActual.uncovered(count));
    strings.push(copy.duration(count * 37));
    strings.push(copy.hourLabel(count % 24));
  }
  for (const value of [null, 0, 0.5, 1]) strings.push(copy.percent(value));
  strings.push(copy.dayLabel(localDate("2026-06-17")));
  strings.push(copy.longDayLabel(localDate("2026-06-17")));
  strings.push(copy.ANALYTICS_COPY.tableCaption("Focus time by day"));

  return strings;
}

describe("copy guard (Domain Rule 7)", () => {
  it("never characterises the user or the period", () => {
    for (const text of everyString()) {
      expect({ text, words: offendingWords(text, FORBIDDEN) }).toEqual({ text, words: [] });
    }
  });

  it("covers every string the module can produce", () => {
    // A guard that silently stopped reading the module would pass forever.
    expect(everyString().length).toBeGreaterThan(40);
    expect(everyString()).toContain("Analytics");
  });
});

describe("copy guard (Domain Rule 8)", () => {
  it("makes no causal claim", () => {
    for (const text of everyString()) {
      expect({ text, words: offendingWords(text, CAUSAL) }).toEqual({ text, words: [] });
    }
  });
});

describe("the feature's own source", () => {
  const files = sourceFiles(dirname(new URL(import.meta.url).pathname));

  it("has files to read", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("writes no forbidden vocabulary outside the copy module either", () => {
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect({ file, words: offendingWords(source, FORBIDDEN) }).toEqual({ file, words: [] });
    }
  });

  it("writes no causal connective anywhere in the feature", () => {
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect({ file, words: offendingWords(source, CAUSAL) }).toEqual({ file, words: [] });
    }
  });
});
