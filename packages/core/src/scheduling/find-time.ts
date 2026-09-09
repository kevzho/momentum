import type { IanaTimeZone, Instant, LocalDate, Minutes, TimeWindow } from "../types";
import {
  addMinutes,
  diffDays,
  durationMinutes,
  endOfDay,
  formatDuration,
  formatLocalDate,
  formatMinutesOfDay,
  fromLocal,
  localTime,
  minutesOfLocalTime,
  weekdayOf,
} from "../time";
import {
  busyIntervals,
  commitmentsOverlapping,
  compareInstants,
  dayBounds,
  focusIntervalsOn,
  intervalMinutes,
  intervalOfSlot,
  intervalsOverlap,
  laterInstant,
  MIN_USEFUL_GAP_MINUTES,
  slotOf,
  snapInstantUp,
  subtractIntervals,
  windowIntervalsOn,
  workingIntervalsOn,
} from "./intervals";
import type {
  CandidateScore,
  DayInterval,
  FindTimeCandidate,
  FindTimeInput,
  FindTimeResult,
  InstantInterval,
} from "./types";

/**
 * Find Time: ranked candidate slots for one task, each with a one-sentence
 * explanation (specs/05-week-planning.md; the algorithm and its rationale are
 * written up in docs/SCHEDULING.md).
 *
 * The whole engine is one pure function over `FindTimeInput`. It reads no
 * clock — `now` is an argument — consults no model and touches no network, so
 * the same input gives the same output, in the same order, with the same
 * strings, on the server, in the browser and in a test. Every candidate is
 * scored on the five criteria of `CandidateScore` and the list is ordered
 * lexicographically by them; nothing is weighted or summed, which is what
 * makes every ordering explainable by the first field on which two
 * candidates differ.
 *
 * The arithmetic (free time, working windows, snapping, wall clock ↔ instants)
 * is `intervals.ts`; this file is the search, the scoring and the words.
 */

export const DEFAULT_FIND_TIME_LIMIT = 5;

/**
 * How many of the returned candidates may share a date while other dates
 * still have candidates to offer. Five slots on one Monday is a list, not a
 * choice; the user asked for a suggestion so that they can pick.
 */
export const PER_DAY_LIMIT = 2;

/**
 * The hours inside which a slot that is *not* inside working hours may be
 * suggested. Working windows are honoured fully wherever they lie — a night
 * worker's 22:00–23:59 and 00:00–06:00 windows are working hours — but the
 * rest of the day is offered only between these readings: a 00:15 AM start is
 * a valid free interval and a useless suggestion.
 *
 * This is the engine's one tunable. Everything else is derived from the
 * input or from `MIN_USEFUL_GAP_MINUTES`.
 */
export const SUGGESTION_WINDOW: TimeWindow = {
  start: localTime("07:00"),
  end: localTime("22:00"),
};

/**
 * A block longer than this is longer than any day, and no single block the
 * calendar's actions write can hold it. Elapsed minutes: on a fall-back day a
 * 25-hour block *can* be placed, and the open-slot search finds it before this
 * limit is consulted.
 */
const DAY_MINUTES: Minutes = 1440;

/* -------------------------------------------------------------------------- */
/* Search state                                                               */
/* -------------------------------------------------------------------------- */

/** One searchable day: its bounds and the windows every candidate on it is judged against. */
interface SearchDay {
  date: LocalDate;
  /** The whole local day. */
  bounds: InstantInterval;
  /** Open time from `now` on: the day minus every commitment that occupies time. */
  free: readonly InstantInterval[];
  working: readonly DayInterval[];
  focus: readonly DayInterval[];
  /** `SUGGESTION_WINDOW` resolved on this date. */
  suggestion: readonly DayInterval[];
}

