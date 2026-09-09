"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import {
  coverageOf,
  isEmptyFilter,
  matchesView,
  scheduledMinutesOf,
  selectTasks,
  sortTasks,
  type TaskView,
} from "@momentum/core/tasks";
import type { Task, Uuid } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { useAnnounce } from "@momentum/ui/components/announcer";
import { cn } from "@momentum/ui/lib/utils";

import { BulkActionBar } from "@/features/tasks/components/bulk-action-bar";
import type { DeleteCascade } from "@/features/tasks/components/confirm-delete-dialog";
import { TaskDetailSheet } from "@/features/tasks/components/task-detail-sheet";
import { TaskList, TaskListKeyHint } from "@/features/tasks/components/task-list";
import type { TaskRowData } from "@/features/tasks/components/task-list-row";
import { TaskToolbar } from "@/features/tasks/components/task-toolbar";
import { useQuickAdd } from "@/features/tasks/components/quick-add";
import { useListPreferences } from "@/features/tasks/list-preferences";
import { useTaskMutations } from "@/features/tasks/use-task-mutations";
import type { TasksPageData } from "@/features/tasks/types";
import { TAB_VIEWS, VIEW_LABELS, taskHref, type TaskParams } from "@/features/tasks/view-params";
import { useUserSettings } from "@/lib/time/user-settings";

/**
 * The task manager.
 *
 * One client island over the server's props. It holds no copy of server data:
 * `useTaskMutations` wraps the whole page state in a single `useOptimistic`
 * overlay, and every view, count and coverage number below is derived from that
 * overlay by the pure functions in `@momentum/core/tasks` (docs/ARCHITECTURE.md
 * §7, §8).
 *
 * That derivation is what makes optimistic completion behave correctly for
 * free. Completing a task patches two fields; the task then fails
 * `matchesView(…, "today")` and passes `matchesView(…, "completed")`, so it
 * leaves one list and joins another with no code that moves it. On failure the
 * transition settles against unchanged props, React discards the overlay, and
 * the row returns to where it was (Domain Rule 11).
 */
