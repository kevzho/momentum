"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext } from "@dnd-kit/core";
import { ChevronLeftIcon, ChevronRightIcon, PanelRightIcon } from "lucide-react";

import { DEFAULT_GRID_SPEC } from "@momentum/core/calendar";
import {
  durationMinutes,
  formatDuration,
  localDateOf,
  minutesFromMidnight,
} from "@momentum/core/time";
import type { GridSpec } from "@momentum/core/calendar";
import type { IanaTimeZone, Instant, LocalDate, Uuid } from "@momentum/core/types";
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
  completionMessage,
  habitCompletionMessage,
  deletedMessage,
  occurrenceRemovedMessage,
  restoredMessage,
  savedMessage,
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
import { PlanningDrawer } from "@/features/planning/components/planning-drawer";
import { useWideViewport } from "@/features/planning/use-wide-viewport";
import type { ActionResult } from "@/lib/actions/result";
import { useOptimisticAction } from "@/lib/actions/use-optimistic-action";
import { useMidnightRollover } from "@/lib/time/use-midnight-rollover";
import { useNow } from "@/lib/time/use-now";
import { useUserSettings } from "@/lib/time/user-settings";

/**
 * The calendar board: the one client island for the whole surface
 * (docs/ARCHITECTURE.md §5).
 *
 * It owns three things and delegates everything else. **Composition** — the
 * `DndContext`, the grid, the Plan panel and the editor, wired to each other.
 * **The optimistic overlay** — one `useOptimistic` over the week's items, so
 * every mutation shows immediately and every failure rolls back through the
 * same path (Domain Rule 11). **The routing of intent to actions** — the grid
 * and the panel report what the user did; this decides which server action that
 * is.
 *
 * What it deliberately does not own: date maths (`@momentum/core/time` through
 * `projection.ts`), geometry (`@momentum/core/calendar`), how a drag resolves
 * (`use-calendar-dnd.ts`), or what anything looks like.
 */

/** One mutation: what to show immediately, what to persist, and what to say when it lands. */
interface CalendarMutation {
  patch: CalendarPatch;
  /** The ids this write touches, so only their controls read as pending. */
  itemId: string | null;
  taskId: Uuid | null;
  run: () => Promise<ActionResult<unknown>>;
  /**
   * Announced only once the server has agreed. Announcing on the gesture reads
   * well and lies: a failed write rolls the block back, and a screen-reader
   * user who has already been told it was deleted has no way to learn it was
   * not (Domain Rule 11 — a failure has to be as visible as the success).
   */
  announcement?: string;
  /** Runs on success only, for the same reason. */
  onDone?: () => void;
}

