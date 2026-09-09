import type { LevelProgress } from "@momentum/core/gamification";

import { cn } from "@momentum/ui/lib/utils";

import { TODAY_COPY } from "@/features/today/copy";

/** Level, progress through it, and what today has added: one row, no banner. Display-only; the client never asserts XP. */
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
