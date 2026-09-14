"use client";

import * as React from "react";

import { WEEKDAY_SHORT, describeRecurrence, weekOrder } from "@momentum/core/recurrence";
import { isLocalDate, localDate, weekdayOf } from "@momentum/core/time";
import { WEEKDAYS, type LocalDate, type RecurrenceRule, type Weekday } from "@momentum/core/types";

import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@momentum/ui/components/toggle-group";

/**
 * The repeat controls of the block editor. The fields are plain form state;
 * `ruleFromFields` turns them into a `RecurrenceRule` (or a message) on
 * submit, and `fieldsFromRule` seeds them from a series, so any rule the
 * database holds round-trips — including ones an import may write later.
 */

export type RepeatPreset = "none" | "daily" | "weekly" | "biweekly" | "custom";
export type RepeatUnit = "day" | "week";
export type EndsMode = "never" | "until" | "count";

export interface RecurrenceFieldsValue {
  preset: RepeatPreset;
  /** Custom only: every N `unit`s. */
  interval: number;
  unit: RepeatUnit;
  /** Custom weekly only. */
  weekdays: Weekday[];
  ends: EndsMode;
  /** `YYYY-MM-DD` as typed; validated on submit. */
  until: string;
  count: number;
}

export const REPEAT_LABELS: Record<RepeatPreset, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  custom: "Custom…",
};

const ENDS_LABELS: Record<EndsMode, string> = {
  never: "Never",
  until: "On a date",
  count: "After a number of times",
};

const MAX_INTERVAL = 52;
const MAX_COUNT = 365;
const DEFAULT_COUNT = 10;

function sameDays(a: readonly Weekday[] | null, b: readonly Weekday[]): boolean {
  if (a === null) return false;
  const left = weekOrder(a);
  const right = weekOrder(b);
  return left.length === right.length && left.every((day, index) => day === right[index]);
}

/** Seeds the fields from a rule; a rule the presets cannot express opens as Custom. */
export function fieldsFromRule(
  rule: RecurrenceRule | null,
  firstDate: LocalDate,
): RecurrenceFieldsValue {
  const own = [weekdayOf(firstDate)];
  const base: RecurrenceFieldsValue = {
    preset: "none",
    interval: 1,
    unit: "week",
    weekdays: own,
    ends: "never",
    until: "",
    count: DEFAULT_COUNT,
  };
  if (rule === null) return base;

  const ends: Pick<RecurrenceFieldsValue, "ends" | "until" | "count"> = {
    ends: rule.until !== null ? "until" : rule.count !== null ? "count" : "never",
    until: rule.until ?? "",
    count: rule.count ?? DEFAULT_COUNT,
  };

  if (rule.freq === "daily") {
    return rule.interval === 1
      ? { ...base, preset: "daily", ...ends }
      : { ...base, preset: "custom", unit: "day", interval: rule.interval, ...ends };
  }

  const weekdays = rule.byWeekday === null ? own : weekOrder(rule.byWeekday);
  const ownDayOnly = rule.byWeekday === null || sameDays(rule.byWeekday, own);
  if (rule.interval === 1 && ownDayOnly) return { ...base, preset: "weekly", ...ends };
  if (rule.interval === 2 && ownDayOnly) return { ...base, preset: "biweekly", ...ends };
  return { ...base, preset: "custom", unit: "week", interval: rule.interval, weekdays, ...ends };
}

/** The rule the fields describe, or the first thing wrong with them. */
export function ruleFromFields(
  value: RecurrenceFieldsValue,
  firstDate: LocalDate,
): { rule: RecurrenceRule | null; error: null } | { rule: null; error: string } {
  if (value.preset === "none") return { rule: null, error: null };

  let shape: Pick<RecurrenceRule, "freq" | "interval" | "byWeekday">;
  switch (value.preset) {
    case "daily":
      shape = { freq: "daily", interval: 1, byWeekday: null };
      break;
    case "weekly":
      shape = { freq: "weekly", interval: 1, byWeekday: null };
      break;
    case "biweekly":
      shape = { freq: "weekly", interval: 2, byWeekday: null };
      break;
    case "custom": {
      if (
        !Number.isInteger(value.interval) ||
        value.interval < 1 ||
        value.interval > MAX_INTERVAL
      ) {
        return { rule: null, error: `Repeat every 1 to ${MAX_INTERVAL} ${value.unit}s.` };
      }
      if (value.unit === "day") {
        shape = { freq: "daily", interval: value.interval, byWeekday: null };
        break;
      }
      if (value.weekdays.length === 0) return { rule: null, error: "Pick at least one day." };
      shape = { freq: "weekly", interval: value.interval, byWeekday: weekOrder(value.weekdays) };
      break;
    }
  }

  switch (value.ends) {
    case "never":
      return { rule: { ...shape, until: null, count: null }, error: null };
    case "until": {
      if (!isLocalDate(value.until)) return { rule: null, error: "Pick the date it ends on." };
      const until = localDate(value.until);
      if (until < firstDate) {
        return { rule: null, error: "The end date is before the first occurrence." };
      }
      return { rule: { ...shape, until, count: null }, error: null };
    }
    case "count": {
      if (!Number.isInteger(value.count) || value.count < 1 || value.count > MAX_COUNT) {
        return { rule: null, error: `Repeat 1 to ${MAX_COUNT} times.` };
      }
      return { rule: { ...shape, until: null, count: value.count }, error: null };
    }
  }
}

