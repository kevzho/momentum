"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext } from "@dnd-kit/core";
import { ChevronLeftIcon, ChevronRightIcon, PanelRightIcon } from "lucide-react";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import { describeRecurrence } from "@momentum/core/recurrence";
import {
  durationMinutes,
  formatDuration,
  localDateOf,
  minutesFromMidnight,
} from "@momentum/core/time";
import type { GridSpec } from "@momentum/core/calendar";
import type { EventBlock, IanaTimeZone, Instant, LocalDate, Uuid } from "@momentum/core/types";
import { useAnnounce } from "@momentum/ui/components/announcer";
import { Button } from "@momentum/ui/components/button";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { SegmentedControl } from "@momentum/ui/components/segmented-control";
import { toast } from "@momentum/ui/components/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@momentum/ui/components/tooltip";

import {
  createBlock,
  deleteBlock,
  deleteOccurrence,
  rescheduleBlock,
  rescheduleOccurrence,
  scheduleTask,
  setBlockCompletion,
  updateBlock,
} from "@/features/calendar/actions";
import { addHabitToWeek } from "@/features/habits/actions";
import { BlockEditor } from "@/features/calendar/components/block-editor";
import { BlockView } from "@/features/calendar/components/block-view";
import {
  CalendarDragLayer,
  CalendarInteractionProvider,
} from "@/features/calendar/components/interaction";
import { WeekGrid } from "@/features/calendar/components/week-grid";
import {
  calendarHref,
  rangeLabel,
  shiftAnchor,
  type CalendarParams,
  type CalendarView as CalendarRange,
} from "@/features/calendar/navigation";
import {
  addedMessage,
  addedSeriesMessage,
  completionMessage,
  habitCompletionMessage,
  deletedMessage,
  occurrenceRemovedMessage,
  restoredMessage,
  savedMessage,
  seriesDeletedMessage,
  seriesSavedMessage,
} from "@/features/calendar/announcements";
import {
  applyPatch,
  optimisticEvent,
  optimisticWorkBlock,
  type CalendarPatch,
} from "@/features/calendar/optimistic";
import {
  buildAllDay,
  buildDays,
  buildSegments,
  initialScrollMinutes,
  resolveGridSpec,
  spanOf,
} from "@/features/calendar/projection";
import type {
  BlockDraft,
  BlockEditorValues,
  CalendarCallbacks,
  CalendarItem,
  CalendarSettings,
  CalendarWeekData,
  DaySpan,
  PlanTask,
} from "@/features/calendar/types";
import { useCalendarDnd } from "@/features/calendar/use-calendar-dnd";
import { OnboardingChecklist } from "@/features/onboarding/components/onboarding-checklist";
import { SCHEDULE_STEP } from "@/features/onboarding/copy";
import type { OnboardingState } from "@/features/onboarding/types";
import { PlanningDrawer } from "@/features/planning/components/planning-drawer";
import { useWideViewport } from "@/features/planning/use-wide-viewport";
import type { ActionResult } from "@/lib/actions/result";
import { useOptimisticAction } from "@/lib/actions/use-optimistic-action";
import { useMidnightRollover } from "@/lib/time/use-midnight-rollover";
import { useNow } from "@/lib/time/use-now";
import { useUserSettings } from "@/lib/time/user-settings";

/**
 * The calendar board: the one client island for the surface. It owns
 * composition, the optimistic overlay over the week's items, and the routing
 * of intent to server actions; date maths, geometry and drag resolution live elsewhere.
 */

/** One mutation: what to show immediately, what to persist, and what to say when it lands. */
interface CalendarMutation {
  patch: CalendarPatch;
  /** The ids this write touches, so only their controls read as pending. */
  itemId: string | null;
  taskId: Uuid | null;
  run: () => Promise<ActionResult<unknown>>;
  /** Announced only once the server has agreed; a failed write rolls back and the user must not have been told otherwise. */
  announcement?: string;
  /** Runs on success only, for the same reason. */
  onDone?: () => void;
}

