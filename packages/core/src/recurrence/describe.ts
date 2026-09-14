import type { Recurrence, RecurrenceRule } from "../types/calendar";
import type { LocalDate, Weekday } from "../types/scalars";
import { formatLocalDate, weekdayOf } from "../time";

/**
 * A rule as a sentence, for the editor's summary line, announcements and the
 * accessible name of a series: "Repeats every 2 weeks on Mon and Wed until
 * Dec 11, 2026". `firstDate` supplies the weekday when the rule names none.
 */

/** Three-letter weekday labels, shared by the sentence and the editor's day toggles. */
export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** Monday first, so a rule reads the way a week is planned; duplicates collapse. */
export function weekOrder(days: readonly Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

/** The weekdays a rule selects: its own, or the first occurrence's. */
export function selectedWeekdays(
  rule: Pick<RecurrenceRule, "freq" | "byWeekday">,
  firstDate: LocalDate,
): Weekday[] {
  if (rule.freq !== "weekly") return [];
  return weekOrder(rule.byWeekday ?? [weekdayOf(firstDate)]);
}

function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function describeRecurrence(
  rule: RecurrenceRule | Recurrence,
  firstDate: LocalDate,
): string {
  let text: string;
  if (rule.freq === "daily") {
    text = rule.interval === 1 ? "Repeats every day" : `Repeats every ${rule.interval} days`;
  } else {
    const days = selectedWeekdays(rule, firstDate).map((day) => WEEKDAY_SHORT[day]);
    const unit = rule.interval === 1 ? "week" : `${rule.interval} weeks`;
    text = `Repeats every ${unit} on ${listOf(days)}`;
  }

  if (rule.until !== null) return `${text} until ${formatLocalDate(rule.until, "medium")}`;
  if (rule.count !== null) return `${text}, ${rule.count} ${rule.count === 1 ? "time" : "times"}`;
  return text;
}
