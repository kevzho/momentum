import { UTC } from "@momentum/core/time";
import type { IanaTimeZone } from "@momentum/core/types";

/**
 * Every timezone the settings page offers.
 *
 * The runtime's own tz database, through `Intl.supportedValuesOf` — the same
 * database `isIanaTimeZone` validates against on the server, so a zone offered
 * here is a zone the profile accepts, and a curated list that left someone's
 * country out (the four this page shipped with did) cannot happen again. Every
 * date boundary in the product resolves in this one setting (Domain Rule 4);
 * a user who cannot set it correctly has a wrong "today" everywhere.
 *
 * `UTC` is appended because the product falls back to it and some engines
 * leave it out of the list; the current value is put first so a signed-in user
 * always sees their real setting, even one the engine no longer names. A
 * runtime without `supportedValuesOf` still gets a working control with those
 * two entries rather than an empty one.
 */
export function timeZoneOptions(current: IanaTimeZone): readonly string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const rest = new Set<string>([...supported, UTC]);
  rest.delete(current);
  return [current, ...rest];
}
