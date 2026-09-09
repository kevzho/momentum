"use client";

import * as React from "react";

import {
  EMPTY_FILTER,
  isTaskSort,
  type SortDirection,
  type TaskFilter,
  type TaskSort,
} from "@momentum/core/tasks";

// Sort and filter persist in `sessionStorage`, not the URL, and are read via
// `useSyncExternalStore` rather than `useState` seeded in an effect (which
// would cascade a render and flash the default sort on mount).
const KEY = "momentum.tasks.list";

export interface ListPreferences {
  sort: TaskSort;
  direction: SortDirection;
  filter: TaskFilter;
}

export const DEFAULT_PREFERENCES: ListPreferences = {
  // Manual: any other default would hide the order a user just dragged into.
  sort: "manual",
  direction: "asc",
  filter: EMPTY_FILTER,
};

// `snapshot` is cached because `useSyncExternalStore` compares by identity;
// re-parsing JSON on every `getSnapshot` would loop forever. It is also the
// value of record, so a refused write (private mode, full quota) only costs
// persistence across a reload. Only another tab's `storage` event clears it.
let snapshot: ListPreferences | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** `null` drops the cache so the next `getSnapshot` re-reads storage. */
function publish(next: ListPreferences | null): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

// A stable listener identity, so `removeEventListener` matches.
function onStorage(): void {
  publish(null);
}

function getSnapshot(): ListPreferences {
  if (snapshot === null) snapshot = read() ?? DEFAULT_PREFERENCES;
  return snapshot;
}

// The server renders the defaults, and so does the first client paint.
function getServerSnapshot(): ListPreferences {
  return DEFAULT_PREFERENCES;
}

export function useListPreferences(): [
  ListPreferences,
  (update: Partial<ListPreferences>) => void,
] {
  const preferences = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = React.useCallback((patch: Partial<ListPreferences>) => {
    const next = { ...getSnapshot(), ...patch };
    write(next);
    publish(next);
  }, []);

  return [preferences, update];
}

// Storage can throw (private mode, blocked site data); both directions swallow.
function read(): ListPreferences | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return null;
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(preferences: ListPreferences): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // A forgotten sort order is not worth an error.
  }
}

/** Validated field by field: a bad `sort` would index the comparators with `undefined`. */
export function parse(value: unknown): ListPreferences | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const sort = typeof raw.sort === "string" && isTaskSort(raw.sort) ? raw.sort : null;
  if (sort === null) return null;

  const direction: SortDirection = raw.direction === "desc" ? "desc" : "asc";
  const filter = raw.filter as Record<string, unknown> | undefined;
  const priority = filter?.priority;

  return {
    sort,
    direction,
    filter: {
      priority:
        priority === 1 || priority === 2 || priority === 3 || priority === 4 ? priority : null,
      projectId: typeof filter?.projectId === "string" ? filter.projectId : null,
      scheduled:
        filter?.scheduled === "scheduled" || filter?.scheduled === "unscheduled"
          ? filter.scheduled
          : "any",
      search: typeof filter?.search === "string" ? filter.search : "",
    },
  };
}
