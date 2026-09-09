"use client";

import * as React from "react";

import { cadenceOf, isAmountHabit } from "@momentum/core/habits";
import { localTimeOfMinutes, minutesOfLocalTimeValue } from "@momentum/core/time";
import {
  HABIT_FREQUENCY_TYPES,
  PROJECT_COLORS,
  WEEKDAYS,
  type Habit,
  type HabitAmountUnit,
  type HabitFrequencyType,
  type LocalTime,
  type Minutes,
  type ProjectColor,
  type Weekday,
} from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@momentum/ui/components/dialog";
import { DurationInput } from "@momentum/ui/components/duration-input";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { Textarea } from "@momentum/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@momentum/ui/components/toggle-group";

import {
  FREQUENCY_HINTS,
  FREQUENCY_LABELS,
  UNIT_LABELS,
  describeAmount,
} from "@/features/habits/copy";
import { WEEKDAY_NAMES, weekdaysFrom } from "@/features/settings/weekday-names";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * Create/edit habit form. The frequency select decides which other fields are
 * shown, and the submitted values satisfy the `habits` check constraints by
 * construction (the same rules `schemas.ts` re-states for the server).
 */

export interface HabitFormValues {
  name: string;
  description: string | null;
  frequencyType: HabitFrequencyType;
  target: number;
  unit: HabitAmountUnit;
  activeDays: Weekday[];
  preferredStartTime: LocalTime | null;
  estimatedMinutes: Minutes | null;
  xpReward: number;
  color: ProjectColor | null;
}

export interface HabitFormDialogProps {
  open: boolean;
  /** The habit being edited, or null to create one. */
  habit: Habit | null;
  weekStart: Weekday;
  pending: boolean;
  onSubmit: (values: HabitFormValues) => void;
  onClose: () => void;
}

/** The most a habit may award per completion; `habits_xp_reward_chk` says the same. */
const MAX_XP_REWARD = 50;

/** The whole number a field holds, or null while it holds none. */
function integerOf(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}

/** "Days per week" cannot exceed the week; an amount is bounded by the schema. */
function maxTargetOf(frequencyType: HabitFrequencyType): number {
  return frequencyType === "times_per_week" ? 7 : 1000;
}

function clampTarget(value: number, frequencyType: HabitFrequencyType): number {
  return Math.min(maxTargetOf(frequencyType), Math.max(1, value));
}

/** A new habit's defaults: the simplest thing that works, and a modest reward. */
function initialValues(habit: Habit | null): HabitFormValues {
  if (habit === null) {
    return {
      name: "",
      description: null,
      frequencyType: "daily",
      target: 1,
      unit: "count",
      activeDays: [],
      preferredStartTime: null,
      estimatedMinutes: null,
      xpReward: 5,
      color: null,
    };
  }

  return {
    name: habit.name,
    description: habit.description,
    frequencyType: habit.frequencyType,
    target: habit.target,
    unit: habit.unit,
    activeDays: [...habit.activeDays],
    preferredStartTime: habit.preferredStartTime,
    estimatedMinutes: habit.estimatedMinutes,
    xpReward: habit.xpReward,
    color: habit.color,
  };
}

export function HabitFormDialog({ open, habit, ...form }: HabitFormDialogProps) {
  // Opened without a `Dialog.Trigger`, so Radix would otherwise drop focus on `<body>` after close.
  const openerFocus = useOpenerFocus(open);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={openerFocus.onOpenAutoFocus}
        onCloseAutoFocus={openerFocus.onCloseAutoFocus}
        // Create mode has no description, so `aria-describedby` must not point at nothing.
        {...(habit === null ? { "aria-describedby": undefined } : {})}
      >
        <DialogHeader>
          <DialogTitle>{habit === null ? "New habit" : "Edit habit"}</DialogTitle>
          {habit === null ? null : (
            <DialogDescription>
              Changing the target does not rewrite what has already been recorded.
            </DialogDescription>
          )}
        </DialogHeader>
        {/* Keyed so each open starts from that habit's own values. */}
        <HabitForm key={habit?.id ?? "new"} habit={habit} {...form} />
      </DialogContent>
    </Dialog>
  );
}

