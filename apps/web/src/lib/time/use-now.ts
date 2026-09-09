"use client";

import { useSyncExternalStore } from "react";

import { nowInstant } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

/**
 * The current instant, for the handful of components whose output depends on
 * it: the calendar's now-line, past/current/future styling, relative times,
 * the focus timer.
 *
 * The server snapshot is `null` on purpose. Server-rendered markup must not
 * contain a clock reading, or the first client render disagrees with it and
 * React reports a hydration mismatch — the failure this pattern exists to
 * prevent (docs/ARCHITECTURE.md §10). Callers render a neutral state while the
 * value is null, and the time-dependent state once it arrives.
 *
 * One timer per interval, shared by every subscriber, so a week of blocks does
 * not create a week of intervals.
 */

interface Ticker {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => Instant;
}

const tickers = new Map<number, Ticker>();

function tickerFor(intervalMs: number): Ticker {
  const existing = tickers.get(intervalMs);
  if (existing) return existing;

  const listeners = new Set<() => void>();
  let current = nowInstant();
  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Aligned to the interval boundary rather than to the moment of subscription:
   * a minute-resolution now-line should move when the wall clock's minute
   * changes, not 43 seconds into it.
   */
  function schedule() {
    const delay = intervalMs - (Date.now() % intervalMs);
    timer = setTimeout(() => {
      current = nowInstant();
      for (const listener of listeners) listener();
      schedule();
    }, delay);
  }

  const ticker: Ticker = {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      if (listeners.size === 1) {
        // A tab that was backgrounded for an hour comes back with a stale
        // value; re-reading on the first subscription makes the first paint
        // after remount correct rather than one interval late.
        current = nowInstant();
        schedule();
      }
      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0 && timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      };
    },
    getSnapshot: () => current,
  };

  tickers.set(intervalMs, ticker);
  return ticker;
}

function serverSnapshot(): null {
  return null;
}

/** Defaults to a minute, which is the resolution everything time-dependent in Momentum needs. */
export function useNow(intervalMs = 60_000): Instant | null {
  const ticker = tickerFor(intervalMs);
  return useSyncExternalStore(ticker.subscribe, ticker.getSnapshot, serverSnapshot);
}
