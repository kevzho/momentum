"use client";

import { useSyncExternalStore } from "react";

import { nowInstant } from "@momentum/core/time";
import type { Instant } from "@momentum/core/types";

/**
 * The current instant, shared by every subscriber on one timer per interval.
 * The server snapshot is `null` on purpose: server-rendered markup must not
 * contain a clock reading or hydration mismatches. Callers render a neutral
 * state while it is null.
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

  // Aligned to the interval boundary: a minute-resolution now-line should move
  // when the wall clock's minute changes, not 43 seconds into it.
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
        // A tab backgrounded for an hour comes back with a stale value; re-reading on
        // the first subscription makes the first paint after remount correct.
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

/** Defaults to a minute. */
export function useNow(intervalMs = 60_000): Instant | null {
  const ticker = tickerFor(intervalMs);
  return useSyncExternalStore(ticker.subscribe, ticker.getSnapshot, serverSnapshot);
}
