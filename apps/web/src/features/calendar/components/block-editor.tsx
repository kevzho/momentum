"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarIcon,
  CheckIcon,
  RepeatIcon,
  SquareCheckIcon,
  TimerIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";

import {
  formatDuration,
  formatLocalDate,
  formatMinutesOfDay,
  isLocalDate,
  localDate,
  localDateOf,
  minutesOfLocalTimeValue,
} from "@momentum/core/time";
import { describeRecurrence } from "@momentum/core/recurrence";
import { durationMinutes } from "@momentum/core/time";
import { PROJECT_COLORS } from "@momentum/core/types";
import type {
  BlockKind,
  EventBlock,
  Minutes,
  ProjectColor,
  RecurrenceRule,
} from "@momentum/core/types";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { Button } from "@momentum/ui/components/button";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { SideSheet } from "@momentum/ui/components/side-sheet";
import { Textarea } from "@momentum/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@momentum/ui/components/toggle-group";

import {
  RecurrenceFields,
  fieldsFromRule,
  ruleFromFields,
  type RecurrenceFieldsValue,
} from "@/features/calendar/components/recurrence-fields";
import { completionLabel } from "@/features/calendar/projection";
import { useOpenerFocus } from "@/lib/use-opener-focus";
import type {
  BlockDraft,
  BlockEditorProps,
  BlockEditorValues,
  CalendarItem,
  CalendarSettings,
} from "@/features/calendar/types";

/**
 * Creating and editing a block, in a side sheet. The editor mutates nothing
 * and does not close itself on save: the board owns `pending` and the
 * rollback, so it owns the closing.
 */

/** Minutes in a day. A span's end may exceed it — a block can run past midnight. */
export const MINUTES_PER_DAY: Minutes = 24 * 60;

/** Radix models "no selection" as the empty string, so inheritance needs a value of its own. */
const INHERIT_COLOR = "inherit";

const KIND_LABEL: Record<BlockKind, string> = {
  event: "Event",
  work: "Work block",
  habit: "Habit block",
};

/** The parent the read-only title line is of. */
const OWNER_LABEL: Record<BlockKind, string> = {
  event: "Event",
  work: "Task",
  habit: "Habit",
};

const OWNER_ICON: Record<BlockKind, LucideIcon> = {
  event: CalendarIcon,
  work: SquareCheckIcon,
  habit: RepeatIcon,
};

// Only a plain event owns its title: work and habit blocks display their
// parent's, and an editable field would write a copy that stops tracking it.
function isTitleEditable(draft: BlockDraft): boolean {
  if (draft.mode !== "edit") return true;
  return draft.item.kind === "event" && draft.item.occurrence === null;
}

// An occurrence has times of its own and nothing else; a field that accepts
// what will not be saved is a silent discard.
function isContentEditable(draft: BlockDraft): boolean {
  return draft.mode !== "edit" || draft.item.occurrence === null;
}

// A rule belongs to a plain event or a series (Domain Rule 16): never to a
// work or habit block, and never to one occurrence, which has only its times.
function isRuleEditable(draft: BlockDraft): boolean {
  if (draft.mode !== "edit") return true;
  return draft.item.kind === "event" && draft.item.occurrence === null;
}

/** The rule as the editor holds it: the series' own, minus the timezone the server fixed. */
function ruleOf(series: EventBlock | null): RecurrenceRule | null {
  if (series === null || series.recurrence === null) return null;
  const { freq, interval, byWeekday, until, count } = series.recurrence;
  return { freq, interval, byWeekday, until, count };
}

/** Remounts the form when the editor is pointed at a different draft. */
function draftKey(draft: BlockDraft): string {
  if (draft.mode === "create") return `create:${draft.span.date}:${draft.span.startMinutes}`;
  if (draft.mode === "series") return `series:${draft.series.id}`;
  return `edit:${draft.item.id}`;
}

function asProjectColor(value: string): ProjectColor | null {
  return PROJECT_COLORS.find((color) => color === value) ?? null;
}

function colorLabel(color: ProjectColor): string {
  return `${color.charAt(0).toUpperCase()}${color.slice(1)}`;
}