function HabitForm({
  habit,
  weekStart,
  pending,
  onSubmit,
  onClose,
}: Omit<HabitFormDialogProps, "open">) {
  const ids = React.useId();
  const [values, setValues] = React.useState<HabitFormValues>(() => initialValues(habit));
  const [error, setError] = React.useState<string | null>(null);

  // The numeric fields keep a text draft beside the committed integer: coercing
  // every keystroke would snap an emptied field back to 1, so typing "3" over a
  // cleared "1" would yield "13". Blur and a frequency change resync the draft.
  const [targetDraft, setTargetDraft] = React.useState(() => String(values.target));
  const [xpDraft, setXpDraft] = React.useState(() => String(values.xpReward));

  const set = React.useCallback(
    <K extends keyof HabitFormValues>(key: K, value: HabitFormValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const amount = isAmountHabit(values.frequencyType);
  const perWeek = cadenceOf(values.frequencyType) === "per-week";
  const needsDays = values.frequencyType === "weekdays";
  const needsTarget = amount || values.frequencyType === "times_per_week";

  // Normalises the fields the new shape cannot carry, so the database never refuses the combination.
  function changeFrequency(next: HabitFrequencyType): void {
    const target = next === "daily" || next === "weekdays" ? 1 : clampTarget(values.target, next);
    setTargetDraft(String(target));
    setValues((current) => ({
      ...current,
      frequencyType: next,
      target,
      unit: isAmountHabit(next) ? current.unit : "count",
      activeDays: next === "weekdays" ? current.activeDays : [],
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const name = values.name.trim();
    if (name === "") {
      setError("Give the habit a name.");
      return;
    }
    if (needsDays && values.activeDays.length === 0) {
      setError("Choose at least one day.");
      return;
    }

    setError(null);
    onSubmit({ ...values, name, description: values.description?.trim() || null });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-name`}>Name</Label>
        {/* No `autoFocus`: a field that grabs focus on mount is recorded as the opener, dropping the user on <body> on close. */}
        <Input
          id={`${ids}-name`}
          value={values.name}
          maxLength={100}
          placeholder="Read 20 pages"
          onChange={(event) => set("name", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-frequency`}>How often</Label>
        <Select
          value={values.frequencyType}
          onValueChange={(next) => changeFrequency(next as HabitFrequencyType)}
        >
          <SelectTrigger id={`${ids}-frequency`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HABIT_FREQUENCY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {FREQUENCY_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {values.frequencyType === "daily" ? null : (
          <p className="text-xs text-muted-foreground">{FREQUENCY_HINTS[values.frequencyType]}</p>
        )}
      </div>

      {needsDays ? (
        <div className="flex flex-col gap-1.5">
          <Label id={`${ids}-days`}>Days</Label>
          <ToggleGroup
            type="multiple"
            size="sm"
            variant="outline"
            spacing={0}
            aria-labelledby={`${ids}-days`}
            value={values.activeDays.map(String)}
            onValueChange={(next) =>
              set(
                "activeDays",
                WEEKDAYS.filter((day) => next.includes(String(day))),
              )
            }
          >
            {weekdaysFrom(weekStart).map((day) => (
              <ToggleGroupItem key={day} value={String(day)} aria-label={WEEKDAY_NAMES[day]}>
                {WEEKDAY_NAMES[day].slice(0, 3)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}

      {needsTarget ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={`${ids}-target`}>
              {amount ? `How much ${perWeek ? "a week" : "a day"}` : "Days a week"}
            </Label>
            <Input
              id={`${ids}-target`}
              type="number"
              inputMode="numeric"
              min={1}
              max={maxTargetOf(values.frequencyType)}
              value={targetDraft}
              className="tabular-nums"
              onChange={(event) => {
                setTargetDraft(event.target.value);
                const typed = integerOf(event.target.value);
                if (typed !== null) set("target", clampTarget(typed, values.frequencyType));
              }}
              onBlur={() => setTargetDraft(String(values.target))}
            />
          </div>

          {amount ? (
            <div className="flex w-36 flex-col gap-1.5">
              <Label htmlFor={`${ids}-unit`}>Measured in</Label>
              <Select
                value={values.unit}
                onValueChange={(next) => set("unit", next as HabitAmountUnit)}
              >
                <SelectTrigger id={`${ids}-unit`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(UNIT_LABELS) as HabitAmountUnit[]).map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      {amount ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          Target: {describeAmount(values.target, values.unit)} {perWeek ? "a week" : "a day"}.
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`${ids}-start`}>Preferred time</Label>
          <Input
            id={`${ids}-start`}
            type="time"
            value={values.preferredStartTime ?? ""}
            onChange={(event) => {
              const minutes = minutesOfLocalTimeValue(event.target.value);
              set("preferredStartTime", minutes === null ? null : localTimeOfMinutes(minutes));
            }}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`${ids}-estimate`}>Session length</Label>
          <DurationInput
            id={`${ids}-estimate`}
            value={values.estimatedMinutes}
            onValueChange={(next) => set("estimatedMinutes", next)}
          />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex w-28 flex-col gap-1.5">
          <Label htmlFor={`${ids}-xp`}>Points</Label>
          <Input
            id={`${ids}-xp`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_XP_REWARD}
            value={xpDraft}
            className="tabular-nums"
            onChange={(event) => {
              setXpDraft(event.target.value);
              const typed = integerOf(event.target.value);
              if (typed !== null) set("xpReward", Math.min(MAX_XP_REWARD, Math.max(0, typed)));
            }}
            onBlur={() => setXpDraft(String(values.xpReward))}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`${ids}-color`}>Colour</Label>
          <Select
            value={values.color ?? "none"}
            onValueChange={(next) => set("color", next === "none" ? null : (next as ProjectColor))}
          >
            <SelectTrigger id={`${ids}-color`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No colour</SelectItem>
              {PROJECT_COLORS.map((color) => (
                <SelectItem key={color} value={color}>
                  <span className="flex items-center gap-2">
                    <ProjectDot color={color} />
                    <span className="capitalize">{color}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-notes`}>Notes</Label>
        <Textarea
          id={`${ids}-notes`}
          rows={2}
          value={values.description ?? ""}
          onChange={(event) => set("description", event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" data-pending={pending || undefined}>
          {habit === null ? "Create habit" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
