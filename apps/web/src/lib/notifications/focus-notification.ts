"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The focus-end notification, a per-device preference: the browser's permission
 * is per-device too. Stored in `localStorage`, read through
 * `useSyncExternalStore` so the server and first client render agree (the
 * server snapshot says "unsupported, off"); the permission state is read live.
 */

export const FOCUS_NOTIFICATION_KEY = "momentum.notifications.focusEnd";

/** The tag makes a second notification replace the first instead of stacking. */
const NOTIFICATION_TAG = "momentum-focus";

const NOTIFICATION_TITLE = "Focus session finished";

export type FocusNotificationPermission = "default" | "granted" | "denied";

export interface FocusNotificationPreference {
  /** False where the Notification API is missing: iOS Safari in a tab, or the server. */
  supported: boolean;
  /** On only when stored on, supported, and permission granted. */
  enabled: boolean;
  permission: FocusNotificationPermission;
  /** Asks for permission the first time it is switched on; stays off if refused. */
  setEnabled(next: boolean): Promise<void>;
}

interface Snapshot {
  supported: boolean;
  enabled: boolean;
  permission: FocusNotificationPermission;
}

const SERVER_SNAPSHOT: Snapshot = { supported: false, enabled: false, permission: "default" };

function isSupported(): boolean {
  return typeof window !== "undefined" && typeof window.Notification === "function";
}

function readPermission(): FocusNotificationPermission {
  if (!isSupported()) return "default";
  const permission = window.Notification.permission;
  return permission === "granted" || permission === "denied" ? permission : "default";
}

function readStored(): boolean {
  try {
    return window.localStorage.getItem(FOCUS_NOTIFICATION_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStored(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(FOCUS_NOTIFICATION_KEY, "true");
    else window.localStorage.removeItem(FOCUS_NOTIFICATION_KEY);
  } catch {
    // A blocked store means the preference does not persist; nothing else.
  }
}

function currentSnapshot(): Snapshot {
  const supported = isSupported();
  const permission = readPermission();
  return {
    supported,
    permission,
    enabled: supported && permission === "granted" && readStored(),
  };
}

// `useSyncExternalStore` compares snapshots by identity, so the same values
// must come back as the same object or React re-renders without end.
let cached: Snapshot = SERVER_SNAPSHOT;

function getSnapshot(): Snapshot {
  const next = currentSnapshot();
  if (
    next.supported !== cached.supported ||
    next.enabled !== cached.enabled ||
    next.permission !== cached.permission
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
  // Another tab changing the preference is the same change here.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

async function requestPermission(): Promise<FocusNotificationPermission> {
  try {
    // Older Safari takes a callback and returns nothing; reading the property
    // afterwards covers both shapes.
    await window.Notification.requestPermission();
  } catch {
    // Treated as no answer; the property below still says what the browser thinks.
  }
  return readPermission();
}

export async function setFocusNotificationEnabled(next: boolean): Promise<void> {
  if (!isSupported()) return;

  if (!next) {
    writeStored(false);
    emit();
    return;
  }

  const permission = readPermission() === "default" ? await requestPermission() : readPermission();
  writeStored(permission === "granted");
  emit();
}

export function useFocusNotificationPreference(): FocusNotificationPreference {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setEnabled = useCallback((next: boolean) => setFocusNotificationEnabled(next), []);

  return {
    supported: snapshot.supported,
    enabled: snapshot.enabled,
    permission: snapshot.permission,
    setEnabled,
  };
}

/** Shows the notification with `title` as its body. Does nothing unless supported, enabled and granted. */
export function notifyFocusEnded(title: string): void {
  if (!currentSnapshot().enabled) return;

  let notification: Notification;
  try {
    notification = new window.Notification(NOTIFICATION_TITLE, {
      body: title,
      tag: NOTIFICATION_TAG,
    });
  } catch {
    // Some browsers expose the constructor and refuse to run it outside a service worker.
    return;
  }

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
