import type { Route } from "next";

import {
  addDays,
  formatLocalDate,
  formatWeekRange,
  isLocalDate,
  localDate,
  weekOf,
} from "@momentum/core/time";
import type { LocalDate, Weekday } from "@momentum/core/types";

/**
 * Which range the calendar is showing, expressed entirely in the URL.
 *
 * Navigational state belongs in the URL (docs/ARCHITECTURE.md §7): the week a
 * user is looking at survives a reload, is shareable, works with the browser's
 * back button, and — because the page is a server component — is read once on
 * the server and never duplicated into client state that could drift.
 *
 * `week` is the anchor date, not necessarily the first day of the week: the
 * week-start preference resolves it. In day view the anchor is the day shown.
 */

export const CALENDAR_VIEWS = ["week", "day"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const DEFAULT_VIEW: CalendarView = "week";

export interface CalendarParams {
  anchor: LocalDate;
  view: CalendarView;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * The window an anchor can survive.
 *
 * `isLocalDate` accepts any four-digit year, but the arithmetic around the
 * anchor does not: `weekOf`, `addDays` and `startOfDay` step up to a week
 * either side of it and re-brand the result, and one step past `9999-12-31` or
 * before `0001-01-01` produces a string `localDate()` refuses — a TypeError
 * raised inside a server component, which is the error boundary the fallback
 * below exists to prevent. Bounding the anchor covers the day view's
 * `rangeEndExclusive` too, because every displayed day comes from
 * `displayedDays`.
 */
const MIN_ANCHOR = localDate("0001-01-08");
const MAX_ANCHOR = localDate("9998-12-31");

/**
 * Reads the range out of the query string, falling back to today.
 *
 * An unparseable, impossible or out-of-range date is treated as absent rather
 * than as an error: a hand-edited URL should land the user on this week, not on
 * an error boundary.
 */
export function parseCalendarParams(searchParams: SearchParams, today: LocalDate): CalendarParams {
  const rawWeek = first(searchParams.week);
  const rawView = first(searchParams.view);
  // Bounded after branding rather than on the raw string, because `localDate`
  // trims: `?week=%202026-09-07%20` sorts below `0001-01-08` as it was typed
  // and would silently lose a perfectly good week.
  const anchor = rawWeek !== null && isLocalDate(rawWeek) ? localDate(rawWeek) : null;

  return {
    anchor: anchor !== null && anchor >= MIN_ANCHOR && anchor <= MAX_ANCHOR ? anchor : today,
    view: rawView === "day" ? "day" : DEFAULT_VIEW,
  };
}

/** The days the grid renders: seven in week view, one in day view. */
export function displayedDays(params: CalendarParams, weekStart: Weekday): LocalDate[] {
  if (params.view === "day") return [params.anchor];
  return weekOf(params.anchor, weekStart).days;
}

/** The first day of the displayed range. */
export function rangeStart(params: CalendarParams, weekStart: Weekday): LocalDate {
  return params.view === "day" ? params.anchor : weekOf(params.anchor, weekStart).start;
}

/** Previous / next, by whatever the current range is. */
export function shiftAnchor(
  params: CalendarParams,
  weekStart: Weekday,
  direction: -1 | 1,
): LocalDate {
  if (params.view === "day") return addDays(params.anchor, direction);
  return addDays(weekOf(params.anchor, weekStart).start, direction * 7);
}

/**
 * The href for a range. `week` is omitted when it is today's, so the plain
 * `/calendar` link in the sidebar and the "Today" button produce the same URL
 * and the nav's active state stays correct.
 */
export function calendarHref(anchor: LocalDate, view: CalendarView, today: LocalDate): Route {
  const params = new URLSearchParams();
  if (anchor !== today) params.set("week", anchor);
  if (view !== DEFAULT_VIEW) params.set("view", view);
  const query = params.toString();
  return (query === "" ? "/calendar" : `/calendar?${query}`) as Route;
}

/** "Sep 7 – Sep 13" in week view, "September 7, 2026" in day view. */
export function rangeLabel(days: readonly LocalDate[], view: CalendarView): string {
  const [only] = days;
  if (!only) return "";
  if (view === "day") return formatLocalDate(only, "long");
  return formatWeekRange(days);
}

/* -------------------------------------------------------------------------- */
/* Creation intent                                                            */
/* -------------------------------------------------------------------------- */

/**
 * "Add event" from the command palette (Phase 11).
 *
 * The palette cannot open the block editor itself — the editor needs the week's
 * items, the grid spec and the profile's snapping, all of which the calendar
 * page resolves — so the command carries an intent in the URL instead. The
 * island opens a create draft once and replaces the URL without it, so a reload
 * or a back button does not reopen an editor the user has already dismissed.
 */
export const NEW_EVENT_HREF = "/calendar?new=event" as Route;

export function wantsNewEvent(searchParams: SearchParams): boolean {
  return first(searchParams.new) === "event";
}
