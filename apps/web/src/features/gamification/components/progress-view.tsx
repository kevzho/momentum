"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";
import {
  AwardIcon,
  CoinsIcon,
  ListChecksIcon,
  PlusIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";

import { formatLocalDate, localDateOf } from "@momentum/core/time";
import type { QuestMetric } from "@momentum/core/types";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { Badge } from "@momentum/ui/components/badge";
import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { Progress } from "@momentum/ui/components/progress";
import { ProfileFrame } from "@momentum/ui/components/profile-frame";
import { toast } from "@momentum/ui/components/toast";
import { cn } from "@momentum/ui/lib/utils";

import {
  claimQuest,
  claimWeeklyGoal,
  createWeeklyGoal,
  deleteWeeklyGoal,
  equipCosmetic,
  purchaseCosmetic,
} from "@/features/gamification/actions";
import { METRIC_LABELS, PROGRESS_COPY, progressLabel } from "@/features/gamification/copy";
import { QuestList } from "@/features/gamification/components/quest-list";
import {
  WeeklyGoalDialog,
  type WeeklyGoalDraft,
} from "@/features/gamification/components/weekly-goal-dialog";
import type { ProgressPageData } from "@/features/gamification/types";
import { failure, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";

/**
 * No optimistic overlay here on purpose: every mutation is a server decision
 * (whether a quest is finished, what it is worth), and an optimistic "+20 XP"
 * would be the client asserting an amount. Celebration lives in
 * `ProgressProvider`, mounted in the shell.
 */
export function ProgressView({ data }: { data: ProgressPageData }) {
  const announce = useAnnounce();
  const [pending, setPending] = React.useState<ReadonlySet<string>>(() => new Set());
  // Readable synchronously: two clicks in one frame both see the state from
  // before either, so the guard reads this instead.
  const inFlight = React.useRef<Set<string>>(new Set());
  const [goalOpen, setGoalOpen] = React.useState(false);

  // One write per row; a write to a different row proceeds. A returned
  // `{ ok: false }` and a rejected call take the same path. No Retry on a
  // validation refusal. `unstable_rethrow` first: `redirect()` and `notFound()`
  // are thrown control flow.
  const run = React.useCallback(
    function run<T>(id: string, operation: () => Promise<ActionResult<T>>, done?: string) {
      if (inFlight.current.has(id)) return;
      inFlight.current.add(id);
      setPending(new Set(inFlight.current));
      void (async () => {
        let result: ActionResult<T>;
        try {
          result = await operation();
        } catch (thrown) {
          unstable_rethrow(thrown);
          reportError(thrown, { source: "progress.run" });
          result = failure(
            "unavailable",
            "Momentum could not reach the server. Your change was not saved.",
          );
        }
        inFlight.current.delete(id);
        setPending(new Set(inFlight.current));
        if (!result.ok) {
          toast.error(result.error.message, {
            action:
              result.error.code === "validation"
                ? undefined
                : { label: "Retry", onClick: () => run(id, operation, done) },
          });
          return;
        }
        if (done !== undefined) announce(done);
      })();
    },
    [announce],
  );

  const usedMetrics = data.goals.map((goal) => goal.metric);

  return (
    <PageContainer>
      <PageHeader title={PROGRESS_COPY.title} description={PROGRESS_COPY.description} />

      <LevelPanel data={data} />

      {/* Explicit `minmax(0, 1fr)` tracks: an implicit `auto` track sizes to the
          widest row's min-content, which at 375px pushed controls past the viewport. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={PROGRESS_COPY.quests.dailyTitle}>
          {data.daily.length === 0 ? (
            <EmptyState
              compact
              icon={ListChecksIcon}
              title={PROGRESS_COPY.quests.emptyTitle}
              description={PROGRESS_COPY.quests.emptyDescription}
            />
          ) : (
            <QuestList
              quests={data.daily}
              pendingIds={pending}
              onClaim={(id) =>
                run(
                  id,
                  () => claimQuest({ id }),
                  PROGRESS_COPY.quests.claimedAnnouncement(
                    data.daily.find((quest) => quest.assignmentId === id)?.definition.title ?? "",
                  ),
                )
              }
            />
          )}
        </Section>

        <Section title={PROGRESS_COPY.quests.weeklyTitle}>
          {data.weekly.length === 0 ? (
            <EmptyState
              compact
              icon={TargetIcon}
              title={PROGRESS_COPY.quests.emptyTitle}
              description={PROGRESS_COPY.quests.emptyDescription}
            />
          ) : (
            <QuestList
              quests={data.weekly}
              pendingIds={pending}
              onClaim={(id) =>
                run(
                  id,
                  () => claimQuest({ id }),
                  PROGRESS_COPY.quests.claimedAnnouncement(
                    data.weekly.find((quest) => quest.assignmentId === id)?.definition.title ?? "",
                  ),
                )
              }
            />
          )}
        </Section>

        <Section
          title={PROGRESS_COPY.goals.title}
          action={
            <Button variant="ghost" size="sm" onClick={() => setGoalOpen(true)}>
              <PlusIcon aria-hidden="true" className="size-3.5" />
              {PROGRESS_COPY.goals.add}
            </Button>
          }
        >
          {data.goals.length === 0 ? (
            <EmptyState
              compact
              icon={TargetIcon}
              title={PROGRESS_COPY.goals.emptyTitle}
              description={PROGRESS_COPY.goals.emptyDescription}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.goals.map((goal) => (
                <li key={goal.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        goal.completedAt !== null && "text-muted-foreground",
                      )}
                    >
                      {goal.title ?? METRIC_LABELS[goal.metric]}
                    </span>
                    {goal.completedAt !== null ? (
                      <span className="shrink-0 text-xs text-success">
                        {PROGRESS_COPY.quests.claimed}
                      </span>
                    ) : goal.claimable ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => run(goal.id, () => claimWeeklyGoal({ id: goal.id }))}
                      >
                        {PROGRESS_COPY.quests.claim}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground"
                        onClick={() => run(goal.id, () => deleteWeeklyGoal({ id: goal.id }))}
                      >
                        {PROGRESS_COPY.goals.remove}
                      </Button>
                    )}
                  </div>
                  <Progress
                    value={goal.progress.fraction * 100}
                    aria-label={progressLabel(goal.metric, goal.progress.value, goal.target)}
                  />
                  <span data-slot="numeric" className="text-xs text-muted-foreground">
                    {progressLabel(goal.metric, goal.progress.value, goal.target)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={PROGRESS_COPY.achievements.title}>
          <ul className="flex flex-col gap-2">
            {data.achievements.map((row) => (
              <li key={row.definition.key} className="flex items-start gap-2">
                <AwardIcon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    row.unlockedAt === null ? "text-muted-foreground/50" : "text-primary",
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn("text-sm", row.unlockedAt === null && "text-muted-foreground")}
                  >
                    {row.definition.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.definition.description}
                  </span>
                </span>
                <span data-slot="numeric" className="shrink-0 text-xs text-muted-foreground">
                  {row.unlockedAt === null
                    ? PROGRESS_COPY.achievements.locked
                    : PROGRESS_COPY.achievements.unlockedOn(
                        formatLocalDate(localDateOf(row.unlockedAt, data.timezone), "medium"),
                      )}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title={PROGRESS_COPY.cosmetics.title}
          description={PROGRESS_COPY.cosmetics.description}
        >
          <ul className="flex flex-col gap-2">
            {data.cosmetics.map((row) => (
              <li key={row.definition.key} className="flex items-center gap-2">
                <ProfileFrame
                  frame={null}
                  className="size-6 shrink-0 items-center justify-center rounded-full bg-muted text-2xs"
                >
                  <SparklesIcon aria-hidden="true" className="size-3 text-muted-foreground" />
                </ProfileFrame>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{row.definition.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {row.definition.description}
                  </span>
                </span>

                {!row.definition.available && !row.owned ? (
                  <Badge variant="secondary" className="shrink-0">
                    {PROGRESS_COPY.cosmetics.notYet}
                  </Badge>
                ) : row.owned ? (
                  <Button
                    size="sm"
                    variant={row.equipped ? "secondary" : "ghost"}
                    className="shrink-0"
                    onClick={() =>
                      run(row.definition.id, () =>
                        equipCosmetic({ id: row.definition.id, equipped: !row.equipped }),
                      )
                    }
                  >
                    {row.equipped ? PROGRESS_COPY.cosmetics.unequip : PROGRESS_COPY.cosmetics.equip}
                  </Button>
                ) : row.affordable ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() =>
                      run(row.definition.id, () => purchaseCosmetic({ id: row.definition.id }))
                    }
                  >
                    {PROGRESS_COPY.cosmetics.buy} ·{" "}
                    {PROGRESS_COPY.cosmetics.price(row.definition.price)}
                  </Button>
                ) : (
                  /* Not a disabled button: disabling would drop focus and break the keyboard path. */
                  <span data-slot="numeric" className="shrink-0 text-xs text-muted-foreground">
                    {PROGRESS_COPY.cosmetics.cannotAfford(row.definition.price, data.badge.coins)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={PROGRESS_COPY.history.title}>
          {data.recent.length === 0 ? (
            <EmptyState
              compact
              icon={SparklesIcon}
              title={PROGRESS_COPY.history.emptyTitle}
              description={PROGRESS_COPY.history.emptyDescription}
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.recent.map((event) => (
                <li key={event.id} className="flex items-baseline gap-2 text-sm">
                  <span
                    data-slot="numeric"
                    className="w-14 shrink-0 text-xs font-medium text-primary"
                  >
                    +{event.amount} XP
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {event.reason}
                  </span>
                  <span data-slot="numeric" className="shrink-0 text-xs text-muted-foreground">
                    {formatLocalDate(localDateOf(event.createdAt, data.timezone), "monthDay")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <CapsPanel data={data} />

      <WeeklyGoalDialog
        open={goalOpen}
        onOpenChange={setGoalOpen}
        usedMetrics={usedMetrics as QuestMetric[]}
        onSubmit={(draft: WeeklyGoalDraft) => {
          setGoalOpen(false);
          const id = crypto.randomUUID();
          run(id, () => createWeeklyGoal({ id, ...draft }));
        }}
      />
    </PageContainer>
  );
}

function LevelPanel({ data }: { data: ProgressPageData }) {
  const { badge } = data;

  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{PROGRESS_COPY.level.label(badge.level)}</span>
          <span data-slot="numeric" className="text-xs text-muted-foreground">
            {PROGRESS_COPY.level.intoLevel(badge.xpIntoLevel, badge.xpForNextLevel)}
          </span>
        </div>
        <Progress
          value={badge.fraction * 100}
          aria-label={PROGRESS_COPY.level.toNext(badge.xpRemaining, badge.level)}
        />
        <span data-slot="numeric" className="text-xs text-muted-foreground">
          {PROGRESS_COPY.level.toNext(badge.xpRemaining, badge.level)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <CoinsIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <span data-slot="numeric" className="text-sm font-medium">
          {badge.coins}
        </span>
        <span className="text-xs text-muted-foreground">{PROGRESS_COPY.level.coins}</span>
      </div>
    </section>
  );
}

/** The ledger's own rolling 24-hour window, not the local day. */
function CapsPanel({ data }: { data: ProgressPageData }) {
  return (
    <section className="flex flex-col gap-1.5 border-t pt-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {PROGRESS_COPY.caps.title}
      </h2>
      <p className="max-w-prose text-xs text-muted-foreground">{PROGRESS_COPY.caps.description}</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {data.cappedToday.map((row) => (
          <li key={row.source} data-slot="numeric" className="text-xs text-muted-foreground">
            {PROGRESS_COPY.caps.line(
              PROGRESS_COPY.caps.sources[row.source] ?? row.source,
              row.awarded,
              row.cap,
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The section label is the product-wide one: uppercase, muted, no leading icon (see `TodaySection`). */
function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = React.useId();

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2
          id={headingId}
          className="flex-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </h2>
        {action}
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  );
}