// The editor works in wall-clock minutes and the board converts them to
// instants; `settings` supplies only the week's first day and the timezone a
// series' first date is read in.
export function BlockEditor({
  draft,
  settings,
  onClose,
  onSubmit,
  onDelete,
  onToggleComplete,
  series,
  onEditSeries,
  onDeleteSeries,
  pending,
}: BlockEditorProps) {
  // The Save button lives in the sheet's footer, outside the form, and is associated by id.
  const formId = React.useId();
  const item = draft?.mode === "edit" ? draft.item : null;
  const seriesRow = draft?.mode === "series" ? draft.series : null;
  // The sheet animates out; the next key must find the block, not the gap
  // before Radix would have restored focus (see `useOpenerFocus`).
  const openerFocus = useOpenerFocus(draft !== null);

  return (
    <SideSheet
      open={draft !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onOpenAutoFocus={openerFocus.onOpenAutoFocus}
      onCloseAutoFocus={openerFocus.onCloseAutoFocus}
      title={
        draft === null || draft.mode === "create"
          ? "New block"
          : draft.mode === "series"
            ? "Repeating event"
            : KIND_LABEL[draft.item.kind]
      }
      footer={
        <div className="flex w-full items-center gap-2">
          {seriesRow === null ? null : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => onDeleteSeries(seriesRow)}
            >
              <Trash2Icon aria-hidden="true" />
              Delete series
            </Button>
          )}
          {item === null ? null : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => onDelete(item)}
            >
              <Trash2Icon aria-hidden="true" />
              Delete
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* Start a focus session from the block; not offered on a completed block. */}
            {item === null || item.work === null || item.completedAt !== null ? null : (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`/focus?task=${item.work.taskId}&minutes=${focusMinutes(item)}`}>
                  <TimerIcon aria-hidden="true" />
                  Start focus
                </Link>
              </Button>
            )}

            {item === null || item.work === null ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => onToggleComplete(item)}
              >
                <CheckIcon aria-hidden="true" />
                {completionLabel(item)}
              </Button>
            )}
            <Button type="submit" form={formId} size="sm" disabled={pending}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      {draft === null ? null : (
        <BlockEditorForm
          key={draftKey(draft)}
          formId={formId}
          draft={draft}
          settings={settings}
          series={series}
          onSubmit={onSubmit}
          onEditSeries={onEditSeries}
        />
      )}
    </SideSheet>
  );
}

// The block's own length, capped at the four hours `focus_planned_chk` allows.
function focusMinutes(item: CalendarItem): Minutes {
  return Math.min(240, Math.max(1, durationMinutes(item.startAt, item.endAt)));
}

type ErrorField = "title" | "date" | "recurrence";

interface FieldError {
  field: ErrorField;
  message: string;
}