export function CalendarView({
  data,
  params,
  newEvent = false,
  onboarding = null,
}: {
  data: CalendarWeekData;
  params: CalendarParams;
  /** The palette's "Add event" intent, honoured once. */
  newEvent?: boolean;
  /** The first-run checklist, until the account finishes or skips it. */
  onboarding?: OnboardingState | null;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const profile = useUserSettings();
  const { timezone, weekStart, snapMinutes } = profile;

  // "Today" comes from the server per request; this keeps it coming as the day rolls over.
  useMidnightRollover(timezone);
  const now = useNow();

  // Two states for the Plan panel: the wide panel rests open, the narrow
  // sheet rests closed, and a phone must not hydrate under a modal.
  const wide = useWideViewport();
  const [planOpen, setPlanOpen] = React.useState(true);
  const [planSheetOpen, setPlanSheetOpen] = React.useState(false);
  const planVisible = wide ? planOpen : planSheetOpen;
  const setPlanVisible = wide ? setPlanOpen : setPlanSheetOpen;
  // The panel's own close button disappears with it, so focus returns here.
  const planToggle = React.useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = React.useState<BlockDraft | null>(null);
  const [touched, setTouched] = React.useState<TouchedIds>(EMPTY_TOUCHED);
  // "Add to week" is not optimistic (see `addHabitToWeekAt`), so its in-flight state is separate.
  const [pendingHabits, setPendingHabits] = React.useState<ReadonlySet<Uuid>>(new Set());
  const [, startHabitTransition] = React.useTransition();

  const {
    state: items,
    run,
    pending,
  } = useOptimisticAction<readonly CalendarItem[], CalendarMutation, unknown>({
    serverState: data.items,
    action: (mutation) => mutation.run(),
    optimistic: (state, mutation) => applyPatch(state, mutation.patch, timezone),
    onSuccess: (_data, mutation) => {
      setTouched((current) => mark(current, mutation, false));
      if (mutation.announcement) announce(mutation.announcement);
      mutation.onDone?.();
    },
    onError: (_error, mutation) => setTouched((current) => mark(current, mutation, false)),
  });

  // Marks the touched ids as pending; both settle callbacks unmark them.
  const mutate = React.useCallback(
    (mutation: CalendarMutation) => {
      setTouched((current) => mark(current, mutation, true));
      run(mutation);
    },
    [run],
  );

  const spec = React.useMemo(
    () => resolveGridSpec(items, data.days, timezone, DEFAULT_GRID_SPEC, snapMinutes),
    [items, data.days, timezone, snapMinutes],
  );

  const settings = React.useMemo<CalendarSettings>(
    () => ({ timezone, weekStart, snapMinutes, spec }),
    [timezone, weekStart, snapMinutes, spec],
  );

  const days = React.useMemo(() => buildDays(data.days, data.today), [data.days, data.today]);
  const segmentsByDate = React.useMemo(
    () => buildSegments(items, data.days, timezone, spec),
    [items, data.days, timezone, spec],
  );
  const allDayByDate = React.useMemo(
    () => buildAllDay(items, data.days, timezone),
    [items, data.days, timezone],
  );
  // The opening scroll offset, from the server's items and applied only on
  // mount (the grid is keyed on the range), so creating an early block cannot
  // yank the view.
  const rangeKey = `${data.rangeStart}:${params.view}`;
  const scrollToMinutes = React.useMemo(
    () => initialScrollMinutes(data.items, data.days, timezone, spec),
    [data.items, data.days, timezone, spec],
  );

  const openItem = React.useCallback(
    (item: CalendarItem) => setDraft({ mode: "edit", item, span: spanOf(item, timezone) }),
    [timezone],
  );

  // The series behind an occurrence, opened from that occurrence's editor.
  const openSeries = React.useCallback(
    (series: EventBlock) => setDraft({ mode: "series", series, span: spanOf(series, timezone) }),
    [timezone],
  );

  const reschedule = React.useCallback(
    (item: CalendarItem, span: DaySpan, announcement?: string) => {
      const patch: CalendarPatch = { kind: "reschedule", id: item.id, span };
      const occurrence = item.occurrence;
      const blockId = item.blockId;

      // Every occurrence moves through the override path, whether or not it
      // already has one; branching on `blockId === null` would rewrite an
      // existing override as an ordinary event.
      mutate(
        occurrence !== null
          ? {
              patch,
              itemId: item.id,
              taskId: null,
              announcement,
              run: () =>
                rescheduleOccurrence({
                  seriesId: occurrence.seriesId,
                  occurrenceDate: occurrence.occurrenceDate,
                  ...span,
                }),
            }
          : {
              patch,
              itemId: item.id,
              taskId: null,
              announcement,
              run: () => rescheduleBlock({ id: blockId, ...span }),
            },
      );
    },
    [mutate],
  );

  const restore = React.useCallback(
    (item: CalendarItem) => {
      const span = spanOf(item, timezone);
      const work = item.work;
      if (item.kind === "work" && work !== null) {
        mutate({
          patch: { kind: "create", item },
          itemId: item.id,
          taskId: work.taskId,
          announcement: restoredMessage(item.title),
          run: () => scheduleTask({ id: item.id, taskId: work.taskId, ...span }),
        });
        return;
      }
      mutate({
        patch: { kind: "create", item },
        itemId: item.id,
        taskId: null,
        announcement: restoredMessage(item.title),
        run: () =>
          createBlock({
            id: item.id,
            kind: "event",
            title: item.title,
            description: item.description,
            color: item.ownColor,
            ...span,
          }),
      });
    },
    [mutate, timezone],
  );

  const remove = React.useCallback(
    (item: CalendarItem) => {
      setDraft(null);
      const occurrence = item.occurrence;
      const blockId = item.blockId;

      if (occurrence !== null) {
        // A cancelled override, not a deleted row — also for an already
        // overridden occurrence, whose row deletion would resurrect it.
        mutate({
          patch: { kind: "delete", id: item.id },
          itemId: item.id,
          taskId: null,
          announcement: occurrenceRemovedMessage(item.title),
          run: () =>
            deleteOccurrence({
              seriesId: occurrence.seriesId,
              occurrenceDate: occurrence.occurrenceDate,
            }),
        });
        return;
      }

      mutate({
        patch: { kind: "delete", id: item.id },
        itemId: item.id,
        taskId: null,
        announcement: deletedMessage(item.title),
        run: () => deleteBlock({ id: blockId }),
        // Undo, offered once the row is really gone; the block returns with its original id.
        onDone: restorable(item)
          ? () =>
              toast.info("Block deleted", {
                action: { label: "Undo", onClick: () => restore(item) },
              })
          : undefined,
      });
    },
    [mutate, restore],
  );

  const toggleComplete = React.useCallback(
    (item: CalendarItem) => {
      const completed = item.completedAt === null;
      const blockId = item.blockId;
      // Completing the task is offered only on the block that finishes it;
      // reopening it on any block of a completed task.
      const alsoTask = completed
        ? (item.work?.completesTask ?? false)
        : item.work?.taskCompletedAt != null;

      mutate({
        patch: { kind: "completion", id: item.id, completed, alsoTask },
        itemId: item.id,
        taskId: item.work?.taskId ?? null,
        announcement:
          item.kind === "habit"
            ? habitCompletionMessage(item.title, completed)
            : completionMessage(item.work?.taskTitle ?? item.title, completed, alsoTask),
        run: () =>
          setBlockCompletion({
            id: blockId,
            completed,
            alsoCompleteTask: completed && alsoTask,
            alsoUncompleteTask: !completed && alsoTask,
            // Routes a habit block to the function that also records the habit's day.
            habitId: item.habitId,
          }),
      });
    },
    [mutate],
  );

  const createAt = React.useCallback((span: DaySpan) => {
    setDraft({ mode: "create", span });
  }, []);

  // "Add event" from the command palette. The intent is dropped from the URL
  // with `replace`, so reload/back do not reopen a dismissed editor.
  const handledNewEvent = React.useRef(false);
  React.useEffect(() => {
    if (!newEvent || handledNewEvent.current) return;
    handledNewEvent.current = true;

    setDraft({
      mode: "create",
      span: defaultCreateSpan(data.days, data.today, now, timezone, spec),
    });
    router.replace(calendarHref(params.anchor, params.view, data.today));
  }, [data.days, data.today, newEvent, now, params.anchor, params.view, router, spec, timezone]);

  const scheduleTaskAt = React.useCallback(
    (taskId: Uuid, span: DaySpan) => {
      const task = findPlanTask(data.plan, taskId);
      if (!task) return;

      const id = crypto.randomUUID();
      mutate({
        patch: {
          kind: "create",
          item: optimisticWorkBlock({ id, task, span, timezone }),
        },
        itemId: id,
        taskId,
        run: () => scheduleTask({ id, taskId, ...span }),
      });
    },
    [data.plan, mutate, timezone],
  );

  // Not optimistic: the server decides which blocks the week is missing, so
  // there is no row to draw ahead of the answer. The row reads as pending
  // until `refresh()` brings the blocks back.
  const addHabitToWeekAt = React.useCallback(
    (habitId: Uuid) => {
      const weekStartDate = data.days[0];
      if (weekStartDate === undefined) return;

      setPendingHabits((current) => new Set(current).add(habitId));
      startHabitTransition(async () => {
        try {
          const result = await addHabitToWeek({ habitId, weekStartDate });
          if (!result.ok) toast.error(result.error.message);
        } catch {
          toast.error("Momentum could not reach the server. Your change was not saved.");
        } finally {
          setPendingHabits((current) => {
            const next = new Set(current);
            next.delete(habitId);
            return next;
          });
        }
      });
    },
    [data.days],
  );

  const submitDraft = React.useCallback(
    (current: BlockDraft, values: BlockEditorValues) => {
      const span: DaySpan = {
        date: values.date,
        startMinutes: values.startMinutes,
        endMinutes: values.endMinutes,
      };

      if (current.mode === "create") {
        const id = crypto.randomUUID();
        setDraft(null);
        mutate({
          patch: {
            kind: "create",
            item: optimisticEvent({
              id,
              title: values.title,
              description: values.description,
              color: values.color,
              span,
              timezone,
            }),
          },
          itemId: id,
          taskId: null,
          run: () =>
            createBlock({
              id,
              kind: "event",
              title: values.title,
              description: values.description,
              color: values.color,
              ...span,
              recurrence: values.recurrence,
            }),
          announcement:
            values.recurrence === null
              ? addedMessage(values.title)
              : addedSeriesMessage(values.title, describeRecurrence(values.recurrence, span.date)),
        });
        return;
      }

      // Every occurrence at once. Not optimistic: the new expansion is the
      // server's to compute and arrives with the refresh. Content and rule are
      // one write; a moved first occurrence is a second.
      if (current.mode === "series") {
        const series = current.series;
        setDraft(null);
        const moved = !sameSpan(current.span, span);
        mutate({
          patch: { kind: "none" },
          itemId: series.id,
          taskId: null,
          announcement: seriesSavedMessage(values.title),
          run: async () => {
            const content = await updateBlock({
              id: series.id,
              title: values.title,
              description: values.description,
              color: values.color,
              recurrence: values.recurrence,
            });
            if (!content.ok || !moved) return content;
            return rescheduleBlock({ id: series.id, ...span });
          },
        });
        return;
      }

      const item = current.item;
      const blockId = item.blockId;
      setDraft(null);
      const moved = !sameSpan(spanOf(item, timezone), span);

      // An occurrence has times of its own and nothing else; `blockId` is null
      // until overridden, so `updateBlock` is never the right path for one.
      if (item.occurrence !== null) {
        if (moved) reschedule(item, span, savedMessage(values.title));
        return;
      }

      // Content and times are two writes, so an edit to a title cannot rewrite a schedule.
      mutate({
        patch: {
          kind: "content",
          id: item.id,
          title: values.title,
          description: values.description,
          color: values.color,
        },
        itemId: item.id,
        taskId: null,
        announcement: savedMessage(values.title),
        run: () =>
          updateBlock({
            id: blockId,
            // Only an event owns its title. For a work or habit block
            // `values.title` is the parent's name; sending it would freeze a
            // copy into the column and stop the block tracking renames.
            ...(item.kind === "event"
              ? { title: values.title, recurrence: values.recurrence }
              : {}),
            description: values.description,
            color: values.color,
          }),
      });

      if (moved) reschedule(item, span);
    },
    [mutate, reschedule, timezone],
  );

  // The row and, by cascade, every override; no undo, since the occurrences were never rows.
  const deleteSeries = React.useCallback(
    (series: EventBlock) => {
      setDraft(null);
      mutate({
        patch: { kind: "delete-series", seriesId: series.id },
        itemId: series.id,
        taskId: null,
        announcement: seriesDeletedMessage(series.title),
        run: () => deleteBlock({ id: series.id }),
      });
    },
    [mutate],
  );

  const callbacks = React.useMemo<CalendarCallbacks>(
    () => ({
      onCreateAt: createAt,
      onOpenItem: openItem,
      onToggleComplete: toggleComplete,
      onDelete: remove,
      onReschedule: reschedule,
      onScheduleTask: scheduleTaskAt,
    }),
    [createAt, openItem, toggleComplete, remove, reschedule, scheduleTaskAt],
  );

  const dnd = useCalendarDnd({ settings, callbacks, items });

  const previous = calendarHref(shiftAnchor(params, weekStart, -1), params.view, data.today);
  const next = calendarHref(shiftAnchor(params, weekStart, 1), params.view, data.today);
  const label = rangeLabel(data.days, params.view);

  return (
    <PageContainer fill>
      <PageHeader
        title="Calendar"
        description={label}
        actions={
          <>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" asChild>
                <Link href={previous} scroll={false}>
                  <ChevronLeftIcon aria-hidden="true" />
                  <span className="sr-only">
                    {params.view === "day" ? "Previous day" : "Previous week"}
                  </span>
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={calendarHref(data.today, params.view, data.today)} scroll={false}>
                  Today
                </Link>
              </Button>
              <Button variant="ghost" size="icon-sm" asChild>
                <Link href={next} scroll={false}>
                  <ChevronRightIcon aria-hidden="true" />
                  <span className="sr-only">
                    {params.view === "day" ? "Next day" : "Next week"}
                  </span>
                </Link>
              </Button>
            </div>
            <SegmentedControl<CalendarRange>
              label="Calendar range"
              value={params.view}
              onValueChange={(view) =>
                router.push(calendarHref(params.anchor, view, data.today), { scroll: false })
              }
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
              ]}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={planToggle}
                  variant="ghost"
                  size="icon-sm"
                  // A pressed toggle for the panel; a dialog opener for the sheet.
                  aria-pressed={wide ? planOpen : undefined}
                  aria-haspopup={wide ? undefined : "dialog"}
                  aria-expanded={wide ? undefined : planSheetOpen}
                  onClick={() => setPlanVisible(!planVisible)}
                >
                  <PanelRightIcon aria-hidden="true" />
                  <span className="sr-only">
                    {planVisible ? "Hide plan panel" : "Show plan panel"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{planVisible ? "Hide plan panel" : "Show plan panel"}</TooltipContent>
            </Tooltip>
          </>
        }
      />

      <DndContext
        // An explicit id: dnd-kit derives its own from a module-level counter,
        // which drifts between server and client and causes a hydration mismatch.
        id="calendar"
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionDetection}
        accessibility={dnd.accessibility}
        onDragStart={dnd.onDragStart}
        onDragMove={dnd.onDragMove}
        onDragEnd={dnd.onDragEnd}
        onDragCancel={dnd.onDragCancel}
      >
        <CalendarInteractionProvider controller={dnd}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4 md:pb-5 lg:flex-row">
            {/* Below `lg` the panel is a closed sheet, so the checklist sits above the
                grid instead; its last step opens the sheet, where the rows with Find time are. */}
            {onboarding === null || wide ? null : (
              <OnboardingChecklist
                state={onboarding}
                workingHours={data.plan.workingHours}
                weekStart={weekStart}
                liveHasWorkBlock={items.some((item) => item.kind === "work")}
                schedule={{
                  label: SCHEDULE_STEP.openPlan,
                  onActivate: () => setPlanSheetOpen(true),
                }}
              />
            )}
            <WeekGrid
              key={rangeKey}
              days={days}
              settings={settings}
              segmentsByDate={segmentsByDate}
              allDayByDate={allDayByDate}
              scrollToMinutes={scrollToMinutes}
              now={now}
              candidate={dnd.candidate}
              callbacks={callbacks}
              pendingItemIds={touched.items}
            />
            <PlanningDrawer
              open={planVisible}
              onOpenChange={setPlanVisible}
              presentation={wide ? "panel" : "sheet"}
              returnFocusTo={planToggle}
              plan={data.plan}
              items={items}
              settings={settings}
              days={data.days}
              today={data.today}
              now={now}
              onScheduleTask={scheduleTaskAt}
              onAddHabitToWeek={addHabitToWeekAt}
              pendingTaskIds={touched.tasks}
              pendingHabitIds={pendingHabits}
              onboarding={wide ? onboarding : null}
            />
          </div>

          <CalendarDragLayer>
            {dnd.activeDrag === null ? null : (
              <DragGhost drag={dnd.activeDrag} settings={settings} />
            )}
          </CalendarDragLayer>
        </CalendarInteractionProvider>
      </DndContext>

      <BlockEditor
        draft={draft}
        settings={settings}
        onClose={() => setDraft(null)}
        onSubmit={submitDraft}
        onDelete={remove}
        onToggleComplete={toggleComplete}
        series={data.series}
        onEditSeries={openSeries}
        onDeleteSeries={deleteSeries}
        pending={pending}
      />
    </PageContainer>
  );
}

