declare const brand: unique symbol;

/** Nominal typing helper. `Brand<string, "Instant">` is a string the compiler will not confuse with a `LocalDate`. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/**
 * An absolute point in time as an ISO-8601 string in UTC with a trailing `Z`,
 * e.g. `2026-09-07T14:00:00.000Z`. Maps 1:1 to a `timestamptz` column.
 * Never carries an offset other than Z (Domain Rule 4).
 */
export type Instant = Brand<string, "Instant">;

/**
 * A calendar date `YYYY-MM-DD`. Only meaningful together with a timezone; the
 * timezone is always the user's profile timezone. Maps 1:1 to a `date` column.
 */
export type LocalDate = Brand<string, "LocalDate">;

/** A wall-clock time `HH:MM` (24-hour) in the user's timezone. */
export type LocalTime = Brand<string, "LocalTime">;

/** An IANA timezone identifier such as `America/New_York`. */
export type IanaTimeZone = Brand<string, "IanaTimeZone">;

/** A whole number of minutes. Durations are never stored as fractional hours or seconds. */
export type Minutes = number;

/** Day of week, `0` = Sunday … `6` = Saturday (the date-fns `weekStartsOn` convention). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Primary keys are UUIDs; deliberately unbranded. */
export type Uuid = string;
