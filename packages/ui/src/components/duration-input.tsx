"use client";

import * as React from "react";
import { cn } from "cn";

import { formatDuration, parseDuration } from "@momentum/core/time";
import type { Minutes } from "@momentum/core/types";

import { Input } from "@momentum/ui/components/input";

/**
 * An estimate, typed the way people type estimates: `45`, `45m`, `1h30`,
 * `1.5h`, `2:30`.
 *
 * The parsing lives in `@momentum/core/time` (Domain Rule 5); this component
 * owns only the editing behaviour, which is the part that is easy to get wrong:
 *
 * - **The text is not the value.** While the field has focus the user's own
 *   keystrokes stay on screen untouched — a field that rewrote "1h3" to "1h" on
 *   the way to "1h30" would be unusable. It commits on blur and on Enter, and
 *   only then normalises to the canonical form.
 * - **Empty means null, not zero.** "No estimate" and "an estimate of nothing"
 *   are different facts about a task, and `coverageOf` treats them differently.
 * - **Unreadable input is reported, not swallowed.** The field goes
 *   `aria-invalid` and keeps the text, rather than silently discarding it.
 */
function DurationInput({
  value,
  onValueChange,
  className,
  onBlur,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  /** Minutes, or null for "not estimated". */
  value: Minutes | null;
  onValueChange: (value: Minutes | null) => void;
}) {
  const committed = value === null ? "" : formatDuration(value);
  const [text, setText] = React.useState(committed);
  const [editing, setEditing] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);

  // While the user is typing, their text wins. Once they are done, the value
  // does — including when it changed underneath (a server reconcile, an undo).
  const shown = editing ? text : committed;

  /** Parses and commits; `false` when the text could not be read. */
  function commit(raw: string): boolean {
    const trimmed = raw.trim();

    if (trimmed === "") {
      setInvalid(false);
      onValueChange(null);
      return true;
    }

    const minutes = parseDuration(trimmed);
    if (minutes === null || minutes <= 0) {
      setInvalid(true);
      return false;
    }

    setInvalid(false);
    onValueChange(minutes);
    return true;
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="text"
      autoComplete="off"
      value={shown}
      aria-invalid={invalid || undefined}
      placeholder={props.placeholder ?? "e.g. 1h 30m"}
      className={cn("tabular-nums", className)}
      onFocus={(event) => {
        setEditing(true);
        setText(committed);
        props.onFocus?.(event);
      }}
      onChange={(event) => {
        setText(event.target.value);
        if (invalid) setInvalid(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          // Committing on Enter must not also submit the form around it: the
          // first Enter is "I have finished this field".
          event.preventDefault();
          commit(text);
        }
        onKeyDown?.(event);
      }}
      onBlur={(event) => {
        setEditing(false);
        // Leaving the field discards an unreadable draft: what shows again is
        // the committed value, which is valid, so the field must not keep
        // saying otherwise.
        if (!commit(event.target.value)) setInvalid(false);
        onBlur?.(event);
      }}
    />
  );
}

export { DurationInput };
