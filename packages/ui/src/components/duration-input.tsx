"use client";

import * as React from "react";
import { cn } from "cn";

import { formatDuration, parseDuration } from "@momentum/core/time";
import type { Minutes } from "@momentum/core/types";

import { Input } from "@momentum/ui/components/input";

/**
 * Accepts `45`, `45m`, `1h30`, `1.5h`, `2:30`. Keystrokes stay untouched while
 * focused; commits on blur and Enter. Empty means null, not zero.
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

  // While typing the text wins; afterwards the value does, even if it changed underneath.
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
          // Enter commits the field without submitting the surrounding form.
          event.preventDefault();
          commit(text);
        }
        onKeyDown?.(event);
      }}
      onBlur={(event) => {
        setEditing(false);
        // An unreadable draft is discarded on blur; the committed value shown again is valid.
        if (!commit(event.target.value)) setInvalid(false);
        onBlur?.(event);
      }}
    />
  );
}

export { DurationInput };
