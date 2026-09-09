import { CheckIcon, TrophyIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";
import { Progress } from "@momentum/ui/components/progress";
import { cn } from "@momentum/ui/lib/utils";

import { progressLabel } from "@/features/gamification/copy";
import type { QuestRow } from "@/features/gamification/types";
import { TODAY_COPY } from "@/features/today/copy";
import { TodaySection } from "@/features/today/components/today-section";

/**
 * Today's quests: what each asks for, how far through it the day is, and — only
 * once it is actually met — a Claim control.
 *
 * Daily only. A week's quests are a week's question and /progress is where a
 * week is looked at; a Today page that listed them would be reporting rather
 * than executing.
 *
 * The bar is the progress the server computed from the same rows the database
 * will check a claim against, so the control is never offered for something
 * that would then be refused (Domain Rule 6). A quest that is not finished
 * shows no button rather than a disabled one with an explanation: there is
 * nothing to explain, the day is still going.
 */
export function TodayQuests({
  quests,
  claimingId,
  onClaim,
}: {
  quests: readonly QuestRow[];
  claimingId: string | null;
  onClaim: (assignmentId: string) => void;
}) {
  const done = quests.filter((quest) => quest.completedAt !== null).length;

  return (
    <TodaySection
      title={TODAY_COPY.quests.title}
      count={quests.length === 0 ? undefined : TODAY_COPY.quests.count(done, quests.length)}
    >
      {quests.length === 0 ? (
        <EmptyState
          icon={TrophyIcon}
          title={TODAY_COPY.quests.emptyTitle}
          description={TODAY_COPY.quests.emptyDescription}
          compact
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {quests.map((quest) => {
            const claimed = quest.completedAt !== null;
            const label = progressLabel(
              quest.definition.metric,
              quest.progress.value,
              quest.progress.target,
            );

            return (
              <li key={quest.assignmentId} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      claimed && "text-muted-foreground",
                    )}
                  >
                    {quest.definition.title}
                  </span>
                  {claimed ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                      <CheckIcon aria-hidden="true" className="size-3.5" />
                      {TODAY_COPY.quests.claimed}
                    </span>
                  ) : quest.claimable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      data-pending={claimingId === quest.assignmentId || undefined}
                      onClick={() => onClaim(quest.assignmentId)}
                    >
                      {TODAY_COPY.quests.claim}
                    </Button>
                  ) : (
                    <span data-slot="numeric" className="shrink-0 text-xs text-muted-foreground">
                      {quest.progress.value}/{quest.progress.target}
                    </span>
                  )}
                </div>
                <Progress value={quest.progress.fraction * 100} aria-label={label} />
              </li>
            );
          })}
        </ul>
      )}
    </TodaySection>
  );
}
