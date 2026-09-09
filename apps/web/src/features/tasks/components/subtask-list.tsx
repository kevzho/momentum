"use client";

import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from "lucide-react";

import type { Task } from "@momentum/core/types";
import type { Uuid } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { Checkbox } from "@momentum/ui/components/checkbox";
import { Input } from "@momentum/ui/components/input";
import { cn } from "@momentum/ui/lib/utils";

// The database enforces subtask depth and project inheritance
// (`enforce_subtask_depth()`); nothing here has to.
export function SubtaskList({
  subtasks,
  disabled,
  pendingIds,
  inputRef,
  onAdd,
  onToggle,
  onMove,
  onDelete,
}: {
  subtasks: readonly Task[];
  disabled: boolean;
  pendingIds: ReadonlySet<Uuid>;
  /** Where the sheet puts focus once a subtask's own controls are gone. */
  inputRef?: React.Ref<HTMLInputElement>;
  onAdd: (title: string) => void;
  onToggle: (id: Uuid, completed: boolean) => void;
  onMove: (id: Uuid, toIndex: number) => void;
  onDelete: (id: Uuid) => void;
}) {
  const [title, setTitle] = React.useState("");
  const done = subtasks.filter((task) => task.status === "completed").length;

  function submit(): void {
    const trimmed = title.trim();
    if (disabled || trimmed === "") return;
    onAdd(trimmed);
    setTitle("");
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Subtasks
        </h3>
        {subtasks.length > 0 ? (
          <span data-slot="numeric" className="text-xs text-muted-foreground">
            {done}/{subtasks.length}
          </span>
        ) : null}
      </div>

      {subtasks.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {subtasks.map((subtask, index) => {
            const completed = subtask.status === "completed";
            const atTop = disabled || index === 0;
            const atBottom = disabled || index === subtasks.length - 1;
            return (
              <li
                key={subtask.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60",
                  pendingIds.has(subtask.id) && "opacity-60",
                )}
              >
                <Checkbox
                  checked={completed}
                  aria-disabled={disabled || undefined}
                  onCheckedChange={(next) => {
                    if (disabled) return;
                    onToggle(subtask.id, next === true);
                  }}
                  aria-label={
                    completed ? `Reopen "${subtask.title}"` : `Complete "${subtask.title}"`
                  }
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    completed && "text-muted-foreground line-through",
                  )}
                >
                  {subtask.title}
                </span>

                <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-fast group-focus-within:opacity-100 group-hover:opacity-100">
                  {/* `aria-disabled` plus a guard, never native `disabled`: both
                      conditions turn true because the button was pressed, and the
                      browser blurs a natively disabled element. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-disabled={atTop || undefined}
                    className="aria-disabled:opacity-50"
                    onClick={() => {
                      if (atTop) return;
                      onMove(subtask.id, index - 1);
                    }}
                  >
                    <ChevronUpIcon aria-hidden="true" />
                    <span className="sr-only">{`Move "${subtask.title}" up`}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-disabled={atBottom || undefined}
                    className="aria-disabled:opacity-50"
                    onClick={() => {
                      if (atBottom) return;
                      onMove(subtask.id, index + 1);
                    }}
                  >
                    <ChevronDownIcon aria-hidden="true" />
                    <span className="sr-only">{`Move "${subtask.title}" down`}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-disabled={disabled || undefined}
                    className="aria-disabled:opacity-50"
                    onClick={() => {
                      if (disabled) return;
                      onDelete(subtask.id);
                    }}
                  >
                    <TrashIcon aria-hidden="true" />
                    <span className="sr-only">{`Delete "${subtask.title}"`}</span>
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Not natively disabled in flight: the browser would blur the input that pressed Enter. */}
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={title}
          placeholder="Add a subtask"
          aria-label="New subtask"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Enter must not submit or close the sheet.
            event.preventDefault();
            submit();
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-disabled={disabled || title.trim() === "" || undefined}
          className="aria-disabled:opacity-50"
          onClick={submit}
        >
          <PlusIcon aria-hidden="true" />
          <span className="sr-only">Add subtask</span>
        </Button>
      </div>
    </section>
  );
}
