import { describe, expect, it } from "vitest";

import { localDate } from "../time";
import type { LocalDate, Uuid } from "../types";

import { MAX_PARSED_MINUTES, parseQuickAdd, type DismissedToken } from "./index";

/**
 * The parser's contract, stated as tests because every clause of it is a
 * promise to someone typing fast:
 *
 * - the four categories, across the spec's own examples;
 * - **nothing is ever discarded** — the title plus the tokens always account
 *   for every non-whitespace character of the input;
 * - metadata-shaped text that is not metadata stays text;
 * - conflicts, unicode, emptiness and absurd length do not break it.
 */

// A Monday, so "monday" has to jump a full week and every other weekday is
// unambiguous relative to it.
const TODAY = localDate("2026-09-07");

const SCHOOL = { id: "11111111-1111-4111-8111-111111111111" as Uuid, name: "School" };
const RESEARCH = { id: "22222222-2222-4222-8222-222222222222" as Uuid, name: "Research" };
const DEEP_WORK = { id: "33333333-3333-4333-8333-333333333333" as Uuid, name: "Deep Work" };
const PROJECTS = [SCHOOL, RESEARCH, DEEP_WORK];

function parse(input: string, dismissed: readonly DismissedToken[] = []) {
  return parseQuickAdd(input, { today: TODAY, projects: PROJECTS, dismissed });
}

/** Every non-whitespace character survives, either in the title or in a token. */
function accountsForEveryCharacter(input: string, dismissed: readonly DismissedToken[] = []) {
  const result = parse(input, dismissed);
  const kept = [result.title, ...result.tokens.map((token) => token.text)]
    .join("")
    .replace(/\s/gu, "");
  return kept.split("").sort().join("") === input.replace(/\s/gu, "").split("").sort().join("");
}

describe("the spec's examples", () => {
  it("reads a date and a duration off the end", () => {
    const result = parse("Finish essay tomorrow 60m");
    expect(result.title).toBe("Finish essay");
    expect(result.dueDate).toBe(localDate("2026-09-08"));
    expect(result.estimatedMinutes).toBe(60);
    expect(result.priority).toBeNull();
    expect(result.projectId).toBeNull();
  });

  it("reads a weekday, a priority and a duration in any order", () => {
    const result = parse("Physics problems friday p1 45m");
    expect(result.title).toBe("Physics problems");
    expect(result.dueDate).toBe(localDate("2026-09-11"));
    expect(result.priority).toBe(1);
    expect(result.estimatedMinutes).toBe(45);
  });

  it("keeps a number that is part of the title and reads a project", () => {
    const result = parse("Read chapter 3 today #school");
    expect(result.title).toBe("Read chapter 3");
    expect(result.dueDate).toBe(TODAY);
    expect(result.projectId).toBe(SCHOOL.id);
  });

  it("reads all three of weekday, duration and project", () => {
    const result = parse("GVAE analysis monday 90m #research");
    expect(result.title).toBe("GVAE analysis");
    // Today is itself a Monday: "monday" is the *next* one, a week out.
    expect(result.dueDate).toBe(localDate("2026-09-14"));
    expect(result.estimatedMinutes).toBe(90);
    expect(result.projectId).toBe(RESEARCH.id);
  });

  it("renders the chips the spec draws", () => {
    const result = parse("Finish essay tomorrow 60m p1 #school");
    expect(result.title).toBe("Finish essay");
    expect(result.tokens.map((token) => token.label)).toEqual(["Tomorrow", "1h", "P1", "School"]);
  });
});

