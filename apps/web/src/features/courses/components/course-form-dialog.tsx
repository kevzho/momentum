"use client";

import * as React from "react";

import { addDays, diffDays } from "@momentum/core/time";
import { PROJECT_COLORS } from "@momentum/core/types";
import type { LocalDate, ProjectColor, Weekday } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { DatePicker } from "@momentum/ui/components/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@momentum/ui/components/dialog";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { ToggleGroup, ToggleGroupItem } from "@momentum/ui/components/toggle-group";

import type { CourseFormValues, CourseSummary } from "@/features/courses/types";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * Creating and editing a course: the project's name and colour and the
 * course's own fields, in one form. The syllabus and the weeks are edited on
 * the course page itself, where there is room for them.
 */
export interface CourseFormDialogProps {
  open: boolean;
  /** The course being edited, or null to create one. */
  course: CourseSummary | null;
  today: LocalDate;
  weekStart: Weekday;
  pending: boolean;
  onSubmit: (values: CourseFormValues) => void;
  onClose: () => void;
  /** Offered while editing; the confirmation is the caller's. */
  onDelete?: () => void;
}

type Field = "name" | "termStart" | "termEnd";

interface FieldError {
  field: Field;
  message: string;
}

/** A term of roughly one semester, from today. */
const DEFAULT_TERM_DAYS = 15 * 7 - 1;

interface Draft {
  name: string;
  color: ProjectColor;
  code: string;
  instructor: string;
  location: string;
  termStart: LocalDate | null;
  termEnd: LocalDate | null;
}

function initialDraft(course: CourseSummary | null): Draft {
  if (course === null) {
    return {
      name: "",
      color: "blue",
      code: "",
      instructor: "",
      location: "",
      termStart: null,
      termEnd: null,
    };
  }
  return {
    name: course.name,
    color: course.color,
    code: course.course.code ?? "",
    instructor: course.course.instructor ?? "",
    location: course.course.location ?? "",
    termStart: course.course.termStart,
    termEnd: course.course.termEnd,
  };
}

function colorLabel(color: ProjectColor): string {
  return `${color.charAt(0).toUpperCase()}${color.slice(1)}`;
}

export function CourseFormDialog({ open, course, ...form }: CourseFormDialogProps) {
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
      >
        {/* Keyed so each opening starts from the course it was opened for. */}
        {open ? <CourseForm key={course?.course.id ?? "new"} course={course} {...form} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CourseForm({
  course,
  today,
  weekStart,
  pending,
  onSubmit,
  onClose,
  onDelete,
}: Omit<CourseFormDialogProps, "open">) {
  const ids = React.useId();
  const nameRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState<Draft>(() => initialDraft(course));
  const [error, setError] = React.useState<FieldError | null>(null);

  function patch(next: Partial<Draft>): void {
    setDraft((current) => ({ ...current, ...next }));
    setError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;

    const name = draft.name.trim();
    if (name === "") {
      setError({ field: "name", message: "Give the course a name." });
      nameRef.current?.focus();
      return;
    }
    if (draft.termStart === null) {
      setError({ field: "termStart", message: "Pick the day the term starts." });
      return;
    }
    if (draft.termEnd === null) {
      setError({ field: "termEnd", message: "Pick the day the term ends." });
      return;
    }
    if (draft.termEnd < draft.termStart) {
      setError({ field: "termEnd", message: "The term has to end on or after the day it starts." });
      return;
    }
    if (diffDays(draft.termStart, draft.termEnd) >= 366) {
      setError({ field: "termEnd", message: "A term is at most a year." });
      return;
    }

    onSubmit({
      name,
      color: draft.color,
      code: emptyToNull(draft.code),
      instructor: emptyToNull(draft.instructor),
      location: emptyToNull(draft.location),
      termStart: draft.termStart,
      termEnd: draft.termEnd,
    });
  }

  const errorId = `${ids}-error`;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{course === null ? "New course" : "Edit course"}</DialogTitle>
        <DialogDescription>
          {course === null
            ? "A course is a project with a term: its assignments are tasks in that project."
            : "The syllabus and each week's material are edited on the course page."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-name`}>Name</Label>
          <Input
            id={`${ids}-name`}
            ref={nameRef}
            value={draft.name}
            placeholder="Organic Chemistry"
            onChange={(event) => patch({ name: event.target.value })}
            aria-invalid={error?.field === "name" || undefined}
            aria-describedby={error?.field === "name" ? errorId : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-code`}>Code</Label>
          <Input
            id={`${ids}-code`}
            value={draft.code}
            placeholder="CHEM 101"
            maxLength={20}
            onChange={(event) => patch({ code: event.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-instructor`}>Instructor</Label>
          <Input
            id={`${ids}-instructor`}
            value={draft.instructor}
            maxLength={100}
            onChange={(event) => patch({ instructor: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-location`}>Location</Label>
          <Input
            id={`${ids}-location`}
            value={draft.location}
            placeholder="Room 204"
            maxLength={100}
            onChange={(event) => patch({ location: event.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-term-start`}>Term starts</Label>
          <DatePicker
            id={`${ids}-term-start`}
            aria-label="Term starts"
            placeholder="Pick a date"
            clearLabel="Clear"
            value={draft.termStart}
            today={today}
            weekStart={weekStart}
            onValueChange={(termStart) =>
              patch({
                termStart,
                // A start with no end yet suggests a semester; an end the user chose is kept.
                termEnd:
                  draft.termEnd === null && termStart !== null
                    ? addDays(termStart, DEFAULT_TERM_DAYS)
                    : draft.termEnd,
              })
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-term-end`}>Term ends</Label>
          <DatePicker
            id={`${ids}-term-end`}
            aria-label="Term ends"
            placeholder="Pick a date"
            clearLabel="Clear"
            value={draft.termEnd}
            today={draft.termStart ?? today}
            weekStart={weekStart}
            onValueChange={(termEnd) => patch({ termEnd })}
          />
        </div>
      </div>

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
          value={draft.color}
          onValueChange={(next) => {
            const color = PROJECT_COLORS.find((option) => option === next);
            if (color !== undefined) patch({ color });
          }}
        >
          {PROJECT_COLORS.map((option) => (
            <ToggleGroupItem key={option} value={option} className="px-0">
              <ProjectDot color={option} className="size-2.5" />
              <span className="sr-only">{colorLabel(option)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {error === null ? null : (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      )}

      <DialogFooter className="sm:justify-between">
        {onDelete === undefined ? (
          <span />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending) onDelete();
            }}
          >
            Delete course
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending) onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" aria-disabled={pending || undefined}>
            {course === null ? "Create course" : "Save"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