/** The input, normalised once, plus the searchable days. */
interface Search {
  input: FindTimeInput;
  tz: IanaTimeZone;
  duration: Minutes;
  snap: Minutes;
  days: readonly SearchDay[];
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export function findTime(input: FindTimeInput): FindTimeResult {
  const { context } = input;
  const limit = resolveLimit(input.limit);
  const duration = Math.max(1, Math.round(input.durationMinutes));

  if (context.days.length === 0) {
    return { outcome: "nothing", candidates: [], note: "There are no days in this range." };
  }

  const search: Search = {
    input,
    tz: context.timezone,
    duration,
    snap: Math.max(1, Math.round(input.snapMinutes)),
    days: searchDays(input),
  };

  if (search.days.length === 0) {
    return {
      outcome: "range-past",
      candidates: [],
      note: "Every day in this range has already passed.",
    };
  }

  const dueDate = input.task.dueDate;
  const deadlineNote =
    dueDate !== null && dueDate < context.today
      ? `The ${deadlineLabel(dueDate, context.today)} deadline has passed; these times are after it.`
      : null;

  const open = openCandidates(search);
  if (open.length > 0) {
    return { outcome: "found", candidates: select(open, limit), note: deadlineNote };
  }

  if (duration > DAY_MINUTES) {
    return {
      outcome: "longer-than-any-gap",
      candidates: [],
      note: `${formatDuration(duration)} is longer than a day; it can be scheduled as several shorter blocks.`,
    };
  }

  const overlapping = overlappingCandidates(search);
  if (overlapping.length === 0) {
    return {
      outcome: "nothing",
      candidates: [],
      note: `No time in this range fits ${formatDuration(duration)}.`,
    };
  }

  return {
    outcome: "fallback-overlaps",
    candidates: select(overlapping, limit),
    note: joinNotes(fallbackNote(search), deadlineNote),
  };
}

function resolveLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_FIND_TIME_LIMIT;
  return Math.max(1, Math.round(limit));
}

/* -------------------------------------------------------------------------- */
/* Step 1–2: the searchable days and their free time                          */
/* -------------------------------------------------------------------------- */

/**
 * The days of the range that can still hold something: on or after `today`,
 * and not already over at `now`. Each carries its open time from `now` on,
 * so nothing downstream has to remember to exclude the past.
 */
function searchDays(input: FindTimeInput): SearchDay[] {
  const { context, now } = input;
  const tz = context.timezone;
  const busy = busyIntervals(input.commitments);
  const days: SearchDay[] = [];

  for (const date of context.days) {
    if (date < context.today) continue;
    const bounds = dayBounds(date, tz);
    if (bounds.endAt <= now) continue;

    const searchable: InstantInterval = {
      startAt: laterInstant(bounds.startAt, now),
      endAt: bounds.endAt,
    };
    days.push({
      date,
      bounds,
      free: subtractIntervals([searchable], busy),
      working: workingIntervalsOn(date, context.workingHours, tz),
      focus: focusIntervalsOn(date, context.focusWindows, tz),
      suggestion: windowIntervalsOn(date, [SUGGESTION_WINDOW], tz),
    });
  }

  return days;
}

/* -------------------------------------------------------------------------- */
/* Step 3: candidate starts in open windows                                   */
/* -------------------------------------------------------------------------- */

/**
 * For every open window long enough for the block: its start, and the start
 * of every working, focus and suggestion window that lies inside it — each
 * snapped up to the profile's increment and kept only while the block still
 * ends inside the window.
 *
 * The suggestion window's start is a source for the same reason the working
 * windows' are: it is where an off-hours placement may begin. Without it a
 * free day with no working hours would offer its 00:00 start, lose it to the
 * off-hours rule, and offer nothing.
 */
function openCandidates(search: Search): FindTimeCandidate[] {
  const candidates: FindTimeCandidate[] = [];
  const seen = new Set<Instant>();

  for (const day of search.days) {
    for (const window of day.free) {
      if (intervalMinutes(window) < search.duration) continue;

      const starts: Instant[] = [window.startAt];
      for (const source of [day.working, day.focus, day.suggestion]) {
        for (const interval of source) {
          if (window.startAt <= interval.startAt && interval.startAt < window.endAt) {
            starts.push(interval.startAt);
          }
        }
      }

      for (const start of starts) {
        const startAt = snapInstantUp(start, search.snap, search.tz);
        if (seen.has(startAt)) continue;

        const slot: InstantInterval = { startAt, endAt: addMinutes(startAt, search.duration) };
        if (slot.endAt > window.endAt) continue;
        if (!admissible(slot, day)) continue;
        /*
         * Only a start that survived this window's own test is remembered.
         * The snap moves a start forward, so a short window's start can land
         * on or past its end — and on the *next* window's start. Recording it
         * before the test would blank that window instead of de-duplicating
         * the two, and its candidate would never be offered. Free intervals
         * are disjoint, so a start that is kept belongs to exactly one of
         * them and the dedup stays exact.
         */
        seen.add(startAt);

        const candidate = describe(search, day, slot, window);
        if (candidate !== null) candidates.push(candidate);
      }
    }
  }

  return candidates;
}

