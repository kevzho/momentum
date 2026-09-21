"use client";

import * as React from "react";

import type { LocalDate, Uuid } from "@momentum/core/types";

/**
 * The Quick Add handle, separated from the dialog so a page can open it
 * without importing the dialog's server actions. The provider lives in
 * `quick-add.tsx`, mounted once in the shell.
 */
export interface QuickAddContextValue {
  open: (defaults?: QuickAddDefaults) => void;
  /** Page-level defaults for a capture; values passed to `open` win over these. */
  setDefaults: (defaults: QuickAddDefaults) => void;
}

/** What Quick Add captures: a task with a deadline, or an event on a day. */
export type QuickAddKind = "task" | "event";

export interface QuickAddDefaults {
  /** Opens on that capture; the user can switch. Defaults to a task. */
  kind?: QuickAddKind;
  projectId?: Uuid | null;
  /** For an event, the day it is on. */
  dueDate?: LocalDate | null;
  /** Replaces the title field's placeholder for this opening — an example, never a value. */
  placeholder?: string;
}

export const QuickAddContext = React.createContext<QuickAddContextValue | null>(null);

/** A no-op outside the shell, never a thrown error. */
export function useQuickAdd(): QuickAddContextValue {
  return React.useContext(QuickAddContext) ?? { open: noop, setDefaults: noop };
}

function noop() {}
