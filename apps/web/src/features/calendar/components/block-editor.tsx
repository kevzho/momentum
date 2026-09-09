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
  minutesOfLocalTimeValue,
} from "@momentum/core/time";
import { durationMinutes } from "@momentum/core/time";
import { PROJECT_COLORS } from "@momentum/core/types";
import type { BlockKind, Minutes, ProjectColor } from "@momentum/core/types";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { Button } from "@momentum/ui/components/button";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { SideSheet } from "@momentum/ui/components/side-sheet";
import { Textarea } from "@momentum/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@momentum/ui/components/toggle-group";

import { completionLabel } from "@/features/calendar/projection";
import { useOpenerFocus } from "@/lib/use-opener-focus";
import type {
  BlockDraft,
  BlockEditorProps,
  BlockEditorValues,
  CalendarItem,
} from "@/features/calendar/types";

/**
 * Creating and editing a block, in a side sheet.
 *
 * docs/DESIGN_SYSTEM.md lists `SideSheet` as the modal-free detail surface for
 * exactly this ("task detail, block edit"), and the spec's "popover" is the
 * worse surface here: a popover anchored to an absolutely-positioned block
 * inside a scrolling grid moves with the grid, is clipped by it, and gets in
 * the way of the time the user is trying to see. The sheet sits beside the
 * board, keeps the block visible, and already solves focus and Escape.
 *
 * The editor mutates nothing. It reports intent through the callbacks in its
 * props and the board routes them through `useOptimisticAction`
 * (docs/ARCHITECTURE.md §8), which is also why it does not close itself on
 * save: the board owns `pending` and the rollback, so it owns the closing.
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

/** What the read-only title line is *of*: the parent the block takes its name from. */
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

/**
 * Only a plain event owns its title.
 *
 * A work block displays its task's and a habit block its habit's, so an
 * editable field here would write a copy into `calendar_blocks.title` that
 * silently stops tracking the parent (Domain Rule 2 — the block is time
 * allocated toward the task, not a second copy of it). An occurrence of a
 * recurring event owns nothing of its own until an override exists, and the
 * recurring-event editor is an explicit non-goal of this phase
 * (specs/03-weekly-calendar.md), so its title is the series' too.
 */
function isTitleEditable(draft: BlockDraft): boolean {
  if (draft.mode === "create") return true;
  return draft.item.kind === "event" && draft.item.occurrence === null;
}

/**
 * An occurrence of a recurring event has times of its own and nothing else:
 * the board writes its span through the override path and nothing writes its
 * content (the recurring-event editor is the non-goal above). A field that
 * accepts what will not be saved is a silent discard, so the occurrence's
 * description and colour are not offered as fields at all.
 */
function isContentEditable(draft: BlockDraft): boolean {
  return draft.mode === "create" || draft.item.occurrence === null;
}

/** Remounts the form when the editor is pointed at a different draft. */
function draftKey(draft: BlockDraft): string {
  return draft.mode === "create"
    ? `create:${draft.span.date}:${draft.span.startMinutes}`
    : `edit:${draft.item.id}`;
}

function asProjectColor(value: string): ProjectColor | null {
  return PROJECT_COLORS.find((color) => color === value) ?? null;
}

/** The palette's names are the accessible names of the swatches; colour is never the only signal. */
function colorLabel(color: ProjectColor): string {
  return `${color.charAt(0).toUpperCase()}${color.slice(1)}`;
}