/** What follows the pointer: the block itself, or a chip for a task being scheduled. */
export function DragGhost({
  drag,
  settings,
}: {
  drag: NonNullable<ReturnType<typeof useCalendarDnd>["activeDrag"]>;
  settings: CalendarSettings;
}) {
  if (drag.item !== null) {
    const item = drag.item;
    const startMinutes = minutesFromMidnight(item.startAt, settings.timezone);
    return (
      <div className="w-40 opacity-90">
        <BlockView
          ghost
          settings={settings}
          callbacks={GHOST_CALLBACKS}
          segment={{
            key: `${item.id}:ghost`,
            item,
            date: localDateOf(item.startAt, settings.timezone),
            startMinutes,
            endMinutes: startMinutes + durationMinutes(item.startAt, item.endAt),
            isStart: true,
            isEnd: true,
            column: 0,
            columns: 1,
          }}
        />
      </div>
    );
  }

  if (drag.data.type !== "task") return null;
  return (
    <div className="w-40 rounded-md border bg-background px-2 py-1 text-2xs shadow-popover">
      <span className="block truncate font-medium">{drag.data.title}</span>
      <span data-slot="numeric" className="text-muted-foreground">
        {formatDuration(drag.data.durationMinutes)}
      </span>
    </div>
  );
}

