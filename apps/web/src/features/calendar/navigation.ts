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
 * The calendar's displayed range, expressed entirely in the URL. `week` is the
 * anchor date, not necessarily the first day of the week; in day view it is the day shown.
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

// `isLocalDate` accepts any four-digit year, but `weekOf`/`addDays` step up to
// a week either side of the anchor and `localDate()` throws past the ends of
// the calendar — inside a server component, i.e. the error boundary.
const MIN_ANCHOR = localDate("0001-01-08");
const MAX_ANCHOR = localDate("9998-12-31");

/** Reads the range out of the query string; an unusable date falls back to today. */
export function parseCalendarParams(searchParams: SearchParams, today: LocalDate): CalendarParams {
  const rawWeek = first(searchParams.week);
  const rawView = first(searchParams.view);
  // Bounded after branding, not on the raw string: `localDate` trims, and a
  // padded value would sort below `MIN_ANCHOR` as typed.
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

/**
 * "Add event" from the command palette. The island opens a create draft once
 * and replaces the URL without it, so reload/back do not reopen the editor.
 */
export const NEW_EVENT_HREF = "/calendar?new=event" as Route;

export function wantsNewEvent(searchParams: SearchParams): boolean {
  return first(searchParams.new) === "event";
}