function BlockEditorForm({
  formId,
  draft,
  settings,
  series,
  onSubmit,
  onEditSeries,
}: {
  formId: string;
  draft: BlockDraft;
  settings: CalendarSettings;
  series: readonly EventBlock[];
  onSubmit: (draft: BlockDraft, values: BlockEditorValues) => void;
  onEditSeries: (series: EventBlock) => void;
}) {
  const announce = useAnnounce();
  const ids = React.useId();
  const titleRef = React.useRef<HTMLInputElement>(null);
  const dateRef = React.useRef<HTMLInputElement>(null);

  const item = draft.mode === "edit" ? draft.item : null;
  const seriesRow = draft.mode === "series" ? draft.series : null;
  const titleEditable = isTitleEditable(draft);
  const contentEditable = isContentEditable(draft);
  const ruleEditable = isRuleEditable(draft);
  // The series an occurrence came from, for its read-only rule and the way to the series itself.
  const parent = React.useMemo(() => {
    const ref = item?.occurrence ?? null;
    return ref === null ? null : (series.find((row) => row.id === ref.seriesId) ?? null);
  }, [item, series]);

  const [title, setTitle] = React.useState(item?.title ?? seriesRow?.title ?? "");
  const [description, setDescription] = React.useState(
    item?.description ?? seriesRow?.description ?? "",
  );
  const [date, setDate] = React.useState<string>(draft.span.date);
  // The end is held as a clock reading: an end past 1440 fits no
  // `<input type="time">`, so `resolveEnd` reads the day off the two fields.
  const [startMinutes, setStartMinutes] = React.useState<Minutes>(draft.span.startMinutes);
  const [endClock, setEndClock] = React.useState<Minutes>(draft.span.endMinutes % MINUTES_PER_DAY);
  const endMinutes = resolveEnd(startMinutes, endClock);
  // `ownColor`, not `color`: preselecting the resolved colour would write an
  // explicit value onto a block that was following its project.
  const [color, setColor] = React.useState<ProjectColor | null>(
    item?.ownColor ?? seriesRow?.color ?? null,
  );
  const repeatRef = React.useRef<HTMLButtonElement>(null);
  const [fields, setFields] = React.useState<RecurrenceFieldsValue>(() =>
    fieldsFromRule(ruleOf(seriesRow), draft.span.date),
  );
  const [error, setError] = React.useState<FieldError | null>(null);

  function fail(field: ErrorField, message: string, node: HTMLElement | null) {
    setError({ field, message });
    announce(message);
    node?.focus();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (titleEditable && trimmedTitle === "") {
      fail("title", "Give the block a title.", titleRef.current);
      return;
    }
    if (!isLocalDate(date)) {
      fail("date", "Pick a date for this block.", dateRef.current);
      return;
    }

    let recurrence: RecurrenceRule | null = null;
    if (ruleEditable) {
      const resolved = ruleFromFields(fields, localDate(date));
      if (resolved.error !== null) {
        fail("recurrence", resolved.error, repeatRef.current);
        return;
      }
      recurrence = resolved.rule;
    }

    setError(null);
    const trimmedDescription = description.trim();
    onSubmit(draft, {
      title: titleEditable ? trimmedTitle : (item?.title ?? trimmedTitle),
      description: trimmedDescription === "" ? null : trimmedDescription,
      date: localDate(date),
      startMinutes,
      endMinutes,
      color,
      recurrence,
    });
  }

  const valid = isLocalDate(date);
  const crossesMidnight = endMinutes >= MINUTES_PER_DAY;

  return (
    // `noValidate`: the browser's own bubbles would pre-empt the inline messages.
    <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {titleEditable ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-title`}>Title</Label>
          <Input
            id={`${ids}-title`}
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={error?.field === "title" || undefined}
            aria-describedby={error?.field === "title" ? `${ids}-error` : undefined}
          />
          {error?.field === "title" ? (
            <p id={`${ids}-error`} className="text-xs text-destructive">
              {error.message}
            </p>
          ) : null}
        </div>
      ) : item === null ? null : (
        <ReadOnlyTitle item={item} />
      )}

      {contentEditable ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-description`}>Description</Label>
          <Textarea
            id={`${ids}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </div>
      ) : description === "" ? null : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium">Description</span>
          <p className="text-sm whitespace-pre-line">{description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-date`}>Date</Label>
          <Input
            id={`${ids}-date`}
            ref={dateRef}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-invalid={error?.field === "date" || undefined}
            aria-describedby={error?.field === "date" ? `${ids}-error` : undefined}
          />
          {error?.field === "date" ? (
            <p id={`${ids}-error`} className="text-xs text-destructive">
              {error.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-start`}>Start</Label>
          <Input
            id={`${ids}-start`}
            type="time"
            value={formatMinutesOfDay(startMinutes)}
            onChange={(event) => {
              const minutes = minutesOfLocalTimeValue(event.target.value);
              if (minutes !== null) setStartMinutes(minutes);
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-end`}>End</Label>
          <Input
            id={`${ids}-end`}
            type="time"
            value={formatMinutesOfDay(endMinutes)}
            onChange={(event) => {
              const minutes = minutesOfLocalTimeValue(event.target.value);
              if (minutes !== null) setEndClock(minutes);
            }}
          />
        </div>
      </div>

      {valid ? (
        <p data-slot="numeric" className="text-xs text-muted-foreground">
          {formatLocalDate(localDate(date), "medium")} · {formatMinutesOfDay(startMinutes)} –{" "}
          {formatMinutesOfDay(endMinutes)}
          {crossesMidnight ? " next day" : ""} · {formatDuration(endMinutes - startMinutes)}
          {seriesRow === null ? "" : " · first occurrence"}
        </p>
      ) : null}

      {ruleEditable ? (
        <RecurrenceFields
          ids={ids}
          ref={repeatRef}
          value={fields}
          onChange={(next) => {
            setFields(next);
            if (error?.field === "recurrence") setError(null);
          }}
          firstDate={valid ? localDate(date) : null}
          weekStart={settings.weekStart}
          error={error?.field === "recurrence" ? error.message : null}
        />
      ) : parent !== null && parent.recurrence !== null ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium">Series</span>
          <p className="text-sm">
            {describeRecurrence(parent.recurrence, localDateOf(parent.startAt, settings.timezone))}
          </p>
          <p className="text-xs text-muted-foreground">
            Changes here apply to this occurrence only.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onEditSeries(parent)}
          >
            Edit series
          </Button>
        </div>
      ) : null}

      {contentEditable ? (
        <div className="flex flex-col gap-1.5">
          <span id={`${ids}-color`} className="text-sm leading-none font-medium">
            Color
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-labelledby={`${ids}-color`}
            className="flex-wrap"
            value={color ?? INHERIT_COLOR}
            onValueChange={(next) => {
              if (next === "") return;
              setColor(asProjectColor(next));
            }}
          >
            <ToggleGroupItem value={INHERIT_COLOR}>Default</ToggleGroupItem>
            {PROJECT_COLORS.map((option) => (
              <ToggleGroupItem key={option} value={option} className="px-0">
                <ProjectDot color={option} className="size-2.5" />
                <span className="sr-only">{colorLabel(option)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
    </form>
  );
}

function ReadOnlyTitle({ item }: { item: CalendarItem }) {
  const Icon = OWNER_ICON[item.kind];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm leading-none font-medium">{OWNER_LABEL[item.kind]}</span>
      <span className="flex items-center gap-1.5 text-sm">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate">{item.work?.taskTitle ?? item.title}</span>
      </span>
    </div>
  );
}

/** An end at or before the start is the next day's: 23:30 to 00:30 is an hour, not a rejected span. */
export function resolveEnd(startMinutes: Minutes, endClock: Minutes): Minutes {
  return endClock > startMinutes ? endClock : endClock + MINUTES_PER_DAY;
}