export function CalendarView({
  data,
  params,
  newEvent = false,
}: {
  data: CalendarWeekData;
  params: CalendarParams;
  /** The palette's "Add event" intent, honoured once (features/calendar/navigation.ts). */
  newEvent?: boolean;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const profile = useUserSettings();
  const { timezone, weekStart, snapMinutes } = profile;

  // "Today" comes from the server, per request; this is what makes it keep
  // coming as the day rolls over on a tab left open (docs/ARCHITECTURE.md §10).
  useMidnightRollover(timezone);
  const now = useNow();

  /*
   * The Plan panel: beside the calendar from `lg` up, open by default; a sheet
   * over it below, closed until asked for. Two states rather than one, because
   * the two presentations have opposite resting states and a phone that
   * hydrates with the panel "open" would wake up under a modal.
   */
  const wide = useWideViewport();
  const [planOpen, setPlanOpen] = React.useState(true);
  const [planSheetOpen, setPlanSheetOpen] = React.useState(false);
  const planVisible = wide ? planOpen : planSheetOpen;
  const setPlanVisible = wide ? setPlanOpen : setPlanSheetOpen;
  // The Plan panel's own header button hides it, which removes the pressed
  // control from the page. This toggle is the one thing that survives the
  // close and brings the panel back, so it is where focus goes — otherwise the
  // browser leaves it on `<body>` and a keyboard user tabs from the top of the
  // shell again (Domain Rule 10).
  const planToggle = React.useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = React.useState<BlockDraft | null>(null);
  const [touched, setTouched] = React.useState<TouchedIds>(EMPTY_TOUCHED);
  // "Add to week" is a server-side plan, not an optimistic row (see
  // `addHabitToWeekAt`), so its in-flight state is tracked on its own.
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

  /*
   * A mutation marks the ids it touches so their controls read as pending, and
   * unmarks them when it settles — either way, because a failed write is just
   * as finished as a successful one. The hook hands the input back to both
   * callbacks, which is what makes "which ids" answerable without a second
   * bookkeeping structure.
   */
  const mutate = React.useCallback(
    (mutation: CalendarMutation) => {
      setTouched((current) => mark(current, mutation, true));
      run(mutation);
    },
    [run],
  );

  /* ---------------------------------------------------------------------- */
  /* Projection                                                             */
  /* ---------------------------------------------------------------------- */

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
  /*
   * The opening scroll offset. Computed from the server's items rather than the
   * optimistic ones, and applied by the grid only on mount — the grid is keyed
   * on the displayed range below, so "on mount" means "once per week", and
   * creating a 06:00 block cannot yank the view back to the morning.
   */
  const rangeKey = `${data.rangeStart}:${params.view}`;
  const scrollToMinutes = React.useMemo(
    () => initialScrollMinutes(data.items, data.days, timezone, spec),
    [data.items, data.days, timezone, spec],
  );

  /* ---------------------------------------------------------------------- */
  /* Intent → action                                                        */
  /* ---------------------------------------------------------------------- */

  const openItem = React.useCallback(
    (item: CalendarItem) => setDraft({ mode: "edit", item, span: spanOf(item, timezone) }),
    [timezone],
  );

  const reschedule = React.useCallback(
    (item: CalendarItem, span: DaySpan, announcement?: string) => {
      const patch: CalendarPatch = { kind: "reschedule", id: item.id, span };
      const occurrence = item.occurrence;
      const blockId = item.blockId;

      // Every occurrence of a series moves by writing an override, whether or
      // not it already has one — `writeOverride` upserts on
      // `(series_id, occurrence_date)`. Branching on `blockId === null` instead
      // would send an *already edited* occurrence down the plain-block path and
      // rewrite the override row as if it were an ordinary event, losing the
      // link to the series it replaces (§11).
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
        // A cancelled override, not a deleted row: the series still owns the
        // slot, and the occurrence comes back if the cancellation is removed.
        // This is the right path for an *already overridden* occurrence too —
        // deleting its override row would not remove the occurrence, it would
        // resurrect it at the rule's own time.
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
        // Delete is a single keystroke on a focused block, so it needs a way
        // back — offered once the row is really gone, not before. The block
        // returns with its original id, which is what makes undo a plain insert
        // rather than a special case (Domain Rule 17).
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
      // Domain Rule 13, both directions. Completing the task is offered only on
      // the block that finishes it; reopening it is offered on any block of a
      // task that is already complete, because that block is now work again.
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
            // Routes a habit block to the function that also records the
            // habit's day (Phase 6). Null for every other kind.
            habitId: item.habitId,
          }),
      });
    },
    [mutate],
  );

  const createAt = React.useCallback((span: DaySpan) => {
    setDraft({ mode: "create", span });
  }, []);

  /*
   * "Add event", arriving from the command palette as `?new=event`.
   *
   * The draft opens on the first day of the range that is not already past —
   * today, when today is on screen — at the next whole hour, clamped inside the
   * grid. The intent is then dropped from the URL with `replace`, so a reload
   * or a back button does not reopen an editor the user has dismissed, and the
   * effect cannot fire twice for one command.
   */
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

  /**
   * "Add to week" from the drawer's HABITS section (Phase 6).
   *
   * Not optimistic, and not a `mutate`: the action asks the *server* what the
   * week is missing and creates however many blocks that is, so there is no
   * single row to draw ahead of the answer — an overlay here would have to
   * re-derive the plan on the client and would disagree with the server the
   * first time the two saw different existing blocks. `refresh()` inside the
   * action brings the new blocks back, and the row reads as pending until it
   * does (Domain Rule 11: the failure is still surfaced).
   */
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
            }),
          announcement: addedMessage(values.title),
        });
        return;
      }

      const item = current.item;
      const blockId = item.blockId;
      setDraft(null);
      const moved = !sameSpan(spanOf(item, timezone), span);

      /*
       * An occurrence has times of its own and nothing else. Editing its
       * content is the recurring-event editor, an explicit non-goal of this
       * phase (specs/03-weekly-calendar.md), and `blockId` is null for one that
       * has never been overridden — so sending it to `updateBlock` would fail
       * validation on a null id rather than doing something useful. Its times
       * go through the override path, which is the whole of what Phase 3
       * promises for a recurring block — and the editor offers it nothing but
       * its times, so nothing typed can be lost here.
       */
      if (item.occurrence !== null) {
        if (moved) reschedule(item, span, savedMessage(values.title));
        return;
      }

      // Content and times are two writes because they are two concerns: a work
      // block's title belongs to its task and never moves, while its time is
      // the block's own (Domain Rules 1 and 2). Sending both as one update
      // would let an edit to a title rewrite a schedule.
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
            // Only an event carries a title of its own. `values.title` for a
            // work or habit block is the *parent's* name, resolved on read, so
            // sending it would stamp a copy into `calendar_blocks.title` — from
            // then on the block shows that frozen string and a rename of the
            // task or habit never reaches it (Domain Rule 2). Omitting the key
            // leaves the column at `''`, which is what makes the parent's name
            // the only one there is.
            ...(item.kind === "event" ? { title: values.title } : {}),
            description: values.description,
            color: values.color,
          }),
      });

      if (moved) reschedule(item, span);
    },
    [mutate, reschedule, timezone],
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

  /* ---------------------------------------------------------------------- */
  /* Chrome                                                                 */
  /* ---------------------------------------------------------------------- */

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
                  // A pressed toggle for the panel, which stays; a control
                  // that opens a dialog for the sheet, which is one.
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
        /*
         * An explicit id, because dnd-kit derives its own from a module-level
         * counter rather than React's `useId`. The server process has usually
         * rendered the calendar before, so its counter is ahead of a freshly
         * loaded client's, and every draggable's `aria-describedby` comes back
         * pointing at a different node than the server sent — a hydration
         * mismatch React reports and does not patch up.
         */
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
          <div className="flex min-h-0 flex-1 gap-4 pb-4 md:pb-5">
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
        pending={pending}
      />
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */

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
 * Whether Undo can really put this block back.
 *
 * A work block is re-created by `scheduleTask` and a plain event by
 * `createBlock`, both with their original id. A **habit** block has neither
 * path — `createBlock` only makes events, so "undoing" one would replace a
 * generated habit block with a plain event and quietly sever the habit link
 * (Domain Rule 13: a habit block always has a habit). Habit block generation is
 * Phase 6's, so Phase 3 offers no undo for one rather than offering a wrong
 * one. An occurrence is not deleted at all — it is cancelled — so it has
 * nothing to restore either.
 */