describe("dates", () => {
  it("resolves today and tomorrow", () => {
    expect(parse("Ship it today").dueDate).toBe(TODAY);
    expect(parse("Ship it tomorrow").dueDate).toBe(localDate("2026-09-08"));
  });

  it("resolves a weekday to the next such weekday, never to today", () => {
    expect(parse("Ship it monday").dueDate).toBe(localDate("2026-09-14"));
    expect(parse("Ship it tuesday").dueDate).toBe(localDate("2026-09-08"));
    expect(parse("Ship it sunday").dueDate).toBe(localDate("2026-09-13"));
  });

  it("accepts the common abbreviations", () => {
    for (const [word, expected] of [
      ["mon", "2026-09-14"],
      ["tue", "2026-09-08"],
      ["tues", "2026-09-08"],
      ["wed", "2026-09-09"],
      ["thu", "2026-09-10"],
      ["thurs", "2026-09-10"],
      ["fri", "2026-09-11"],
      ["sat", "2026-09-12"],
      ["sun", "2026-09-13"],
    ] as const) {
      expect(parse(`Ship it ${word}`).dueDate).toBe(localDate(expected));
    }
  });

  it("is case-insensitive", () => {
    expect(parse("Ship it FRIDAY").dueDate).toBe(localDate("2026-09-11"));
    expect(parse("Ship it Tomorrow").dueDate).toBe(localDate("2026-09-08"));
  });

  it("absorbs 'next', 'this' and 'on' so they do not litter the title", () => {
    for (const qualifier of ["next", "this", "on"]) {
      const result = parse(`Physics problems ${qualifier} friday`);
      expect(result.title).toBe("Physics problems");
      expect(result.dueDate).toBe(localDate("2026-09-11"));
      expect(result.tokens[0]?.text).toBe(`${qualifier} friday`);
    }
  });

  it("labels a date by what it resolved to, not by how it was written", () => {
    expect(parse("x today").tokens[0]?.label).toBe("Today");
    expect(parse("x tomorrow").tokens[0]?.label).toBe("Tomorrow");
    expect(parse("x friday").tokens[0]?.label).toBe("Friday");
    expect(parse("x next friday").tokens[0]?.label).toBe("Friday");
    // A week out lands exactly on the boundary and still reads as a weekday.
    expect(parse("x monday").tokens[0]?.label).toBe("Monday");
  });
});

describe("durations", () => {
  it("reads the forms the spec lists", () => {
    expect(parse("x 15m").estimatedMinutes).toBe(15);
    expect(parse("x 45m").estimatedMinutes).toBe(45);
    expect(parse("x 90m").estimatedMinutes).toBe(90);
    expect(parse("x 1h").estimatedMinutes).toBe(60);
    expect(parse("x 1h30m").estimatedMinutes).toBe(90);
  });

  it("reads the near neighbours of those forms", () => {
    expect(parse("x 45min").estimatedMinutes).toBe(45);
    expect(parse("x 30mins").estimatedMinutes).toBe(30);
    expect(parse("x 2hrs").estimatedMinutes).toBe(120);
    expect(parse("x 1.5h").estimatedMinutes).toBe(90);
    expect(parse("x 1h30").estimatedMinutes).toBe(90);
    expect(parse("x 2H").estimatedMinutes).toBe(120);
  });

  it("never reads a bare number as a duration", () => {
    const result = parse("Read chapter 3");
    expect(result.title).toBe("Read chapter 3");
    expect(result.estimatedMinutes).toBeNull();
  });

  it("refuses a duration the estimate column could not hold", () => {
    expect(parse(`x ${MAX_PARSED_MINUTES}m`).estimatedMinutes).toBe(MAX_PARSED_MINUTES);
    const tooLong = parse(`x ${MAX_PARSED_MINUTES + 1}m`);
    expect(tooLong.estimatedMinutes).toBeNull();
    expect(tooLong.title).toBe(`x ${MAX_PARSED_MINUTES + 1}m`);
    expect(parse("x 0m").estimatedMinutes).toBeNull();
  });
});

describe("priorities", () => {
  it("reads p1 through p4 in either case", () => {
    expect(parse("x p1").priority).toBe(1);
    expect(parse("x p2").priority).toBe(2);
    expect(parse("x p3").priority).toBe(3);
    expect(parse("x P4").priority).toBe(4);
  });

  it("ignores the ones that are not priorities", () => {
    expect(parse("x p0").priority).toBeNull();
    expect(parse("x p5").priority).toBeNull();
    expect(parse("x p12").priority).toBeNull();
    expect(parse("x p").priority).toBeNull();
  });
});

