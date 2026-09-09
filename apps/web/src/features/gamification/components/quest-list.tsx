"use client";

import { CheckIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { Progress } from "@momentum/ui/components/progress";
import { cn } from "@momentum/ui/lib/utils";

import { PROGRESS_COPY, progressLabel } from "@/features/gamification/copy";
import type { QuestRow } from "@/features/gamification/types";

/**
 * A period's quests: what each asks for, how far through it you are, and — only
 * once it is actually met — a Claim control.
 *
 * The bar is the progress the server computed from the same rows it will check
 * a claim against, so the control cannot be offered for something the database
 * would then refuse. A quest that is not finished shows no button rather than a
 * disabled one with an explanation: there is nothing to explain, the day is
 * still going.
 */
export function QuestList({
  quests,
  onClaim,
  pendingIds,
}: {
  quests: readonly QuestRow[];
  onClaim: (assignmentId: string) => void;
  /** Assignments with a claim in flight. */
  pendingIds: ReadonlySet<string>;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {quests.map((quest) => {
        const done = quest.completedAt !== null;
        return (
          <li key={quest.assignmentId} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span
                className={cn("min-w-0 flex-1 truncate text-sm", done && "text-muted-foreground")}
              >
                {quest.definition.title}
              </span>
              <span data-slot="numeric" className="shrink-0 text-xs text-muted-foreground">
                {PROGRESS_COPY.quests.reward(
                  quest.definition.xpReward,
                  quest.definition.coinReward,
                )}
              </span>
              {done ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                  <CheckIcon aria-hidden="true" className="size-3.5" />
                  {PROGRESS_COPY.quests.claimed}
                </span>
              ) : quest.claimable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => onClaim(quest.assignmentId)}
                  data-pending={pendingIds.has(quest.assignmentId) || undefined}
                >
                  {PROGRESS_COPY.quests.claim}
                </Button>
              ) : null}
            </div>

            <Progress
              value={quest.progress.fraction * 100}
              aria-label={progressLabel(
                quest.definition.metric,
                quest.progress.value,
                quest.progress.target,
              )}
            />
            <span data-slot="numeric" className="text-xs text-muted-foreground">
              {progressLabel(quest.definition.metric, quest.progress.value, quest.progress.target)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
