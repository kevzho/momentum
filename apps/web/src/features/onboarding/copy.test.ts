import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import * as copy from "@/features/onboarding/copy";

// Domain Rule 7 guard, as the planning and today features have: every string
// the copy module produces, and the comment-stripped source of every non-test
// file, is free of judgement words. "Good" is absent here too: the checklist
// states facts and next actions, never a cheer.

const FORBIDDEN = [
  "lazy",
  "unproductive",
  "failed",
  "behind",
  "missed",
  "overcommitted",
  "overbooked",
  "bad",
  "good",
  "great",
  "awesome",
  "congratulations",
  "should",
  "you're",
] as const;

function offendingWords(text: string): string[] {
  return FORBIDDEN.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
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

function everyString(): string[] {
  const strings: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (typeof value === "function") {
      strings.push(String((value as (...args: number[]) => string)(1, 3)));
      strings.push(String((value as (...args: number[]) => string)(2, 3)));
    } else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(copy);
  return strings;
}

describe("onboarding copy", () => {
  it("never uses a judgement word", () => {
    for (const text of everyString()) {
      expect(offendingWords(text), text).toEqual([]);
    }
  });

  it("keeps the feature's source free of them too", () => {
    const featureDir = join(dirname(new URL(import.meta.url).pathname), ".");
    for (const file of sourceFiles(featureDir)) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(offendingWords(source), file).toEqual([]);
    }
  });
});
