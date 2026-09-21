"use client";

import * as React from "react";

import { Input } from "@momentum/ui/components/input";
import { Textarea } from "@momentum/ui/components/textarea";

/**
 * Text fields that commit on blur (and, for the single-line one, on Enter)
 * rather than per keystroke, so a server write happens once per edit. Escape
 * abandons the draft and stays in the field: a `blur()` would land on
 * `<body>`. While unfocused they show the value from props, so a refresh that
 * brings back the saved text never fights a draft.
 */

interface CommittedProps {
  id?: string;
  value: string;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  onCommit: (value: string) => void;
}

export function CommittedInput({ value, onCommit, ...props }: CommittedProps) {
  const [draft, setDraft] = React.useState(value);
  const [editing, setEditing] = React.useState(false);
  // Enter commits and keeps focus, so the blur that follows commits only what changed after it.
  const committed = React.useRef(value);

  function commit(next: string): void {
    if (next === committed.current) return;
    committed.current = next;
    onCommit(next);
  }

  return (
    <Input
      {...props}
      value={editing ? draft : value}
      onFocus={() => {
        committed.current = value;
        setDraft(value);
        setEditing(true);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(draft);
        }
        if (event.key === "Escape") setDraft(committed.current);
      }}
      onBlur={() => {
        setEditing(false);
        commit(draft);
      }}
    />
  );
}

export function CommittedTextarea({
  value,
  onCommit,
  rows = 3,
  ...props
}: CommittedProps & { rows?: number }) {
  const [draft, setDraft] = React.useState(value);
  const [editing, setEditing] = React.useState(false);

  return (
    <Textarea
      {...props}
      rows={rows}
      value={editing ? draft : value}
      onFocus={() => {
        setDraft(value);
        setEditing(true);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setDraft(value);
      }}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}
