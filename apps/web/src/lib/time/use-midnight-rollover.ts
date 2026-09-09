"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { nextLocalMidnight, nowInstant } from "@momentum/core/time";
import type { IanaTimeZone } from "@momentum/core/types";

/**
 * Re-renders the current route when the user's local day rolls over.
 *
 * "Today" is computed on the server, once per request, in the profile timezone
 * (docs/ARCHITECTURE.md §10). That is the right answer at render time and the
 * wrong one for a tab left open overnight: the week grid would keep the
 * highlight and the now-line on yesterday's column. A single timer to the next
 * local midnight, followed by `router.refresh()`, makes the server recompute it
 * — no second source of truth for what day it is, and nothing to reconcile.
 *
 * The timeout is re-armed after each rollover, so a tab open for a week keeps
 * working. `nextLocalMidnight` resolves in the profile timezone, so on a DST
 * transition the wait is 23 or 25 hours rather than a hardcoded 24.
 */
export function useMidnightRollover(timezone: IanaTimeZone): void {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function arm() {
      const now = nowInstant();
      const midnight = nextLocalMidnight(timezone, now);
      // A second of slack, so the refresh lands after the boundary rather than
      // in the last millisecond before it.
      const delay = Math.max(1_000, Date.parse(midnight) - Date.parse(now) + 1_000);
      timer = setTimeout(() => {
        router.refresh();
        arm();
      }, delay);
    }

    arm();
    return () => clearTimeout(timer);
  }, [router, timezone]);
}