describe("projects", () => {
  it("resolves a #tag against the user's own projects, case- and shape-insensitively", () => {
    expect(parse("x #school").projectId).toBe(SCHOOL.id);
    expect(parse("x #School").projectId).toBe(SCHOOL.id);
    expect(parse("x #deep-work").projectId).toBe(DEEP_WORK.id);
    expect(parse("x #deepwork").projectId).toBe(DEEP_WORK.id);
    expect(parse("x #Deep_Work").projectId).toBe(DEEP_WORK.id);
  });

  it("leaves an unknown tag in the title rather than inventing a project", () => {
    const result = parse("Post about it #twitter");
    expect(result.projectId).toBeNull();
    expect(result.title).toBe("Post about it #twitter");
  });

  it("leaves a bare hash alone", () => {
    expect(parse("Issue # 4").title).toBe("Issue # 4");
  });
});

describe("metadata-shaped text that is not metadata", () => {
  it("keeps 'p1' when it is a page and not a priority", () => {
    const result = parse("read p1 of the paper");
    expect(result.title).toBe("read p1 of the paper");
    expect(result.priority).toBeNull();
    expect(result.tokens).toHaveLength(0);
  });

  it("keeps a date word that is part of the sentence", () => {
    const result = parse("Write the tomorrow section");
    expect(result.title).toBe("Write the tomorrow section");
    expect(result.dueDate).toBeNull();
  });

  it("keeps a project tag that is not at the end", () => {
    const result = parse("Ask #school about the form");
    expect(result.title).toBe("Ask #school about the form");
    expect(result.projectId).toBeNull();
  });

  it("stops at the first word that is not metadata, however much follows it", () => {
    const result = parse("Plan p1 45m the retro tomorrow please");
    expect(result.title).toBe("Plan p1 45m the retro tomorrow please");
    expect(result.tokens).toHaveLength(0);
  });
});

describe("conflicting metadata", () => {
  it("takes the rightmost of two dates and leaves the other in the title", () => {
    const result = parse("Essay tomorrow friday");
    expect(result.dueDate).toBe(localDate("2026-09-11"));
    expect(result.title).toBe("Essay tomorrow");
  });

  it("takes the rightmost of two durations and leaves the other in the title", () => {
    const result = parse("Essay 30m tomorrow 60m");
    expect(result.estimatedMinutes).toBe(60);
    expect(result.dueDate).toBe(localDate("2026-09-08"));
    expect(result.title).toBe("Essay 30m");
  });

  it("takes the rightmost of two priorities", () => {
    const result = parse("Essay p3 p1");
    expect(result.priority).toBe(1);
    expect(result.title).toBe("Essay p3");
  });

  it("takes the rightmost of two projects", () => {
    const result = parse("Essay #school #research");
    expect(result.projectId).toBe(RESEARCH.id);
    expect(result.title).toBe("Essay #school");
  });
});

describe("nothing is discarded", () => {
  const inputs = [
    "",
    "   ",
    "Finish essay tomorrow 60m p1 #school",
    "read p1 of the paper",
    "Essay tomorrow friday 30m 60m p1 p2 #school #research",
    "Read chapter 3 today #school",
    "  leading and trailing   spaces  tomorrow  ",
    "#school",
    "tomorrow",
    "Ünïcödé täsk mañana tomorrow 45m",
    "作业 明天 tomorrow 30m #school",
    "emoji 🚀 task tomorrow 15m",
  ];

  it.each(inputs)("accounts for every character of %j", (input) => {
    expect(accountsForEveryCharacter(input)).toBe(true);
  });

  it("keeps the user's own spacing inside the title", () => {
    const result = parse("two  spaces   inside tomorrow");
    expect(result.title).toBe("two  spaces   inside");
  });

  it("does not leave a gap where a token was cut from the middle", () => {
    const result = parse("Essay tomorrow", [{ kind: "date", text: "tomorrow" }]);
    expect(result.title).toBe("Essay tomorrow");
  });
});

