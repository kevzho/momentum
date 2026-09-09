import { UTC } from "@momentum/core/time";
import type { IanaTimeZone } from "@momentum/core/types";

/**
 * Every timezone the settings page offers, from the runtime's own tz database:
 * the same one `isIanaTimeZone` validates against on the server. `UTC` is
 * appended because some engines leave it out; the current value is put first
 * so a signed-in user always sees their real setting.
 */
export function timeZoneOptions(current: IanaTimeZone): readonly string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const rest = new Set<string>([...supported, UTC]);
  rest.delete(current);
  return [current, ...rest];
}