/** The ghost is a picture of a block, not a block: nothing it reports can be acted on. */
const GHOST_CALLBACKS: CalendarCallbacks = {
  onCreateAt: () => {},
  onOpenItem: () => {},
  onToggleComplete: () => {},
  onDelete: () => {},
  onReschedule: () => {},
  onScheduleTask: () => {},
};

interface TouchedIds {
  items: ReadonlySet<string>;
  tasks: ReadonlySet<Uuid>;
}

const EMPTY_TOUCHED: TouchedIds = { items: new Set(), tasks: new Set() };

/** Adds or removes a mutation's ids from the in-flight marks. */
function mark(current: TouchedIds, mutation: CalendarMutation, active: boolean): TouchedIds {
  return {
    items: toggle(current.items, mutation.itemId, active),
    tasks: toggle(current.tasks, mutation.taskId, active),
  };
}

function toggle<T>(set: ReadonlySet<T>, value: T | null, active: boolean): ReadonlySet<T> {
  if (value === null || set.has(value) === active) return set;
  const next = new Set(set);
  if (active) next.add(value);
  else next.delete(value);
  return next;
}

/**
 * Whether Undo can really put this block back. A habit block has no create
 * path (`createBlock` only makes events, and re-creating it as one would
 * sever the habit link); an occurrence is cancelled, not deleted.
 */