function asPreset(value: string): RepeatPreset | null {
  return (Object.keys(REPEAT_LABELS) as RepeatPreset[]).find((preset) => preset === value) ?? null;
}

function asEnds(value: string): EndsMode | null {
  return (Object.keys(ENDS_LABELS) as EndsMode[]).find((mode) => mode === value) ?? null;
}

function asWeekday(value: string): Weekday | null {
  return WEEKDAYS.find((day) => String(day) === value) ?? null;
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function RecurrenceFields({
  ids,
  value,
  onChange,
  firstDate,
  weekStart,
  error,
  ref,
}: {
  /** The editor's id prefix; controls are `${ids}-repeat`, `-interval`, `-unit`, `-days`, `-ends`, `-until`, `-count`. */
  ids: string;
  value: RecurrenceFieldsValue;
  onChange: (next: RecurrenceFieldsValue) => void;
  /** The occurrence the rule starts from, for the summary and the default weekday. Null while the date field is invalid. */
  firstDate: LocalDate | null;
  weekStart: Weekday;
  error: string | null;
  /** The Repeats trigger, so a failed submit can land focus on it. */
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const days = React.useMemo(
    () => WEEKDAYS.map((offset) => ((weekStart + offset) % 7) as Weekday),
    [weekStart],
  );
  const preview = firstDate === null ? null : ruleFromFields(value, firstDate);
  const summary = preview?.rule ? describeRecurrence(preview.rule, firstDate!) : null;
  const errorId = `${ids}-recurrence-error`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-repeat`}>Repeats</Label>
        <Select
          value={value.preset}
          onValueChange={(next) => {
            const preset = asPreset(next);
            if (preset !== null) onChange({ ...value, preset });
          }}
        >
          <SelectTrigger
            id={`${ids}-repeat`}
            ref={ref}
            className="w-full"
            aria-invalid={error !== null || undefined}
            aria-describedby={error === null ? undefined : errorId}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(REPEAT_LABELS) as RepeatPreset[]).map((preset) => (
              <SelectItem key={preset} value={preset}>
                {REPEAT_LABELS[preset]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.preset === "custom" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`${ids}-interval`} className="shrink-0">
              Every
            </Label>
            <Input
              id={`${ids}-interval`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_INTERVAL}
              value={Number.isNaN(value.interval) ? "" : value.interval}
              className="w-16"
              onChange={(event) => onChange({ ...value, interval: toInt(event.target.value) })}
            />
            <Select
              value={value.unit}
              onValueChange={(next) => {
                if (next === "day" || next === "week") onChange({ ...value, unit: next });
              }}
            >
              <SelectTrigger id={`${ids}-unit`} aria-label="Unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">days</SelectItem>
                <SelectItem value="week">weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.unit === "week" ? (
            <div className="flex flex-col gap-1.5">
              <span id={`${ids}-days`} className="text-sm leading-none font-medium">
                On
              </span>
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                aria-labelledby={`${ids}-days`}
                className="flex-wrap"
                value={value.weekdays.map(String)}
                onValueChange={(next) =>
                  onChange({
                    ...value,
                    weekdays: next.map(asWeekday).filter((day): day is Weekday => day !== null),
                  })
                }
              >
                {days.map((day) => (
                  <ToggleGroupItem key={day} value={String(day)} aria-label={WEEKDAY_SHORT[day]}>
                    {WEEKDAY_SHORT[day]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ) : null}
        </div>
      ) : null}

      {value.preset === "none" ? null : (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-ends`}>Ends</Label>
            <Select
              value={value.ends}
              onValueChange={(next) => {
                const ends = asEnds(next);
                if (ends !== null) onChange({ ...value, ends });
              }}
            >
              <SelectTrigger id={`${ids}-ends`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ENDS_LABELS) as EndsMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {ENDS_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {value.ends === "until" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-until`}>End date</Label>
              <Input
                id={`${ids}-until`}
                type="date"
                value={value.until}
                onChange={(event) => onChange({ ...value, until: event.target.value })}
              />
            </div>
          ) : value.ends === "count" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-count`}>Times</Label>
              <Input
                id={`${ids}-count`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_COUNT}
                value={Number.isNaN(value.count) ? "" : value.count}
                onChange={(event) => onChange({ ...value, count: toInt(event.target.value) })}
              />
            </div>
          ) : null}
        </div>
      )}

      {error !== null ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : summary !== null ? (
        <p className="text-xs text-muted-foreground">{summary}</p>
      ) : null}
    </div>
  );
}
