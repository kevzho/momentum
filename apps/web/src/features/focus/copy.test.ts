import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FOCUS_XP } from "@momentum/core/focus";

import {
  FOCUS_COPY,
  describeElapsed,
  describePreset,
  describeStart,
  describeTimer,
  describeTotals,
  describeXpInCapWindow,
} from "@/features/focus/copy";

describe("the focus surface's sentences", () => {
  it("names a preset by its two halves", () => {
    expect(describePreset(25, 5)).toBe("25 minutes, 5 minute break");
    expect(describePreset(45, null)).toBe("45 minutes");
  });

  it("says what the start button will do", () => {
    expect(describeStart(50)).toBe("Start 50 minutes");
  });

  it("describes a running, a paused and an overrunning timer", () => {
    expect(
      describeTimer({
        plannedMinutes: 25,
        remainingSeconds: 600,
        overrunSeconds: 0,
        paused: false,
      }),
    ).toBe("10m left of 25 minutes");
    expect(
      describeTimer({ plannedMinutes: 25, remainingSeconds: 600, overrunSeconds: 0, paused: true }),
    ).toBe("Paused, 10m left of 25 minutes");
    expect(
      describeTimer({
        plannedMinutes: 25,
        remainingSeconds: 0,
        overrunSeconds: 300,
        paused: false,
      }),
    ).toBe("Past the planned 25 minutes by 5m");
  });

  it("reports paused time only when there was some", () => {
    expect(describeElapsed(25, 0)).toBe("25m focused");
    expect(describeElapsed(25, 4)).toBe("25m focused, 4m paused");
  });

  it("counts a single session in the singular", () => {
    expect(describeTotals({ completedSessions: 1, focusedMinutes: 25 })).toBe("1 session · 25m");
    expect(describeTotals({ completedSessions: 3, focusedMinutes: 95 })).toBe(
      "3 sessions · 1h 35m",
    );
  });

  it("reports the awarded points against the cap over the cap's own window", () => {
    // The ledger caps focus XP over a rolling 24 hours, not a calendar day
    // (docs/DOMAIN_RULES.md §21); the sentence names the window it measured.
    expect(describeXpInCapWindow(120)).toBe(
      `120 of ${FOCUS_XP.dailyCap} points from focus in the last 24 hours.`,
    );
    expect(describeXpInCapWindow(0)).not.toContain("today");
  });
});

/* -------------------------------------------------------------------------- */
/* Domain Rule 7 — nothing punitive                                           */
/* -------------------------------------------------------------------------- */

const PUNITIVE =
  /\b(lazy|failed?|failure|missed|behind|unproductive|bad|poor|broken|slacking|excuse|guilt|shame|wasted|abandoned|give up|gave up)\b/i;

/* -------------------------------------------------------------------------- */
/* specs/07 — the UI claims no capability the app does not have               */
/* -------------------------------------------------------------------------- */

/**
 * The claims Momentum cannot make true.
 *
 * It is a web page. It cannot block a site, close an app, silence a
 * notification, play a sound at you, or see what you are doing in another
 * window — and native notifications and a menu-bar timer are explicit non-goals
 * of this phase (they are Phase 15's). A focus screen is exactly where a user
 * expects some of that, which is why the spec calls it out and why this test
 * scans the feature's *source* as well as its strings: a sentence typed into a
 * component is a sentence `FOCUS_COPY` cannot see.
 *
 * The patterns are deliberately about capability claims rather than about the
 * word "block", which this product uses constantly and correctly for a span of
 * calendar time.
 */
const FABRICATED = [
  /block(?:s|ing|ed)?\s+(?:out\s+)?(?:websites?|sites?|apps?|distractions?|notifications?|the internet)/i,
  /(?:website|site|app|distraction)[- ]blocking/i,
  /silenc(?:e|es|ing)\s+(?:your\s+)?(?:notifications?|phone)/i,
  /mutes?\s+(?:your\s+)?(?:notifications?|phone)/i,
  /do not disturb/i,
  /ambient (?:sound|noise|music)/i,
  /we(?:'ll| will) (?:notify|remind|alert)/i,
  /(?:notifies|reminds|alerts) you/i,
  /(?:rings|chimes|plays a sound)/i,
  /keeps? you off/i,
  /locks? (?:your )?(?:screen|phone|computer)/i,
];

function everyString(): string[] {
  return [
    ...Object.values(FOCUS_COPY),
    describePreset(25, 5),
    describeStart(25),
    describeTimer({ plannedMinutes: 25, remainingSeconds: 0, overrunSeconds: 0, paused: false }),
    describeTimer({ plannedMinutes: 25, remainingSeconds: 60, overrunSeconds: 0, paused: true }),
    describeTimer({ plannedMinutes: 25, remainingSeconds: 0, overrunSeconds: 60, paused: false }),
    describeElapsed(0, 0),
    describeElapsed(25, 4),
    describeTotals({ completedSessions: 0, focusedMinutes: 0 }),
    describeXpInCapWindow(0),
  ];
}

const FEATURE_DIR = join(import.meta.dirname);

/** Every source file in the feature, with comments stripped. */
function featureSources(): { name: string; text: string }[] {
  const files: { name: string; text: string }[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith("._")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (
        !/\.tsx?$/.test(entry.name) ||
        entry.name.endsWith(".test.ts") ||
        entry.name.endsWith(".test.tsx")
      ) {
        continue;
      }
      files.push({ name: entry.name, text: stripComments(readFileSync(path, "utf8")) });
    }
  };

  walk(FEATURE_DIR);
  return files;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("the focus vocabulary", () => {
  it("never characterises the user or their session", () => {
    for (const text of everyString()) {
      expect(text, `"${text}" is punitive`).not.toMatch(PUNITIVE);
    }
  });

  it("calls a session that stopped early what it is", () => {
    expect(FOCUS_COPY.statusEndedEarly).toBe("Ended early");
    expect(FOCUS_COPY.end).toBe("End session");
  });

  it("says out loud that paused time is not counted", () => {
    expect(FOCUS_COPY.pausedHint).toContain("not counted");
  });

  it("says an interruption costs nothing", () => {
    expect(FOCUS_COPY.interruptionHint).toContain("Nothing is deducted");
  });
});

describe("the focus surface claims no capability the app lacks", () => {
  it("makes none of the claims in any string it can render", () => {
    for (const text of everyString()) {
      for (const pattern of FABRICATED) {
        expect(text, `"${text}" claims something Momentum cannot do`).not.toMatch(pattern);
      }
    }
  });

  it("makes none of them anywhere in the feature's source either", () => {
    const sources = featureSources();
    expect(sources.length).toBeGreaterThan(5);

    for (const file of sources) {
      for (const pattern of FABRICATED) {
        expect(file.text, `${file.name} claims something Momentum cannot do`).not.toMatch(pattern);
      }
    }
  });
});