describe("edge cases", () => {
  it("handles empty and whitespace-only input", () => {
    for (const input of ["", " ", "\t\n  "]) {
      const result = parse(input);
      expect(result.title).toBe("");
      expect(result.tokens).toHaveLength(0);
      expect(result.dueDate).toBeNull();
      expect(result.estimatedMinutes).toBeNull();
      expect(result.priority).toBeNull();
      expect(result.projectId).toBeNull();
    }
  });

  it("handles an input that is nothing but metadata", () => {
    const result = parse("tomorrow 60m p1 #school");
    expect(result.title).toBe("");
    expect(result.tokens).toHaveLength(4);
    expect(result.dueDate).toBe(localDate("2026-09-08"));
  });

  it("parses unicode titles without touching them", () => {
    const result = parse("Ünïcödé — 日本語 — τίτλος tomorrow 45m");
    expect(result.title).toBe("Ünïcödé — 日本語 — τίτλος");
    expect(result.dueDate).toBe(localDate("2026-09-08"));
    expect(result.estimatedMinutes).toBe(45);
  });

  it("treats a non-breaking space as a separator, like the paste it came from", () => {
    const result = parse("Finish essay tomorrow");
    expect(result.title).toBe("Finish essay");
    expect(result.dueDate).toBe(localDate("2026-09-08"));
  });

  it("survives very long input", () => {
    const long = `${"word ".repeat(20_000)}tomorrow 90m p2 #research`;
    const started = Date.now();
    const result = parse(long);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result.dueDate).toBe(localDate("2026-09-08"));
    expect(result.estimatedMinutes).toBe(90);
    expect(result.priority).toBe(2);
    expect(result.projectId).toBe(RESEARCH.id);
    expect(result.title).toBe("word ".repeat(20_000).trim());
  });

  it("survives one very long token", () => {
    const token = "x".repeat(100_000);
    expect(parse(`${token} tomorrow`).title).toBe(token);
  });

  it("takes no projects at all without complaint", () => {
    const result = parseQuickAdd("Essay #school tomorrow", { today: TODAY, projects: [] });
    expect(result.projectId).toBeNull();
    expect(result.title).toBe("Essay #school");
    expect(result.dueDate).toBe(localDate("2026-09-08"));
  });
});

describe("dismissing a token", () => {
  it("returns the text to the title and clears the value", () => {
    const result = parse("Finish essay tomorrow 60m", [{ kind: "date", text: "tomorrow" }]);
    expect(result.title).toBe("Finish essay tomorrow");
    expect(result.dueDate).toBeNull();
    expect(result.estimatedMinutes).toBe(60);
  });

  it("does not stop the scan: tokens to its left are still read", () => {
    const result = parse("Finish essay tomorrow 60m", [{ kind: "duration", text: "60m" }]);
    expect(result.title).toBe("Finish essay 60m");
    expect(result.dueDate).toBe(localDate("2026-09-08"));
    expect(result.estimatedMinutes).toBeNull();
  });

  it("gives back both words of a qualified weekday", () => {
    const result = parse("Physics next friday", [{ kind: "date", text: "next friday" }]);
    expect(result.title).toBe("Physics next friday");
    expect(result.dueDate).toBeNull();
  });

  it("is keyed by text, so it survives editing the front of the line", () => {
    const dismissed: readonly DismissedToken[] = [{ kind: "priority", text: "p1" }];
    expect(parse("Essay p1", dismissed).priority).toBeNull();
    expect(parse("A much longer essay title p1", dismissed).priority).toBeNull();
    expect(parse("A much longer essay title p1", dismissed).title).toBe(
      "A much longer essay title p1",
    );
  });

  it("folds case when matching a dismissal", () => {
    expect(parse("Essay TOMORROW", [{ kind: "date", text: "tomorrow" }]).dueDate).toBeNull();
  });

  it("only dismisses the kind it names", () => {
    const result = parse("Essay tomorrow", [{ kind: "duration", text: "tomorrow" }]);
    expect(result.dueDate).toBe(localDate("2026-09-08"));
  });
});

describe("purity", () => {
  it("never reads the process clock: the same input and today give the same answer", () => {
    const once = parse("Essay friday 90m p1 #school");
    const twice = parse("Essay friday 90m p1 #school");
    expect(twice).toEqual(once);
  });

  it("resolves relative to the today it is given, not to any other day", () => {
    const days: LocalDate[] = [
      localDate("2026-09-07"),
      localDate("2026-09-08"),
      localDate("2026-09-09"),
    ];
    const resolved = days.map(
      (today) => parseQuickAdd("Essay friday", { today, projects: PROJECTS }).dueDate,
    );
    expect(resolved).toEqual([
      localDate("2026-09-11"),
      localDate("2026-09-11"),
      localDate("2026-09-11"),
    ]);
  });
});
