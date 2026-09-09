"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { nextLocalMidnight, nowInstant } from "@momentum/core/time";
import type { IanaTimeZone } from "@momentum/core/types";

/**
 * Re-renders the current route when the user's local day rolls over. "Today"
 * is computed on the server per request, so one timer to the next local
 * midnight followed by `router.refresh()` keeps a tab left open overnight in
 * step with no second source of truth. `nextLocalMidnight` resolves in the
 * profile timezone, so on a DST transition the wait is 23 or 25 hours.
 */
export function useMidnightRollover(timezone: IanaTimeZone): void {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function arm() {
      const now = nowInstant();
      const midnight = nextLocalMidnight(timezone, now);
      // A second of slack, so the refresh lands after the boundary.
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
