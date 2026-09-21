"use client";

import { useCallback, useSyncExternalStore } from "react";

import { isLocalTime, localTime } from "@momentum/core/time";

import { DEFAULT_PREFERENCES, EVENT_LEAD_OPTIONS } from "@/features/reminders/schedule";
import type { ReminderPreferences } from "@/features/reminders/types";

/**
 * Reminder settings, per device like the focus-end notification: the
 * browser's permission is per device, and so is "while Momentum is open
 * here". Stored in `localStorage`; the permission state is read live. The
 * keys already shown live beside them so a reminder fires once per device
 * even across reloads and tabs.
 */

export const REMINDERS_KEY = "momentum.notifications.reminders";
export const SHOWN_KEY = "momentum.notifications.remindersShown";

/** Shown keys older than this are forgotten; nothing reminds of a day two days gone. */
const SHOWN_TTL_MS = 48 * 60 * 60 * 1000;

export type ReminderPermission = "default" | "granted" | "denied";

export interface ReminderPreference {
  supported: boolean;
  /** On only when stored on, supported, and permission granted. */
  enabled: boolean;
  permission: ReminderPermission;
  preferences: ReminderPreferences;
  setEnabled(next: boolean): Promise<void>;
  update(patch: Partial<ReminderPreferences>): void;
}

interface Stored {
  enabled: boolean;
  preferences: ReminderPreferences;
}

interface Snapshot {
  supported: boolean;
  enabled: boolean;
  permission: ReminderPermission;
  preferences: ReminderPreferences;
}

const SERVER_SNAPSHOT: Snapshot = {
  supported: false,
  enabled: false,
  permission: "default",
  preferences: DEFAULT_PREFERENCES,
};

function isSupported(): boolean {
  return typeof window !== "undefined" && typeof window.Notification === "function";
}

function readPermission(): ReminderPermission {
  if (!isSupported()) return "default";
  const permission = window.Notification.permission;
  return permission === "granted" || permission === "denied" ? permission : "default";
}

/** Whatever is stored, coerced field by field so a stale or hand-edited value cannot break the page. */
function readStored(): Stored {
  try {
    const raw = window.localStorage.getItem(REMINDERS_KEY);
    if (raw === null) return { enabled: false, preferences: DEFAULT_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { enabled: false, preferences: DEFAULT_PREFERENCES };
    }
    const record = parsed as Record<string, unknown>;
    return {
      enabled: record.enabled === true,
      preferences: coercePreferences(record.preferences),
    };
  } catch {
    return { enabled: false, preferences: DEFAULT_PREFERENCES };
  }
}

export function coercePreferences(value: unknown): ReminderPreferences {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const lead = record.eventLeadMinutes;
  const digest = record.digestTime;
  const evening = record.eveningTime;
  return {
    eventLeadMinutes:
      EVENT_LEAD_OPTIONS.find((option) => option === lead) ?? DEFAULT_PREFERENCES.eventLeadMinutes,
    digestTime:
      typeof digest === "string" && isLocalTime(digest)
        ? localTime(digest)
        : DEFAULT_PREFERENCES.digestTime,
    eveningTime:
      typeof evening === "string" && isLocalTime(evening)
        ? localTime(evening)
        : DEFAULT_PREFERENCES.eveningTime,
  };
}

function writeStored(next: Stored): void {
  try {
    window.localStorage.setItem(REMINDERS_KEY, JSON.stringify(next));
  } catch {
    // A blocked store means the preference does not persist; nothing else.
  }
}

function currentSnapshot(): Snapshot {
  const supported = isSupported();
  const permission = readPermission();
  const stored = readStored();
  return {
    supported,
    permission,
    enabled: supported && permission === "granted" && stored.enabled,
    preferences: stored.preferences,
  };
}

// `useSyncExternalStore` compares snapshots by identity, so the same values
// must come back as the same object or React re-renders without end.
let cached: Snapshot = SERVER_SNAPSHOT;

function samePreferences(a: ReminderPreferences, b: ReminderPreferences): boolean {
  return (
    a.eventLeadMinutes === b.eventLeadMinutes &&
    a.digestTime === b.digestTime &&
    a.eveningTime === b.eveningTime
  );
}

function getSnapshot(): Snapshot {
  const next = currentSnapshot();
  if (
    next.supported !== cached.supported ||
    next.enabled !== cached.enabled ||
    next.permission !== cached.permission ||
    !samePreferences(next.preferences, cached.preferences)
  ) {
    cached = next;
  }
  return cached;
}

function getServerSnapshot(): Snapshot {
  return SERVER_SNAPSHOT;
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

async function requestPermission(): Promise<ReminderPermission> {
  try {
    await window.Notification.requestPermission();
  } catch {
    // Treated as no answer; the property below still says what the browser thinks.
  }
  return readPermission();
}

export async function setRemindersEnabled(next: boolean): Promise<void> {
  if (!isSupported()) return;
  const stored = readStored();

  if (!next) {
    writeStored({ ...stored, enabled: false });
    emit();
    return;
  }

  const permission = readPermission() === "default" ? await requestPermission() : readPermission();
  writeStored({ ...stored, enabled: permission === "granted" });
  emit();
}

export function updateReminderPreferences(patch: Partial<ReminderPreferences>): void {
  const stored = readStored();
  writeStored({ ...stored, preferences: coercePreferences({ ...stored.preferences, ...patch }) });
  emit();
}

export function useReminderPreference(): ReminderPreference {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setEnabled = useCallback((next: boolean) => setRemindersEnabled(next), []);
  const update = useCallback(
    (patch: Partial<ReminderPreferences>) => updateReminderPreferences(patch),
    [],
  );
  return { ...snapshot, setEnabled, update };
}

// ---- What was already shown --------------------------------------------------

function readShown(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const shown: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number") shown[key] = value;
    }
    return shown;
  } catch {
    return {};
  }
}

export function wasReminderShown(key: string): boolean {
  return key in readShown();
}

/** Records the key with the moment, and drops keys older than two days. */
export function markReminderShown(key: string, nowMs: number): void {
  const shown = readShown();
  shown[key] = nowMs;
  for (const [other, at] of Object.entries(shown)) {
    if (nowMs - at > SHOWN_TTL_MS) delete shown[other];
  }
  try {
    window.localStorage.setItem(SHOWN_KEY, JSON.stringify(shown));
  } catch {
    // Without the store a reminder may repeat after a reload; the tag still collapses duplicates on screen.
  }
}