export function TasksView({ data, params }: { data: TasksPageData; params: TaskParams }) {
  const router = useRouter();
  const announce = useAnnounce();
  const settings = useUserSettings();
  const quickAdd = useQuickAdd();

  const { state, pending, pendingIds, failure, mutate } = useTaskMutations(data);
  const [preferences, setPreferences] = useListPreferences();
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<Uuid>>(new Set());
  const [focusedId, setFocusedId] = React.useState<Uuid | null>(null);

  const { view, projectId } = params;
  const context = React.useMemo(
    () => ({ today: state.today, projectId }),
    [state.today, projectId],
  );

  /*
   * A project view seeds Quick Add with its project, whichever way it is
   * opened: `Q`, the palette's "Add task", or the "New task" button above —
   * one set of defaults, registered with the provider for as long as the page
   * is showing that project, so the two routes cannot drift.
   */
  React.useEffect(() => {
    quickAdd.setDefaults(projectId === null ? {} : { projectId });
    return () => quickAdd.setDefaults({});
  }, [quickAdd, projectId]);

  /** Which tasks own at least one work block — the only correct source (Domain Rule 2). */
  const scheduledTaskIds = React.useMemo(() => {
    const ids = new Set<Uuid>();
    for (const [taskId, blocks] of Object.entries(state.workBlocks)) {
      if (blocks.length > 0) ids.add(taskId);
    }
    return ids;
  }, [state.workBlocks]);

  const visible = React.useMemo(
    () =>
      sortTasks(
        selectTasks(state.tasks, view, context, preferences.filter, scheduledTaskIds),
        preferences.sort,
        preferences.direction,
      ),
    [state.tasks, view, context, preferences, scheduledTaskIds],
  );

  const rows = React.useMemo<TaskRowData[]>(
    () =>
      visible.map((task) => {
        const blocks = state.workBlocks[task.id] ?? [];
        const subtasks = state.tasks.filter((t) => t.parentTaskId === task.id);

        return {
          task,
          project: state.projects.find((p) => p.id === task.projectId) ?? null,
          coverage: coverageOf(task.estimatedMinutes, scheduledMinutesOf(blocks)),
          blockCount: blocks.length,
          subtaskCount: subtasks.length,
          completedSubtaskCount: subtasks.filter((t) => t.status === "completed").length,
        };
      }),
    [visible, state.workBlocks, state.tasks, state.projects],
  );

  /** How many tasks each tab holds, before the toolbar's filters narrow them. */
  const counts = React.useMemo(() => {
    const result = {} as Record<TaskView, number>;
    for (const tab of TAB_VIEWS) {
      result[tab] = state.tasks.filter((task) => matchesView(task, tab, context)).length;
    }
    result.project = state.tasks.filter((task) => matchesView(task, "project", context)).length;
    return result;
  }, [state.tasks, context]);

  const openTask = React.useMemo(
    () => state.tasks.find((task) => task.id === params.taskId) ?? null,
    [state.tasks, params.taskId],
  );

  const openSubtasks = React.useMemo(
    () =>
      openTask === null
        ? []
        : sortTasks(
            state.tasks.filter((task) => task.parentTaskId === openTask.id),
            "manual",
          ),
    [state.tasks, openTask],
  );

  /*
   * The sheet's open state lives in the URL, so a task is linkable and the back
   * button closes it (docs/ARCHITECTURE.md §7). `scroll: false` keeps the list
   * where it was; opening a task should not move the page under it.
   */
  const setOpenTask = React.useCallback(
    (taskId: Uuid | null) => {
      router.replace(taskHref({ view, projectId, taskId }), { scroll: false });
    },
    [router, view, projectId],
  );

  /*
   * The selection, narrowed to what is on screen.
   *
   * `selectedIds` is what the user picked; `visible` is what the view tab and
   * the toolbar's filters currently show. Everything downstream — the bar's
   * count, its three actions, and the rows' own checkboxes — reads this
   * intersection, so a bulk Delete can never reach a row the user cannot see,
   * and the number on the bar is by construction the number of ids the mutation
   * receives. Picks that scrolled out of the view under a filter are kept
   * rather than dropped, and come back when the filter is cleared; any further
   * selection gesture re-bases the set on the rows in front of the user. This
   * is the treatment the focus cursor already gets in `task-list.tsx`.
   */
  const selectedTasks = React.useMemo(
    () => visible.filter((task) => selectedIds.has(task.id)),
    [visible, selectedIds],
  );

  const visibleSelectedIds = React.useMemo(
    () => new Set(selectedTasks.map((task) => task.id)),
    [selectedTasks],
  );

  function clearSelection(): void {
    setSelectedIds(new Set());
  }

  /**
   * What deleting these tasks takes with them — subtasks, and the work blocks
   * of both — for the confirmation to say in numbers (Domain Rule 13: blocks
   * go with their parent; nothing else does).
   */
  const cascadeOf = React.useCallback(
    (ids: ReadonlySet<Uuid>): DeleteCascade => {
      const subtasks = state.tasks.filter(
        (task) => task.parentTaskId !== null && ids.has(task.parentTaskId),
      );
      const removed = [...ids, ...subtasks.map((task) => task.id)];
      const blocks = removed.reduce((total, id) => total + (state.workBlocks[id]?.length ?? 0), 0);
      return { subtasks: subtasks.length, blocks };
    },
    [state.tasks, state.workBlocks],
  );

  const selectionCascade = React.useMemo(
    () => cascadeOf(visibleSelectedIds),
    [cascadeOf, visibleSelectedIds],
  );

  /*
   * Where focus goes when the bulk bar removes itself.
   *
   * Complete, Move, Delete and Clear all empty the selection, and an empty
   * selection is what unmounts the bar — so the button the user just pressed
   * disappears from under the focus ring. Nothing inside the list is a safe
   * landing place: a bulk Delete can take every row with it and leave an empty
   * state behind. The key hint between the bar and the list is rendered either
   * way, so it is the anchor (Domain Rule 10; the calendar's Plan panel returns
   * focus to its toggle for the same reason).
   */
  const listHint = React.useRef<HTMLParagraphElement>(null);

  /**
   * A drop, and the keyboard's `Alt+↑/↓`, arrive here as the same call.
   * `mutate` computes the rows to write with `sortOrdersForMove` and persists
   * them (Domain Rule 10: the two paths are one mutation). The move is
   * announced only when a write was issued — a live region that reports a move
   * nothing made is worse than one that says nothing.
   */
  function moveTask(taskId: Uuid, toIndex: number): void {
    const task = visible.find((t) => t.id === taskId);
    if (task === undefined) return;

    if (!mutate.reorder(taskId, visible, toIndex)) return;
    announce(`${task.title} moved to position ${toIndex + 1} of ${visible.length}`);
  }

  function onDragEnd(event: DragEndEvent): void {
    const active = event.active.data.current;
    const over = event.over?.data.current;
    if (active?.type !== "task-row" || over?.type !== "task-slot") return;
    if (typeof active.taskId !== "string" || typeof over.index !== "number") return;

    moveTask(active.taskId, over.index);
  }

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a click on a row still
    // opens it and a drag handle does not hijack every press.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const title = view === "project" ? projectNameOf(state, projectId) : VIEW_LABELS[view];

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={DESCRIPTIONS[view]}
        actions={
          <Button size="sm" onClick={() => quickAdd.open({ projectId })}>
            <PlusIcon aria-hidden="true" />
            New task
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <nav aria-label="Task views" className="flex flex-wrap items-center gap-1">
          {TAB_VIEWS.map((tab) => (
            <Button
              key={tab}
              asChild
              size="sm"
              variant={tab === view ? "secondary" : "ghost"}
              className={cn(tab === view && "font-medium")}
            >
              <Link href={taskHref({ view: tab })} aria-current={tab === view ? "page" : undefined}>
                {VIEW_LABELS[tab]}
                <span data-slot="numeric" className="text-xs text-muted-foreground">
                  {counts[tab]}
                </span>
              </Link>
            </Button>
          ))}
        </nav>

        <TaskToolbar
          sort={preferences.sort}
          direction={preferences.direction}
          filter={preferences.filter}
          projects={state.projects}
          matchCount={rows.length}
          totalCount={counts[view]}
          onSortChange={(sort) => setPreferences({ sort })}
          onDirectionChange={(direction) => setPreferences({ direction })}
          onFilterChange={(filter) => setPreferences({ filter })}
        />

        <BulkActionBar
          selectedIds={visibleSelectedIds}
          allCompleted={
            selectedTasks.length > 0 && selectedTasks.every((task) => task.status === "completed")
          }
          projects={state.projects}
          cascade={selectionCascade}
          pending={pending}
          returnFocusTo={listHint}
          onComplete={(completed) => {
            const ids = [...visibleSelectedIds];
            mutate.bulkComplete(ids, completed);
            announce(`${taskCount(ids.length)} ${completed ? "completed" : "reopened"}`);
            clearSelection();
          }}
          onMoveToProject={(target) => {
            const ids = [...visibleSelectedIds];
            mutate.bulkMove(ids, target);
            announce(`${taskCount(ids.length)} moved`);
            clearSelection();
          }}
          onDelete={() => {
            const ids = [...visibleSelectedIds];
            mutate.bulkDelete(ids);
            announce(`${taskCount(ids.length)} deleted`);
            clearSelection();
          }}
          onClear={clearSelection}
        />

        <TaskListKeyHint ref={listHint} />

        <DndContext
          // An explicit id: dnd-kit otherwise derives one from a module-level
          // counter, which a server process that has rendered before gets
          // wrong — the hydration mismatch Phase 3 found on every draggable.
          id="task-list-dnd"
          sensors={sensors}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <TaskList
            rows={rows}
            today={state.today}
            view={view}
            filtered={!isEmptyFilter(preferences.filter)}
            selectedIds={visibleSelectedIds}
            pendingIds={pendingIds}
            focusedId={focusedId}
            onFocusedIdChange={setFocusedId}
            onToggleComplete={(taskId, completed) => {
              const task = state.tasks.find((t) => t.id === taskId);
              mutate.setCompletion(taskId, completed);
              if (task) announce(`${task.title} ${completed ? "completed" : "reopened"}`);
            }}
            onOpen={setOpenTask}
            onSelectionChange={setSelectedIds}
            onMove={moveTask}
          />
        </DndContext>
      </div>

      <TaskDetailSheet
        task={openTask}
        subtasks={openSubtasks}
        workBlocks={openTask === null ? [] : (state.workBlocks[openTask.id] ?? [])}
        projects={state.projects}
        today={state.today}
        weekStart={settings.weekStart}
        pending={pending}
        pendingIds={pendingIds}
        failure={
          openTask !== null && failure !== null && failure.ids.includes(openTask.id)
            ? failure.error
            : null
        }
        cascade={openTask === null ? undefined : cascadeOf(new Set([openTask.id]))}
        onOpenChange={(open) => {
          if (!open) setOpenTask(null);
        }}
        onPatch={(id, fields) => mutate.update(id, fields)}
        onToggleComplete={(id, completed) => mutate.setCompletion(id, completed)}
        onDelete={(id) => {
          if (id === openTask?.id) setOpenTask(null);
          mutate.remove(id);
        }}
        onArchive={(id) => {
          setOpenTask(null);
          mutate.archive(id);
        }}
        onAddBlock={(taskId, span) => mutate.addBlock(taskId, span)}
        onUpdateBlock={(taskId, blockId, span) => mutate.updateBlock(taskId, blockId, span)}
        onRemoveBlock={(taskId, blockId) => mutate.removeBlock(taskId, blockId)}
        onAddSubtask={(parentId, subtaskTitle) => mutate.addSubtask(parentId, subtaskTitle)}
        onMoveSubtask={(id, toIndex) => {
          const ordered = openSubtasks;
          mutate.reorder(id, ordered, toIndex);
        }}
      />
    </PageContainer>
  );
}

const DESCRIPTIONS: Record<TaskView, string> = {
  inbox: "Captured, not yet filed into a project.",
  today: "Due today or overdue. When the work happens is on the calendar.",
  upcoming: "Deadlines after today.",
  all: "Every open task.",
  completed: "What you have finished.",
  project: "Open work in this project.",
};

/** "1 task", "3 tasks" — announcements pluralise the way the bar's own label does. */
function taskCount(count: number): string {
  return `${count} ${count === 1 ? "task" : "tasks"}`;
}

function projectNameOf(state: TasksPageData, projectId: Uuid | null): string {
  if (projectId === null) return "Project";
  return state.projects.find((project) => project.id === projectId)?.name ?? "Project";
}

export type { Task };
