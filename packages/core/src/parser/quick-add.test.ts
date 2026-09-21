import { describe, expect, it } from "vitest";

import { localDate } from "../time";
import type { LocalDate, Uuid } from "../types";

import {
  MAX_PARSED_MINUTES,
  parseDatePhrase,
  parseQuickAdd,
  type DismissedToken,
  type ParsedFieldKind,
} from "./index";

// A Monday, so "monday" has to jump a full week.
const TODAY = localDate("2026-09-07");

const SCHOOL = { id: "11111111-1111-4111-8111-111111111111" as Uuid, name: "School" };
const RESEARCH = { id: "22222222-2222-4222-8222-222222222222" as Uuid, name: "Research" };
const DEEP_WORK = { id: "33333333-3333-4333-8333-333333333333" as Uuid, name: "Deep Work" };
const PROJECTS = [SCHOOL, RESEARCH, DEEP_WORK];

function parse(input: string, dismissed: readonly DismissedToken[] = []) {
  return parseQuickAdd(input, { today: TODAY, projects: PROJECTS, dismissed });
}

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

describe("written dates", () => {
  it("reads a month and a day, and resolves it to the next such date on or after today", () => {
    expect(parse("Chem test oct 3").dueDate).toBe(localDate("2026-10-03"));
    expect(parse("Chem test Oct 3rd").dueDate).toBe(localDate("2026-10-03"));
    expect(parse("Chem test october 3").dueDate).toBe(localDate("2026-10-03"));
    expect(parse("Chem test 3 oct").dueDate).toBe(localDate("2026-10-03"));
    expect(parse("Chem test sept 7").dueDate).toBe(TODAY);
    // Already past this year, so it is next year's.
    expect(parse("Chem test jan 15").dueDate).toBe(localDate("2027-01-15"));
  });

  it("reads a month, a day and a year", () => {
    expect(parse("Thesis due oct 3, 2027").dueDate).toBe(localDate("2027-10-03"));
    expect(parse("Thesis due 3 october 2027").dueDate).toBe(localDate("2027-10-03"));
    expect(parse("Thesis due oct 3, 2027").title).toBe("Thesis");
  });

  it("reads numeric dates, month first", () => {
    expect(parse("Problem set 9/25").dueDate).toBe(localDate("2026-09-25"));
    expect(parse("Problem set 09/25").dueDate).toBe(localDate("2026-09-25"));
    expect(parse("Problem set 1/15").dueDate).toBe(localDate("2027-01-15"));
    expect(parse("Problem set 9/25/26").dueDate).toBe(localDate("2026-09-25"));
    expect(parse("Problem set 9/25/2027").dueDate).toBe(localDate("2027-09-25"));
    expect(parse("Problem set 2026-09-25").dueDate).toBe(localDate("2026-09-25"));
  });

  it("reads 'next week' and 'in N days/weeks'", () => {
    expect(parse("Lab report next week").dueDate).toBe(localDate("2026-09-14"));
    expect(parse("Lab report due next week").title).toBe("Lab report");
    expect(parse("Lab report in 3 days").dueDate).toBe(localDate("2026-09-10"));
    expect(parse("Lab report in 2 weeks").dueDate).toBe(localDate("2026-09-21"));
    expect(parse("Lab report in 1 day").dueDate).toBe(localDate("2026-09-08"));
  });

  it("absorbs 'due' and 'by' so a title never ends in a dangling deadline word", () => {
    for (const input of ["Essay due friday", "Essay by friday", "Essay due on friday"]) {
      const result = parse(input);
      expect(result.title).toBe("Essay");
      expect(result.dueDate).toBe(localDate("2026-09-11"));
    }
    expect(parse("Essay due on friday").tokens[0]?.text).toBe("due on friday");
    expect(parse("Essay due 9/25").tokens[0]?.text).toBe("due 9/25");
  });

  it("refuses what is not a date", () => {
    expect(parse("Read chapter 3").dueDate).toBeNull();
    expect(parse("Read chapter 3").title).toBe("Read chapter 3");
    expect(parse("Score 13/45").dueDate).toBeNull();
    expect(parse("Feb 30 party").dueDate).toBeNull();
    expect(parse("Party feb 30").dueDate).toBeNull();
    expect(parse("Party in 0 days").dueDate).toBeNull();
    expect(parse("Party in x days").dueDate).toBeNull();
    expect(parse("Party due").title).toBe("Party due");
  });

  it("finds Feb 29 in the next leap year", () => {
    expect(parse("Leap feb 29").dueDate).toBe(localDate("2028-02-29"));
  });

  it("labels a written date the way the rest of the product does", () => {
    expect(parse("x oct 3").tokens[0]?.label).toBe("Oct 3, 2026");
    expect(parse("x 9/8").tokens[0]?.label).toBe("Tomorrow");
    expect(parse("x 9/11").tokens[0]?.label).toBe("Friday");
  });

  it("gives back a whole phrase when dismissed, and keeps reading past it", () => {
    const result = parse("Essay due oct 3 60m", [{ kind: "date", text: "due oct 3" }]);
    expect(result.title).toBe("Essay due oct 3");
    expect(result.dueDate).toBeNull();
    expect(result.estimatedMinutes).toBe(60);
  });

  it("accounts for every character of a phrase", () => {
    for (const input of [
      "Essay due oct 3, 2027 60m",
      "Essay by next week p2",
      "Essay in 2 weeks",
      "Essay 9/25/26 #school",
    ]) {
      expect(accountsForEveryCharacter(input)).toBe(true);
    }
  });
});

