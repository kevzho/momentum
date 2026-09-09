"use client";

import * as React from "react";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { toast } from "@momentum/ui/components/toast";

import { PROGRESS_COPY } from "@/features/gamification/copy";
import type { ProgressBadge } from "@/features/gamification/types";

/**
 * Celebrates by comparing each new `ProgressBadge` with the last one seen;
 * both were computed by the server, nothing is asserted by the client. At most
 * one celebration per update (achievement over level over goal), and a
 * celebration suppresses the XP toast. This is the only place an XP or
 * celebration toast is announced: `toast.xp` and `toast.celebrate` speak
 * nothing themselves and sonner's live region is off in the toast primitive.
 */
export function ProgressProvider({
  badge,
  children,
}: {
  badge: ProgressBadge;
  children?: React.ReactNode;
}) {
  const announce = useAnnounce();
  const previous = React.useRef<ProgressBadge | null>(null);

  React.useEffect(() => {
    const before = previous.current;
    previous.current = badge;

    // First render establishes the baseline and celebrates nothing.
    if (before === null) return;

    const newlyUnlocked = badge.unlocked.filter(
      (achievement) => !before.unlocked.some((seen) => seen.key === achievement.key),
    );

    if (newlyUnlocked.length > 0) {
      const first = newlyUnlocked[0];
      if (first !== undefined) {
        toast.celebrate({ kind: "achievement", title: first.name });
        announce(`Achievement unlocked: ${first.name}`);
      }
      return;
    }

    if (badge.level > before.level) {
      toast.celebrate({
        kind: "level",
        title: PROGRESS_COPY.celebration.levelUp(badge.level),
        description: PROGRESS_COPY.celebration.levelUpDescription,
      });
      announce(PROGRESS_COPY.celebration.levelUp(badge.level));
      return;
    }

    if (badge.weeklyGoalsClaimed > before.weeklyGoalsClaimed) {
      toast.celebrate({ kind: "goal", title: PROGRESS_COPY.celebration.goal });
      announce(PROGRESS_COPY.celebration.goal);
      return;
    }

    const gained = badge.xpTotal - before.xpTotal;
    if (gained > 0) {
      toast.xp(gained);
      announce(`${gained} XP earned`);
    }
  }, [announce, badge]);

  return <>{children}</>;
}
