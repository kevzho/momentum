"use client";

import * as React from "react";

import { PROJECT_COLORS, type ProjectColor } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
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
import { cn } from "@momentum/ui/lib/utils";

import type { ProjectSummary } from "@/features/tasks/types";
import type { ActionError } from "@/lib/actions/result";
import { useOpenerFocus } from "@/lib/use-opener-focus";

export interface ProjectFormValues {
  name: string;
  color: ProjectColor;
}

/** Shown inside the dialog: a toast behind a modal is out of reach. */
export type ProjectFormError = ActionError & { retry?: () => void };

export interface ProjectDialogProps {
  open: boolean;
  /** The project being renamed, or null to create one. */
  project: ProjectSummary | null;
  pending: boolean;
  error: ProjectFormError | null;
  onSubmit: (values: ProjectFormValues) => void;
  onClose: () => void;
}

const DEFAULT_COLOR: ProjectColor = "blue";
/** Mirrors `projects_name_chk`. */
const NAME_MAX_LENGTH = 100;

export function ProjectDialog({ open, project, ...form }: ProjectDialogProps) {
  // Opened without a `Dialog.Trigger`, so Radix has nothing to return focus to.
  const openerFocus = useOpenerFocus(open);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-sm"
        showCloseButton={false}
        onOpenAutoFocus={openerFocus.onOpenAutoFocus}
        onCloseAutoFocus={openerFocus.onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {project === null ? "New project" : "Rename project"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {project === null
              ? "A name and a colour. Tasks filed here leave the inbox."
              : "Every task and block in the project takes the new name and colour."}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so each opening starts from that project's own values. */}
        <ProjectForm key={project?.id ?? "new"} project={project} {...form} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  project,
  pending,
  error,
  onSubmit,
  onClose,
}: Omit<ProjectDialogProps, "open">) {
  const ids = React.useId();
  const [name, setName] = React.useState(project?.name ?? "");
  const [color, setColor] = React.useState<ProjectColor>(project?.color ?? DEFAULT_COLOR);

  const trimmed = name.trim();
  const nameError =
    trimmed.length > NAME_MAX_LENGTH
      ? `Names are at most ${NAME_MAX_LENGTH} characters.`
      : (error?.fieldErrors?.name?.[0] ?? null);
  const canSubmit = !pending && trimmed !== "" && nameError === null;
  const generalError =
    error === null || (error.code === "validation" && error.fieldErrors?.name !== undefined)
      ? null
      : error;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({ name: trimmed, color });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-name`}>Name</Label>
        <Input
          id={`${ids}-name`}
          value={name}
          // `readOnly`, never `disabled`: the browser blurs a disabled element.
          readOnly={pending}
          maxLength={NAME_MAX_LENGTH + 1}
          aria-invalid={nameError === null ? undefined : true}
          aria-describedby={nameError === null ? undefined : `${ids}-name-error`}
          onChange={(event) => setName(event.target.value)}
        />
        {nameError === null ? null : (
          <p id={`${ids}-name-error`} role="alert" className="text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${ids}-color`} className="text-sm leading-none font-medium">
          Colour
        </span>
        <ColorSwatches labelledBy={`${ids}-color`} value={color} onChange={setColor} />
      </div>

      {generalError === null ? null : (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>{generalError.message}</span>
          {generalError.retry === undefined ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              aria-disabled={pending || undefined}
              onClick={() => {
                if (pending) return;
                generalError.retry?.();
              }}
            >
              Retry
            </Button>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          aria-disabled={!canSubmit || undefined}
          className="aria-disabled:opacity-50"
        >
          {project === null ? "Create project" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function colorName(color: ProjectColor): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

// A radio group: one tab stop on the chosen swatch; arrows, Home and End move
// selection with focus.
function ColorSwatches({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
}) {
  const refs = React.useRef(new Map<ProjectColor, HTMLButtonElement>());

  function choose(color: ProjectColor): void {
    onChange(color);
    refs.current.get(color)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const index = PROJECT_COLORS.indexOf(value);
    const last = PROJECT_COLORS.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = index <= 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const color = PROJECT_COLORS[next];
    if (color !== undefined) choose(color);
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-1.5"
      onKeyDown={onKeyDown}
    >
      {PROJECT_COLORS.map((color) => {
        const checked = color === value;
        return (
          <button
            key={color}
            ref={(node) => {
              if (node) refs.current.set(color, node);
              else refs.current.delete(color);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={colorName(color)}
            tabIndex={checked ? 0 : -1}
            onClick={() => choose(color)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md border border-transparent transition-colors duration-fast ease-standard hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-10",
              checked && "border-ring bg-muted",
            )}
          >
            <ProjectDot color={color} className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