function restorable(item: CalendarItem): boolean {
  return item.occurrence === null && (item.kind === "event" || item.kind === "work");
}

function sameSpan(a: DaySpan, b: DaySpan): boolean {
  return a.date === b.date && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes;
}

/**
 * A task appears in exactly one of the drawer's sections (`PlanningData`), so
 * the first match is the only one.
 */
function findPlanTask(plan: CalendarWeekData["plan"], taskId: Uuid): PlanTask | null {
  return (
    plan.overdue.find((task) => task.id === taskId) ??
    plan.dueInRange.find((task) => task.id === taskId) ??
    plan.unscheduled.find((task) => task.id === taskId) ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/* The palette's "Add event"                                                  */
/* -------------------------------------------------------------------------- */

/** An hour, the length a new event opens at before the user says otherwise. */
const NEW_EVENT_MINUTES = 60;
/** Where a draft opens on a day that is not today, and before the clock is known. */
const NEW_EVENT_FALLBACK_START = 9 * 60;

/**
 * Where "Add event" puts its draft: the next whole hour today, or nine o'clock
 * on the first day of a range that has not started yet, clamped so the block
 * fits inside the grid the user is looking at.
 *
 * It is a suggestion — the editor opens on it with the date and both times
 * editable — so it is chosen to be the fewest keystrokes from right, not to be
 * clever.
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