/**
 * The off-hours rule: a slot outside every working window is offered only
 * when it lies inside `SUGGESTION_WINDOW` on its day. Applied in both search
 * paths, so an overlapping fallback candidate is never a slot the open-window
 * search would have refused for being at 3 AM.
 */
function admissible(slot: InstantInterval, day: SearchDay): boolean {
  return containedInAny(slot, day.working) || containedInAny(slot, day.suggestion);
}

/* -------------------------------------------------------------------------- */
/* Step 7: overlapping candidates when nothing open fits                      */
/* -------------------------------------------------------------------------- */

/**
 * When no open window fits, the block has to overlap something, and the
 * honest suggestions are the natural boundaries: the start of each working
 * window (or of the suggestion window on a day without any) and the end of
 * each commitment on the day. Each is snapped up, must not start before
 * `now`, and must end inside its day.
 *
 * Every candidate here overlaps at least one commitment. That is not checked
 * by luck: a boundary start that fits an open window and passes the
 * off-hours rule is precisely a start `openCandidates` would have produced,
 * so its absence there proves the overlap. The filter below keeps the
 * `fallback-overlaps` contract explicit rather than implied.
 */
function overlappingCandidates(search: Search): FindTimeCandidate[] {
  const { now, commitments } = search.input;
  const candidates: FindTimeCandidate[] = [];
  const seen = new Set<Instant>();

  for (const day of search.days) {
    const starts: Instant[] =
      day.working.length > 0
        ? day.working.map((window) => window.startAt)
        : [fromLocal(day.date, minutesOfLocalTime(SUGGESTION_WINDOW.start), search.tz)];
    for (const commitment of commitmentsOverlapping(commitments, day.bounds)) {
      starts.push(commitment.endAt);
    }

    for (const start of starts) {
      const startAt = snapInstantUp(start, search.snap, search.tz);
      if (startAt < now || seen.has(startAt)) continue;
      seen.add(startAt);

      const slot: InstantInterval = { startAt, endAt: addMinutes(startAt, search.duration) };
      if (slot.endAt > day.bounds.endAt) continue;
      if (!admissible(slot, day)) continue;

      const candidate = describe(search, day, slot, null);
      if (candidate !== null && candidate.score.conflicts > 0) candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Names the longest open stretch the search could see, so the note can say
 * what *would* have fitted. Ties go to the earlier day, then the earlier
 * interval, which keeps the sentence deterministic.
 */
function fallbackNote(search: Search): string {
  let longest: { minutes: Minutes; date: LocalDate } | null = null;
  for (const day of search.days) {
    for (const window of day.free) {
      const minutes = intervalMinutes(window);
      if (minutes > 0 && (longest === null || minutes > longest.minutes)) {
        longest = { minutes, date: day.date };
      }
    }
  }

  if (longest === null) {
    return "There is no open time in this range; these times overlap existing blocks.";
  }
  return (
    `No open window in this range fits ${formatDuration(search.duration)}; ` +
    `the longest open window is ${formatDuration(longest.minutes)} on ${fullDateLabel(longest.date)}. ` +
    "These times overlap existing blocks."
  );
}

function joinNotes(...notes: readonly (string | null)[]): string | null {
  const present = notes.filter((note): note is string => note !== null);
  return present.length === 0 ? null : present.join(" ");
}

/* -------------------------------------------------------------------------- */
/* Step 4: scoring                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Scores a slot and writes its sentence. `window` is the open interval the
 * slot was cut from, or null for an overlapping fallback candidate.
 *
 * Returns null when the slot's wall-clock span would not resolve back to the
 * same instants through `intervalOfSlot` — the rule the server applies when
 * the drawer schedules `candidate.span`. That happens for a handful of
 * readings on a fall-back night (a 01:00–02:00 EDT block reads 01:00–01:00 on
 * the clock), and a candidate the action cannot write as scored is not a
 * candidate.
 */
function describe(
  search: Search,
  day: SearchDay,
  slot: InstantInterval,
  window: InstantInterval | null,
): FindTimeCandidate | null {
  const { tz, input } = search;
  const span = slotOf(slot, tz);
  const resolved = intervalOfSlot(span, tz);
  if (resolved.startAt !== slot.startAt || resolved.endAt !== slot.endAt) return null;

  const dueDate = input.task.dueDate;
  const overlapping = commitmentsOverlapping(input.commitments, slot);
  const score: CandidateScore = {
    beforeDeadline: dueDate === null || slot.endAt <= endOfDay(dueDate, tz),
    withinWorkingHours: containedInAny(slot, day.working),
    conflicts: overlapping.length,
    fragments: window === null ? 0 : countFragments(window, slot, search.snap),
    focusFit: containedInAny(slot, day.focus)
      ? 2
      : day.focus.some((focus) => intervalsOverlap(focus, slot))
        ? 1
        : 0,
  };
  const openWindowMinutes = window === null ? 0 : intervalMinutes(window);
  const overlaps = overlapping.map((commitment) => commitment.title);

  return {
    span,
    startAt: slot.startAt,
    endAt: slot.endAt,
    score,
    openWindowMinutes,
    overlaps,
    explanation: explain(search, {
      span,
      score,
      openWindowMinutes,
      overlaps,
    }),
  };
}

/**
 * The leftovers a slot leaves at either end of its window that are too short
 * to be useful and long enough to have mattered. A leftover under one snap
 * increment cannot hold any block and is the same for every candidate in the
 * window, so it says nothing about *this* placement; a leftover of
 * `MIN_USEFUL_GAP_MINUTES` or more is somewhere a person can do something.
 */
function countFragments(window: InstantInterval, slot: InstantInterval, snap: Minutes): number {
  const leftovers = [
    durationMinutes(window.startAt, slot.startAt),
    durationMinutes(slot.endAt, window.endAt),
  ];
  return leftovers.filter((minutes) => minutes >= snap && minutes < MIN_USEFUL_GAP_MINUTES).length;
}

function containedInAny(slot: InstantInterval, windows: readonly InstantInterval[]): boolean {
  return windows.some((window) => window.startAt <= slot.startAt && slot.endAt <= window.endAt);
}

/* -------------------------------------------------------------------------- */
/* Step 5–6: ranking and diversity                                            */
/* -------------------------------------------------------------------------- */

/**
 * The five criteria of specs/05 in their order, then the start instant, then
 * the wall-clock span so the order is total. Lexicographic: a later field is
 * consulted only when every earlier one ties.
 */
function compareCandidates(a: FindTimeCandidate, b: FindTimeCandidate): number {
  return (
    compareBooleans(a.score.beforeDeadline, b.score.beforeDeadline) ||
    compareBooleans(a.score.withinWorkingHours, b.score.withinWorkingHours) ||
    a.score.conflicts - b.score.conflicts ||
    a.score.fragments - b.score.fragments ||
    b.score.focusFit - a.score.focusFit ||
    compareInstants(a.startAt, b.startAt) ||
    compareStrings(a.span.date, b.span.date) ||
    a.span.startMinutes - b.span.startMinutes ||
    a.span.endMinutes - b.span.endMinutes
  );
}

/** True first. */
function compareBooleans(a: boolean, b: boolean): number {
  return a === b ? 0 : a ? -1 : 1;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Ranks, then takes up to `limit` while holding each date to `PER_DAY_LIMIT`
 * picks; if the walk runs out before the limit, the skipped candidates fill
 * the rest in rank order. The returned list is in rank order throughout.
 */
function select(candidates: readonly FindTimeCandidate[], limit: number): FindTimeCandidate[] {
  const ranked = candidates.slice().sort(compareCandidates);
  const chosen = new Set<FindTimeCandidate>();
  const skipped: FindTimeCandidate[] = [];
  const perDay = new Map<LocalDate, number>();

  for (const candidate of ranked) {
    if (chosen.size >= limit) break;
    const count = perDay.get(candidate.span.date) ?? 0;
    if (count >= PER_DAY_LIMIT) {
      skipped.push(candidate);
      continue;
    }
    perDay.set(candidate.span.date, count + 1);
    chosen.add(candidate);
  }
  for (const candidate of skipped) {
    if (chosen.size >= limit) break;
    chosen.add(candidate);
  }

  return ranked.filter((candidate) => chosen.has(candidate));
}

/* -------------------------------------------------------------------------- */
/* The explanation grammar                                                    */
/* -------------------------------------------------------------------------- */

/** U+2013, unspaced between two clock readings: "4:00–5:00 PM". */
const EN_DASH = "–";
/** U+2014, spaced, between the slot and the reason. */
const EM_DASH = "—";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * `<day> <time range> — <window or overlap clause><deadline clause><hours
 * clause><focus clause>.`
 *
 *   "Wednesday 4:00–5:00 PM — 2-hour open window before Thursday deadline."
 *   "Monday 7:00–8:00 AM — 9-hour open window, outside working hours."
 *   "Tuesday 9:00–10:00 AM — overlaps Standup and Deep work after the Sep 4
 *    deadline, in a focus window."
 *
 * Facts only, one sentence, the same words for the same input. There is no
 * "best", no "ideal", and no clause that judges the user or the week; a slot
 * is described by where it is and what surrounds it (Domain Rule 7).
 */
function explain(
  search: Search,
  candidate: Pick<FindTimeCandidate, "span" | "score" | "openWindowMinutes" | "overlaps">,
): string {
  const { today } = search.input.context;
  const { span, score } = candidate;
  const dueDate = search.input.task.dueDate;

  const lead =
    score.conflicts > 0
      ? `overlaps ${joinTitles(candidate.overlaps)}`
      : windowClause(candidate.openWindowMinutes, search.duration);
  const deadline =
    dueDate === null
      ? ""
      : score.beforeDeadline
        ? ` before ${deadlineLabel(dueDate, today)} deadline`
        : ` after the ${deadlineLabel(dueDate, today)} deadline`;
  const hours = score.withinWorkingHours ? "" : ", outside working hours";
  const focus =
    score.focusFit === 2
      ? ", in a focus window"
      : score.focusFit === 1
        ? ", partly in a focus window"
        : "";

  const range = clockRange(span.startMinutes, span.endMinutes);
  return `${dateLabel(span.date, today)} ${range} ${EM_DASH} ${lead}${deadline}${hours}${focus}.`;
}

/**
 * "exact fit" · "2-hour open window" · "45-minute open window" · "1h 30m open
 * window". Whole hours and sub-hour lengths read as words; a mixed length
 * uses the product's one duration format rather than "90-minute".
 */
function windowClause(openWindowMinutes: Minutes, duration: Minutes): string {
  if (openWindowMinutes === duration) return "exact fit";
  if (openWindowMinutes % 60 === 0) return `${openWindowMinutes / 60}-hour open window`;
  if (openWindowMinutes < 60) return `${openWindowMinutes}-minute open window`;
  return `${formatDuration(openWindowMinutes)} open window`;
}

/** "A" · "A and B" · "A, B and C". */
function joinTitles(titles: readonly string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/**
 * "4:00–5:00 PM" · "11:30 AM–12:30 PM": the meridiem is written once when
 * both ends share it, as `formatTimeRange` does, but without the spaces so
 * the reading stays one token in a sentence.
 */
function clockRange(startMinutes: Minutes, endMinutes: Minutes): string {
  const from = formatMinutesOfDay(startMinutes, { hour12: true });
  const to = formatMinutesOfDay(endMinutes, { hour12: true });
  return from.slice(-2) === to.slice(-2)
    ? `${from.slice(0, -3)}${EN_DASH}${to}`
    : `${from}${EN_DASH}${to}`;
}

/**
 * "Wednesday" for a date within the seven days starting today — the reader
 * knows which Wednesday — and "Wed Sep 16" beyond that, where a bare weekday
 * name would be ambiguous.
 */
function dateLabel(date: LocalDate, today: LocalDate): string {
  return withinComingWeek(date, today) ? WEEKDAY_NAMES[weekdayOf(date)] : fullDateLabel(date);
}

/**
 * "Thursday deadline" within the coming week, "Sep 16 deadline" beyond it.
 * The deadline reads as a date rather than "Wed Sep 16" because "deadline"
 * already carries the noun and the weekday adds nothing a reader can act on.
 */
function deadlineLabel(dueDate: LocalDate, today: LocalDate): string {
  return withinComingWeek(dueDate, today)
    ? WEEKDAY_NAMES[weekdayOf(dueDate)]
    : formatLocalDate(dueDate, "monthDay");
}

/** The seven days starting today: the ones a bare weekday name identifies. */
function withinComingWeek(date: LocalDate, today: LocalDate): boolean {
  const offset = diffDays(today, date);
  return offset >= 0 && offset < 7;
}

/** "Tue Sep 8". */
function fullDateLabel(date: LocalDate): string {
  return `${formatLocalDate(date, "weekday")} ${formatLocalDate(date, "monthDay")}`;
}
