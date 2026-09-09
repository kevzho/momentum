import type { LevelProgress } from "@momentum/core/gamification";

import { cn } from "@momentum/ui/lib/utils";

import { TODAY_COPY } from "@/features/today/copy";

/**
 * Level, progress through it, and what today has added.
 *
 * specs/09-today.md asks the header for "current level and XP progress"; the
 * design system asks that the game layer stay a number and a bar, never a hero
 * banner (Domain Rule 7). This is both: one 24px row, no tile, no icon, no
 * celebration. The top bar carries the same level on every route — here it is
 * joined by the number that is actually today's, which is the question the page
 * exists to answer.
 *
 * Every figure is display-only. XP is computed by trusted database logic and
 * the client never asserts an amount (Domain Rule 6).
 */
export function DayProgress({ level, xpToday }: { level: LevelProgress; xpToday: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-xs font-medium">{TODAY_COPY.progress.level(level.level)}</span>

      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={level.xpForNextLevel}
        aria-valuenow={level.xpIntoLevel}
        aria-label={`Level ${level.level}: ${TODAY_COPY.progress.intoLevel(
          level.xpIntoLevel,
          level.xpForNextLevel,
        )}`}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-base ease-standard"
          style={{ width: `${level.fraction * 100}%` }}
        />
      </span>

      <span data-slot="numeric" className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {TODAY_COPY.progress.intoLevel(level.xpIntoLevel, level.xpForNextLevel)}
      </span>

      <span
        data-slot="numeric"
        className={cn(
          "shrink-0 text-xs font-medium",
          xpToday > 0 ? "text-success" : "text-muted-foreground",
        )}
      >
        {xpToday > 0 ? TODAY_COPY.progress.earnedToday(xpToday) : TODAY_COPY.progress.noneToday}
      </span>
    </div>
  );
}
