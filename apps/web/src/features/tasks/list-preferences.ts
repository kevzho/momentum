"use client";

import * as React from "react";

import {
  EMPTY_FILTER,
  isTaskSort,
  type SortDirection,
  type TaskFilter,
  type TaskSort,
} from "@momentum/core/tasks";

/**
 * Sort and filter, persisted for the session.
 *
 * The spec asks that they "persist within a session", which is exactly what
 * `sessionStorage` means, and docs/ARCHITECTURE.md §7 assigns that kind of
 * state here rather than to the URL: a sort order is not something anyone
 * links to, and putting it in the address would push the view — which people
 * *do* link to — down among five other parameters.
 *
 * It is read through `useSyncExternalStore`, which is the primitive for exactly
 * this shape: an external store, a server snapshot that differs from the
 * client's, and a subscription. The alternative — `useState` seeded in an
 * effect — is a second render triggered from inside an effect, which React
 * flags as a cascading render and which would also flash the default sort for
 * one frame on every mount.
 */
const KEY = "momentum.tasks.list";

export interface ListPreferences {
  sort: TaskSort;
  direction: SortDirection;
  filter: TaskFilter;
}

export const DEFAULT_PREFERENCES: ListPreferences = {
  // Manual is the default because the list is drag-reorderable: any other
  // default would silently discard the order a user just dragged things into.
  sort: "manual",
  direction: "asc",
  filter: EMPTY_FILTER,
};

/**
 * The store.
 *
 * `snapshot` is cached because `useSyncExternalStore` compares snapshots by
 * identity and calls `getSnapshot` on every render — parsing the JSON each
 * time would return a new object every time and loop forever.
 *
 * It is also the value of record. A write puts the new preferences straight
 * into it and only then tries to persist them, so storage the browser refuses
 * (Safari private mode, site data blocked, a full quota) costs the user their
 * sort order across a reload rather than the ability to change it at all. Only
 * a `storage` event from another tab clears the cache, because that is the one
 * case where the truth really is in storage and not here.
 */
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

/**
 * Publishes `next` and tells React. `null` drops the cache so the next
 * `getSnapshot` re-reads — which is what another tab's write means, and the
 * only reason to go back to storage.
 */
function publish(next: ListPreferences | null): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** A stable listener identity, so `removeEventListener` matches. */
function onStorage(): void {
  publish(null);
}

function getSnapshot(): ListPreferences {
  if (snapshot === null) snapshot = read() ?? DEFAULT_PREFERENCES;
  return snapshot;
}

/** The server has no session storage, so it renders the defaults — and so does the first client paint. */
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

/**
 * Storage can throw — Safari in private mode, a browser configured to block it
 * — and a task list that will not render because a preference could not be read
 * is worse than one that forgot a sort order. Both directions swallow; the
 * caller has already published the value, so a refused write loses nothing the
 * session can still see.
 */
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
    /* Not being able to remember a sort order is not worth an error. */
  }
}

/**
 * Validated on the way in, field by field. The value came from a store the user
 * can edit, and a bad `sort` would index the comparators with `undefined` and
 * throw on the first render.
 */
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