// `settings` is deliberately unused: the editor works entirely in wall-clock
// minutes on a named day, and the board converts that to instants with the
// profile timezone (`fromLocal`). Nothing here needs the grid spec either.
export function BlockEditor({
  draft,
  onClose,
  onSubmit,
  onDelete,
  onToggleComplete,
  pending,
}: BlockEditorProps) {
  // The Save button lives in the sheet's footer, outside the form element, and
  // is associated with it by id rather than by lifting the form's state up.
  const formId = React.useId();
  const item = draft?.mode === "edit" ? draft.item : null;
  // `open` as well as the handlers: the sheet animates out, and a keyboard
  // user's next key must find the block, not the ~200ms gap before Radix
  // would have restored it (see `useOpenerFocus`).
  const openerFocus = useOpenerFocus(draft !== null);

  return (
    <SideSheet
      open={draft !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onOpenAutoFocus={openerFocus.onOpenAutoFocus}
      onCloseAutoFocus={openerFocus.onCloseAutoFocus}
      title={draft === null || draft.mode === "create" ? "New block" : KIND_LABEL[draft.item.kind]}
      footer={
        <div className="flex w-full items-center gap-2">
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
            {/*
              Starting a focus session from the block that reserved the time
              (Phase 7). The block's own length becomes the session's planned
              length, so the reservation and the measurement start out agreeing;
              the user can still change it on `/focus` before pressing start.
              A completed block does not offer it — the span it named has
              already been executed.
            */}
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
        <BlockEditorForm key={draftKey(draft)} formId={formId} draft={draft} onSubmit={onSubmit} />
      )}
    </SideSheet>
  );
}

/**
 * The length a block's "Start focus" suggests.
 *
 * The block's own elapsed length, so the reservation and the measurement start
 * out agreeing. `focus_planned_chk` caps a session at four hours, so a longer
 * block suggests the cap rather than a length the database would refuse; the
 * user can change it on `/focus` before pressing start either way.
 */
function focusMinutes(item: CalendarItem): Minutes {
  return Math.min(240, Math.max(1, durationMinutes(item.startAt, item.endAt)));
}

type ErrorField = "title" | "date";

interface FieldError {
  field: ErrorField;
  message: string;
}

function BlockEditorForm({
  formId,
  draft,
  onSubmit,
}: {
  formId: string;
  draft: BlockDraft;
  onSubmit: (draft: BlockDraft, values: BlockEditorValues) => void;
}) {
  const announce = useAnnounce();
  const ids = React.useId();
  const titleRef = React.useRef<HTMLInputElement>(null);
  const dateRef = React.useRef<HTMLInputElement>(null);

  const item = draft.mode === "edit" ? draft.item : null;
  const titleEditable = isTitleEditable(draft);
  const contentEditable = isContentEditable(draft);

  const [title, setTitle] = React.useState(item?.title ?? "");
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [date, setDate] = React.useState<string>(draft.span.date);
  // Minutes rather than clock strings, and the end as a clock reading: a block
  // that ends after midnight has an end past 1440, which no `<input
  // type="time">` can hold. Which day the end falls on is not typed, it is
  // read off the two fields by `resolveEnd` — an end at or before the start is
  // the next day's — so 23:30 to 00:30 is an overnight block and the summary
  // says so, rather than a rejected one.
  const [startMinutes, setStartMinutes] = React.useState<Minutes>(draft.span.startMinutes);
  const [endClock, setEndClock] = React.useState<Minutes>(draft.span.endMinutes % MINUTES_PER_DAY);
  const endMinutes = resolveEnd(startMinutes, endClock);
  // `ownColor`, not `color`: the resolved colour is what the block is *drawn*
  // in, and preselecting it would write an explicit value onto a block that was
  // following its project and silently stop it tracking (see `CalendarItem`).
  const [color, setColor] = React.useState<ProjectColor | null>(item?.ownColor ?? null);
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

    setError(null);
    const trimmedDescription = description.trim();
    onSubmit(draft, {
      title: titleEditable ? trimmedTitle : (item?.title ?? trimmedTitle),
      description: trimmedDescription === "" ? null : trimmedDescription,
      date: localDate(date),
      startMinutes,
      endMinutes,
      color,
    });
  }

  const valid = isLocalDate(date);
  const crossesMidnight = endMinutes >= MINUTES_PER_DAY;

  return (
    // `noValidate`: the browser's own bubbles would pre-empt the inline
    // messages below, which are the ones that say what to do about it.
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
        </p>
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

/**
 * The name a block cannot edit here, labelled by whose name it is: a work
 * block's task, a habit block's habit, an occurrence's event.
 */
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

/**
 * The end a start and an end clock reading describe. An end at or before the
 * start is the next day's — 23:30 to 00:30 is an hour, not a rejected span —
 * and the editor's summary says "next day" for it.
 */
export function resolveEnd(startMinutes: Minutes, endClock: Minutes): Minutes {
  return endClock > startMinutes ? endClock : endClock + MINUTES_PER_DAY;
}
