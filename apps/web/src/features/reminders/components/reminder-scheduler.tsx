"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { loadReminderFeed } from "@/features/reminders/actions";
import { buildReminders, delayMs, epochMs, pendingReminders } from "@/features/reminders/schedule";
import type { Reminder, ReminderFeed } from "@/features/reminders/types";
import {
  markReminderShown,
  useReminderPreference,
  wasReminderShown,
} from "@/lib/notifications/reminders";
import { reportError } from "@/lib/report-error";
import { useNow } from "@/lib/time/use-now";

/**
 * Shows reminders while Momentum is open in this browser. Mounted once in
 * the shell; renders nothing. It arms one timer for the soonest pending
 * reminder, shows it through the Notification API, records the key so no
 * tab or reload repeats it, and re-reads the feed every few minutes so a
 * task captured elsewhere or an event moved is reminded of correctly. A
 * click on a notification brings the window back and opens the page.
 */

/** How often the feed is re-read while the page is visible. */
const REFRESH_MS = 5 * 60 * 1000;
/** `setTimeout` overflows past this; a longer wait is re-armed on the next tick. */
const MAX_TIMER_MS = 2_147_000_000;

export function ReminderScheduler({ initialFeed }: { initialFeed: ReminderFeed }) {
  const router = useRouter();
  const { enabled, preferences } = useReminderPreference();
  const [feed, setFeed] = React.useState(initialFeed);
  // Ticks every half minute so a re-check happens even without a timer.
  const now = useNow(30_000);
  // Re-runs the arming effect after a reminder fires, so the next one is armed.
  const [fired, setFired] = React.useState(0);

  // The server's feed is the freshest on every navigation: adopted during
  // render, the way derived state is, rather than a frame later from an effect.
  const [adopted, setAdopted] = React.useState(initialFeed);
  if (initialFeed !== adopted) {
    setAdopted(initialFeed);
    setFeed(initialFeed);
  }

  // Periodic re-read while visible, and once when the tab comes back.
  React.useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    async function refresh(): Promise<void> {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await loadReminderFeed();
        if (!cancelled && result.ok) setFeed(result.data);
      } catch (thrown) {
        reportError(thrown, { source: "ReminderScheduler.refresh" });
      }
    }

    const interval = window.setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  const reminders = React.useMemo(
    () => (enabled ? buildReminders(feed, preferences) : []),
    [enabled, feed, preferences],
  );

  // Arm the soonest pending reminder.
  React.useEffect(() => {
    if (!enabled || now === null) return;
    const pending = pendingReminders(reminders, now, wasReminderShown);
    const next = pending[0];
    if (next === undefined) return;

    const timer = window.setTimeout(
      () => {
        // Another tab may have shown it in the meantime.
        if (wasReminderShown(next.key)) {
          setFired((count) => count + 1);
          return;
        }
        show(next, () => router.push(next.href));
        markReminderShown(next.key, epochMs(now));
        setFired((count) => count + 1);
      },
      Math.min(delayMs(now, next.at), MAX_TIMER_MS),
    );
    return () => window.clearTimeout(timer);
    // `fired` is a deliberate dependency: it re-arms after a reminder shows.
  }, [enabled, now, reminders, router, fired]);

  return null;
}

/** The notification itself; `tag` collapses a duplicate onto the first. */
function show(reminder: Reminder, onOpen: () => void): void {
  if (typeof window.Notification !== "function" || window.Notification.permission !== "granted") {
    return;
  }
  try {
    const notification = new window.Notification(reminder.title, {
      body: reminder.body,
      tag: reminder.key,
    });
    notification.onclick = () => {
      window.focus();
      onOpen();
      notification.close();
    };
  } catch (thrown) {
    // Some browsers refuse `new Notification` from a page (Android Chrome); nothing to do but note it.
    reportError(thrown, { source: "ReminderScheduler.show" });
  }
}
