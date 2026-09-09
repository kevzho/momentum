"use client";

import * as React from "react";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { toast } from "@momentum/ui/components/toast";

import { PROGRESS_COPY } from "@/features/gamification/copy";
import type { ProgressBadge } from "@/features/gamification/types";

/**
 * Celebration, and the restraint around it.
 *
 * The shell re-renders with a fresh `ProgressBadge` after every mutation, so
 * this component can see what changed by comparing the new props with the last
 * ones it saw. That is the whole mechanism — no event stream, no client cache,
 * and nothing the client asserts: the numbers it compares were both computed by
 * the server from the ledger (Domain Rule 6).
 *
 * **What is celebrated, and what is not.** A level up, an achievement unlock
 * and a weekly goal reached get the loud toast. Everything else that earns XP
 * gets a small "+N XP" and the bar in the top bar moving, which is the "subtle
 * XP animation and progress movement" specs/08-gamification.md asks for. There
 * is no confetti anywhere in this product.
 *
 * **At most one per update.** An achievement wins over a level, and a level over
 * a goal, and a celebration suppresses the XP toast that would otherwise have
 * accompanied it — "occasional achievement toast, never a queue of them". Two
 * achievements unlocked at once show one toast; the second is on the progress
 * page, which is where a list of them belongs.
 *
 * **Reduced motion** is handled inside `AchievementToast`, which renders no
 * flourish at all when the viewer has asked for less motion. The message still
 * arrives: suppressing an animation must never suppress information.
 *
 * The first render establishes the baseline and celebrates nothing, so a page
 * reload is not a party.
 *
 * **This is where an XP or celebration toast is announced, and the only
 * place.** `toast.xp` and `toast.celebrate` speak nothing themselves and
 * sonner's own live region is switched off in the toast primitive, so the
 * `Announcer` hears each of these exactly once — the message toasts
 * (`toast.error` and friends) announce through the same region from inside the
 * primitive, and this component never calls those.
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

    // First render: learn where we are, say nothing.
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
