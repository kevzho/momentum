"use client";

import * as React from "react";
import { cn } from "cn";
import { AwardIcon, SparklesIcon, TargetIcon } from "lucide-react";

import { useReducedMotion } from "@momentum/ui/hooks/use-reduced-motion";

/**
 * The three things worth celebrating, in one component.
 *
 * A level up, an achievement unlock, and a weekly goal completed — and nothing
 * else, ever (specs/08-gamification.md). It is brief, it is dismissible, and it
 * is one toast: the caller shows at most one per update, never a queue.
 *
 * **Reduced motion removes the flourish, not the news.** The ring behind the
 * icon is the only animated part, and under `prefers-reduced-motion` it is not
 * rendered at all rather than rendered with a zero duration. The message still
 * arrives, because suppressing an animation must not suppress information.
 */
type CelebrationKind = "level" | "achievement" | "goal";

const ICONS: Record<CelebrationKind, React.ComponentType<{ className?: string }>> = {
  level: SparklesIcon,
  achievement: AwardIcon,
  goal: TargetIcon,
};

const LABELS: Record<CelebrationKind, string> = {
  level: "Level up",
  achievement: "Achievement unlocked",
  goal: "Weekly goal complete",
};

function AchievementToast({
  kind,
  title,
  description,
  onDismiss,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  kind: CelebrationKind;
  title: string;
  description?: string;
  onDismiss?: () => void;
}) {
  const reduced = useReducedMotion();
  const Icon = ICONS[kind];

  return (
    <div
      data-slot="achievement-toast"
      data-kind={kind}
      className={cn(
        "cn-toast flex w-full items-start gap-3 rounded-(--radius) border bg-popover px-3 py-2 text-sm text-popover-foreground",
        className,
      )}
      {...props}
    >
      <span className="relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
        {reduced ? null : (
          <span
            data-slot="flourish"
            aria-hidden="true"
            className="absolute inset-0 animate-ping rounded-full bg-primary/20 duration-slow"
          />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {LABELS[kind]}
        </span>
        <span className="font-medium">{title}</span>
        {description ? <span className="text-muted-foreground">{description}</span> : null}
      </span>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export { AchievementToast };
export type { CelebrationKind };