function restorable(item: CalendarItem): boolean {
  return item.occurrence === null && (item.kind === "event" || item.kind === "work");
}

function sameSpan(a: DaySpan, b: DaySpan): boolean {
  return a.date === b.date && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes;
}

/** A task appears in exactly one section (`PlanningData`), so the first match is the only one. */
function findPlanTask(plan: CalendarWeekData["plan"], taskId: Uuid): PlanTask | null {
  return (
    plan.overdue.find((task) => task.id === taskId) ??
    plan.dueInRange.find((task) => task.id === taskId) ??
    plan.unscheduled.find((task) => task.id === taskId) ??
    null
  );
}

const NEW_EVENT_MINUTES = 60;
/** Where a draft opens on a day that is not today, or before the clock is known. */
const NEW_EVENT_FALLBACK_START = 9 * 60;

/**
 * Where "Add event" puts its draft: the next whole hour today, or 09:00 on the
 * first day of a range that has not started, clamped inside the grid.
 */
function defaultCreateSpan(
  days: readonly LocalDate[],
  today: LocalDate,
  now: Instant | null,
  timezone: IanaTimeZone,
  spec: GridSpec,
): DaySpan {
  const date = days.find((day) => day >= today) ?? days[days.length - 1] ?? today;
  const clockMinutes =
    date === today && now !== null ? minutesFromMidnight(now, timezone) : NEW_EVENT_FALLBACK_START;

  const nextHour = Math.ceil(clockMinutes / 60) * 60;
  const latest = Math.max(spec.dayStartMinutes, spec.dayEndMinutes - NEW_EVENT_MINUTES);
  const startMinutes = Math.min(Math.max(nextHour, spec.dayStartMinutes), latest);

  return { date, startMinutes, endMinutes: startMinutes + NEW_EVENT_MINUTES };
}
