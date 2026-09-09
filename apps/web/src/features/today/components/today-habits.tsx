import { RepeatIcon } from "lucide-react";

import { isAmountHabit } from "@momentum/core/habits";

import { Checkbox } from "@momentum/ui/components/checkbox";
import { EmptyState } from "@momentum/ui/components/empty-state";
import { cn } from "@momentum/ui/lib/utils";

import { DAY_STATE_LABELS, describeProgress, describeTarget } from "@/features/habits/copy";
import { TODAY_COPY } from "@/features/today/copy";
import { TodaySection } from "@/features/today/components/today-section";
import type { TodayHabit } from "@/features/today/types";

/**
 * The habits today asks something of, completable in one press.
 *
 * A compact row rather than the habits page's card: this answers "how am I
 * progressing today", and a week strip, a consistency percentage and a heatmap
 * answer a different question that /habits already answers well. What is here
 * is the name, what the habit asks for, and a control.
 *
 * The state carries a word as well as a checkbox — `DAY_STATE_LABELS`, the
 * habits feature's own vocabulary, in which there is no "missed" and a
 * scheduled day that has passed is **open** (Domain Rule 7). An amount habit's
 * press tops it up to its target — today's for a per-day habit, the week's for
 * a per-week one, which names no per-day target (`amountToRecord` in
 * `@momentum/core/habits`) — which is exactly what `record_habit_completion`
 * will do with the amount sent.
 */
export function TodayHabits({
  habits,
  pendingIds,
  onToggle,
}: {
  habits: readonly TodayHabit[];
  pendingIds: ReadonlySet<string>;
  onToggle: (row: TodayHabit, recorded: boolean) => void;
}) {
  const met = habits.filter((row) => row.day.state === "met").length;

  return (
    <TodaySection
      title={TODAY_COPY.habits.title}
      count={habits.length === 0 ? undefined : TODAY_COPY.habits.count(met, habits.length)}
    >
      {habits.length === 0 ? (
        <EmptyState
          icon={RepeatIcon}
          title={TODAY_COPY.habits.emptyTitle}
          description={TODAY_COPY.habits.emptyDescription}
          compact
        />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {habits.map((row) => {
            const done = row.day.state === "met";
            const amount = isAmountHabit(row.habit.frequencyType);

            return (
              <li
                key={row.habit.id}
                data-pending={pendingIds.has(row.habit.id) || undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast ease-standard",
                  "hover:bg-muted/60 has-focus-visible:bg-muted/60",
                  pendingIds.has(row.habit.id) && "opacity-60",
                )}
              >
                <Checkbox
                  checked={done}
                  aria-label={`${row.habit.name} — ${DAY_STATE_LABELS[row.day.state]}`}
                  onCheckedChange={(next) => onToggle(row, next === true)}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    done && "text-muted-foreground line-through",
                  )}
                >
                  {row.habit.name}
                </span>
                <span
                  data-slot="numeric"
                  className="shrink-0 text-xs text-muted-foreground"
                  title={describeTarget(row.habit)}
                >
                  {row.day.target === null
                    ? // A per-week habit names no per-day target, so the week is
                      // the only number it has: "1 of 3 days", "40m of 2h".
                      describeProgress(row.habit, row.progress.achieved, row.progress.target)
                    : amount
                      ? // A per-day amount habit is measured against *today's*
                        // target. Showing the week here would report a number
                        // the press in front of it does not move by that much.
                        describeProgress(row.habit, row.day.amount, row.day.target)
                      : DAY_STATE_LABELS[row.day.state]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </TodaySection>
  );
}
