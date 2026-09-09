import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { QUEST_METRICS } from "@momentum/core/types";

import { METRIC_LABELS, PROGRESS_COPY, progressLabel } from "@/features/gamification/copy";

// Reads every string in `copy.ts`, then the feature's own source, because a
// sentence typed straight into a component is one `copy.ts` cannot see.

const FORBIDDEN =
  /\b(lazy|failed?|failure|missed|behind|unproductive|bad|poor|broken|slacking|excuse|guilt|shame|streak lost|you lost|don't break|do not break|punish|penalt(y|ies)|lose|lost)\b/i;

/** Celebration this product does not do (docs/DESIGN_SYSTEM.md, gamification restraint). */
const FORBIDDEN_CHROME = /\b(confetti|fireworks|combo|multiplier|health bar|damage|boss)\b/i;

function strings(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (typeof value === "function") {
    // Call each formatter with plausible arguments so its output is checked.
    try {
      into.push(String((value as (...args: unknown[]) => unknown)(3, 5, "Tasks")));
    } catch {
      /* a formatter with a different shape is covered by an explicit case */
    }
  } else if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) strings(nested, into);
  }
  return into;
}

function everyString(): string[] {
  return [
    ...strings(PROGRESS_COPY),
    ...Object.values(METRIC_LABELS),
    ...QUEST_METRICS.map((metric) => progressLabel(metric, 2, 5)),
  ];
}

describe("the progression vocabulary", () => {
  it("never characterises the user or their week", () => {
    for (const text of everyString()) {
      expect(text, `"${text}" is punitive`).not.toMatch(FORBIDDEN);
    }
  });

  it("promises no chrome this product does not have", () => {
    for (const text of everyString()) {
      expect(text, `"${text}" promises the wrong kind of game`).not.toMatch(FORBIDDEN_CHROME);
    }
  });

  it("says out loud that a cap removes nothing", () => {
    expect(PROGRESS_COPY.caps.description).toMatch(/never removes/i);
  });

  it("says out loud that coins buy appearance only", () => {
    expect(PROGRESS_COPY.cosmetics.description).toMatch(/never what it can do/i);
    expect(PROGRESS_COPY.level.coinsHint).toMatch(/appearance, nothing else/i);
  });

  it("calls an unearned achievement not-yet-unlocked rather than failed", () => {
    expect(PROGRESS_COPY.achievements.locked).toBe("Not yet unlocked");
  });

  it("treats a weekly goal as optional", () => {
    expect(PROGRESS_COPY.goals.emptyDescription).toMatch(/optional/i);
  });
});

const FEATURE = join(import.meta.dirname);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

/** Source with comments removed: prose about a rule is not a string a user reads. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the feature's own source", () => {
  const quoted = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

  it("renders no punitive string a component wrote for itself", () => {
    for (const file of sourceFiles(FEATURE)) {
      const source = withoutComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(quoted)) {
        const text = match[2] ?? "";
        // Only prose: identifiers, class names and import paths are not copy.
        if (!/\s/.test(text) || text.includes("/") || /^[a-z-]+(\s[a-z-]+)*$/.test(text)) continue;
        expect(text, `${file}: "${text}"`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it("has no confetti, anywhere", () => {
    // Comments stripped first: the modules below say in prose that this product
    // has no confetti, and that sentence must not be what satisfies the test.
    for (const file of sourceFiles(FEATURE)) {
      const source = withoutComments(readFileSync(file, "utf8")).toLowerCase();
      for (const word of ["confetti", "fireworks", "combo streak"]) {
        expect(source, file).not.toContain(word);
      }
    }
  });
});