describe("the fields a capture reads", () => {
  const EVENT: readonly ParsedFieldKind[] = ["date", "time", "duration"];

  function parseEvent(input: string, dismissed: readonly DismissedToken[] = []) {
    return parseQuickAdd(input, { today: TODAY, projects: PROJECTS, dismissed, fields: EVENT });
  }

  it("never reads a time for a task: a task has a deadline, not a clock", () => {
    const result = parse("Chem test oct 3 9am");
    expect(result.time).toBeNull();
    expect(result.dueDate).toBeNull();
    expect(result.title).toBe("Chem test oct 3 9am");
  });

  it("reads a date and a start time for an event", () => {
    const result = parseEvent("Chem test oct 3 9am");
    expect(result.title).toBe("Chem test");
    expect(result.dueDate).toBe(localDate("2026-10-03"));
    expect(result.time).toEqual({ startMinutes: 540, endMinutes: null });
    expect(result.tokens.map((token) => token.label)).toEqual(["Oct 3, 2026", "09:00"]);
  });

  it("reads the time forms people write", () => {
    for (const [text, start, end] of [
      ["9am", 540, null],
      ["9:30am", 570, null],
      ["9.30am", 570, null],
      ["9 am", 540, null],
      ["12pm", 720, null],
      ["12am", 0, null],
      ["noon", 720, null],
      ["14:00", 840, null],
      ["9:00", 540, null],
      ["9-11am", 540, 660],
      ["9am-11am", 540, 660],
      ["9–11am", 540, 660],
      ["9:00-10:30", 540, 630],
      ["2-3:30pm", 840, 930],
      ["11-1pm", 660, 780],
      ["11am-1", 660, 780],
      ["9am to 11am", 540, 660],
      ["9 - 11am", 540, 660],
      ["10PM-11PM", 1320, 1380],
    ] as const) {
      const result = parseEvent(`Exam ${text}`);
      expect(result.time, text).toEqual({ startMinutes: start, endMinutes: end });
      expect(result.title, text).toBe("Exam");
    }
  });

  it("absorbs 'at' and 'from' before a time", () => {
    expect(parseEvent("Exam at 9am").title).toBe("Exam");
    expect(parseEvent("Exam at 9am").tokens[0]?.text).toBe("at 9am");
    expect(parseEvent("Exam from 9 to 11am").title).toBe("Exam");
  });

  it("refuses what is not a time", () => {
    for (const text of ["9", "9-11", "pages 9-11", "13am", "25:00", "9:60", "0pm", "9am-8am"]) {
      expect(parseEvent(`Exam ${text}`).time, text).toBeNull();
    }
  });

  it("reads a date, a time and a duration in one line, and no project or priority", () => {
    const result = parseEvent("Chem test oct 3 at 9am 2h p1 #school");
    expect(result.title).toBe("Chem test oct 3 at 9am 2h p1 #school");
    expect(result.time).toBeNull();

    const clean = parseEvent("Chem test oct 3 at 9am 2h");
    expect(clean.title).toBe("Chem test");
    expect(clean.dueDate).toBe(localDate("2026-10-03"));
    expect(clean.time).toEqual({ startMinutes: 540, endMinutes: null });
    expect(clean.estimatedMinutes).toBe(120);
  });

  it("labels a range with an en dash, on the grid's clock", () => {
    expect(parseEvent("Exam 9am-11am").tokens[0]?.label).toBe("09:00 – 11:00");
    expect(parseEvent("Exam 2:30pm").tokens[0]?.label).toBe("14:30");
  });

  it("gives a dismissed time back with its qualifier", () => {
    const result = parseEvent("Exam at 9am", [{ kind: "time", text: "at 9am" }]);
    expect(result.title).toBe("Exam at 9am");
    expect(result.time).toBeNull();
  });

  it("accounts for every character", () => {
    const result = parseEvent("Chem test oct 3 from 9 to 11am 2h");
    const kept = [result.title, ...result.tokens.map((token) => token.text)]
      .join("")
      .replace(/\s/gu, "");
    const input = "Chem test oct 3 from 9 to 11am 2h".replace(/\s/gu, "");
    expect(kept.split("").sort().join("")).toBe(input.split("").sort().join(""));
  });
});

describe("parseDatePhrase, for a typed date field", () => {
  it("reads the same forms as the title, with or without a qualifier", () => {
    expect(parseDatePhrase("fri", TODAY)).toBe(localDate("2026-09-11"));
    expect(parseDatePhrase("  due fri ", TODAY)).toBe(localDate("2026-09-11"));
    expect(parseDatePhrase("oct 3", TODAY)).toBe(localDate("2026-10-03"));
    expect(parseDatePhrase("9/25", TODAY)).toBe(localDate("2026-09-25"));
    expect(parseDatePhrase("next week", TODAY)).toBe(localDate("2026-09-14"));
    expect(parseDatePhrase("in 3 days", TODAY)).toBe(localDate("2026-09-10"));
    expect(parseDatePhrase("tomorrow", TODAY)).toBe(localDate("2026-09-08"));
  });

  it("is null for anything else", () => {
    expect(parseDatePhrase("", TODAY)).toBeNull();
    expect(parseDatePhrase("due", TODAY)).toBeNull();
    expect(parseDatePhrase("soon", TODAY)).toBeNull();
    expect(parseDatePhrase("oct 3 2027 extra", TODAY)).toBeNull();
    expect(parseDatePhrase("3", TODAY)).toBeNull();
  });
});
