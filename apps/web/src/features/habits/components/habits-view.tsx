"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, RepeatIcon } from "lucide-react";

import { amountToRecord, dailyTargetOf } from "@momentum/core/habits";
import { formatLocalDate } from "@momentum/core/time";
import type { LocalDate, Uuid } from "@momentum/core/types";

import { useAnnounce } from "@momentum/ui/components/announcer";
import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { SegmentedControl } from "@momentum/ui/components/segmented-control";
import { toast } from "@momentum/ui/components/toast";

import { HABITS_COPY } from "@/features/habits/copy";
import { DeleteHabitDialog } from "@/features/habits/components/delete-habit-dialog";
import { HabitDetailSheet } from "@/features/habits/components/habit-detail-sheet";
import {
  HabitFormDialog,
  type HabitFormValues,
} from "@/features/habits/components/habit-form-dialog";
import { HabitRow } from "@/features/habits/components/habit-row";
import {
  addHabitToWeek,
  archiveHabit,
  createHabit,
  deleteHabit,
  setHabitCompletion,
  updateHabit,
} from "@/features/habits/actions";
import { applyCompletion } from "@/features/habits/optimistic";
import type { ActionResult } from "@/lib/actions/result";
import type { CompletionPatch, HabitView, HabitsPageData } from "@/features/habits/types";
import { useOptimisticAction } from "@/lib/actions/use-optimistic-action";

/**
 * The habits page island over server-resolved data: it fetches nothing and
 * reads no clock. Recording a day is the only optimistic mutation; the rest
 * change the page's shape and are plain round trips.
 */

const SCOPES = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
] as const;

type Scope = (typeof SCOPES)[number]["value"];

/**
 * The open form. A new habit's id is minted when the form opens, not per submit,
 * so a retry after a lost response sends the same id and `createHabit` can
 * treat the unique violation as success.
 */
type Editing = { habit: HabitView; id: Uuid } | { habit: null; id: Uuid };

export function HabitsView({
  data,
  newHabit = false,
}: {
  data: HabitsPageData;
  /** The palette's "Add habit" intent, honoured once (features/habits/navigation.ts). */
  newHabit?: boolean;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const [scope, setScope] = React.useState<Scope>("active");
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [deleting, setDeleting] = React.useState<HabitView | null>(null);
  const [openHabitId, setOpenHabitId] = React.useState<string | null>(null);
  const [pendingHabitId, setPendingHabitId] = React.useState<string | null>(null);

  const openNewHabit = React.useCallback(() => {
    setEditing({ habit: null, id: crypto.randomUUID() });
  }, []);

  // `?new=habit` from the palette: open the form once, then drop the intent from
  // the URL so a reload or back does not reopen a dismissed dialog.
  const handledNewHabit = React.useRef(false);
  React.useEffect(() => {
    if (!newHabit || handledNewHabit.current) return;
    handledNewHabit.current = true;
    openNewHabit();
    router.replace("/habits");
  }, [newHabit, openNewHabit, router]);

  const completion = useOptimisticAction<HabitsPageData, CompletionPatch, unknown>({
    serverState: data,
    action: setHabitCompletion,
    optimistic: applyCompletion,
    onError: () => setPendingHabitId(null),
    onSuccess: () => setPendingHabitId(null),
  });

  const page = completion.state;
  const habits = scope === "active" ? page.active : page.archived;
  const openHabit = [...page.active, ...page.archived].find(
    (view) => view.habit.id === openHabitId,
  );

  const toggleDay = React.useCallback(
    (view: HabitView, date: LocalDate) => {
      const day = view.week.find((entry) => entry.date === date) ?? {
        amount: 0,
        target: dailyTargetOf(view.habit),
        state: "free" as const,
      };
      const recorded = day.state !== "met";

      setPendingHabitId(view.habit.id);
      announce(
        recorded
          ? `${view.habit.name} recorded for ${formatLocalDate(date, "long")}`
          : `${view.habit.name} no longer recorded for ${formatLocalDate(date, "long")}`,
      );

      completion.run({
        habitId: view.habit.id,
        date,
        recorded,
        // Today calls the same function, so both surfaces record the same amount per press.
        amount: amountToRecord(view.habit, day, view.progress),
      });
    },
    [announce, completion],
  );

  // Shape-changing mutations are deliberately not optimistic: a rolled-back row
  // appearing and vanishing is worse than a moment's wait.
  const [busy, startTransition] = React.useTransition();

  const run = React.useCallback(
    (operation: () => Promise<ActionResult<unknown>>, onDone?: (data: unknown) => void) => {
      startTransition(async () => {
        try {
          const result = await operation();
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          onDone?.(result.data);
        } catch {
          toast.error("Momentum could not reach the server. Your change was not saved.");
        }
      });
    },
    [],
  );

  function submitForm(values: HabitFormValues): void {
    if (editing === null) return;

    if (editing.habit === null) {
      const { id } = editing;
      run(
        () => createHabit({ id, ...values }),
        () => {
          setEditing(null);
          announce(`${values.name} created`);
        },
      );
      return;
    }

    const { id } = editing.habit.habit;
    run(
      () => updateHabit({ id, ...values }),
      () => {
        setEditing(null);
        announce(`${values.name} saved`);
      },
    );
  }

  // The toast waits for the result: a second press creates nothing, and the
  // message must not contradict the calendar.
  function addToWeek(view: HabitView): void {
    const weekStartDate = page.week[0];
    if (weekStartDate === undefined) return;

    run(
      () => addHabitToWeek({ habitId: view.habit.id, weekStartDate }),
      (created) => {
        const count = Array.isArray(created) ? created.length : 0;
        if (count === 0) {
          toast.info(HABITS_COPY.alreadyReserved);
          return;
        }
        toast.info(
          count === 1
            ? `One block added for ${view.habit.name}.`
            : `${count} blocks added for ${view.habit.name}.`,
          { description: HABITS_COPY.addToWeekHint },
        );
      },
    );
  }

  // Focus hand-off when a row unmounts: the next row, else the previous, else
  // "New habit". The neighbour is chosen before the mutation runs, while the
  // row is still in the list.
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const newHabitRef = React.useRef<HTMLButtonElement | null>(null);

  function neighbourOf(habitId: Uuid): Uuid | null {
    const index = habits.findIndex((view) => view.habit.id === habitId);
    return (habits[index + 1] ?? habits[index - 1])?.habit.id ?? null;
  }

  function focusRow(habitId: Uuid | null): void {
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-habit-id]") ?? [],
    );
    const row = habitId === null ? undefined : rows.find((el) => el.dataset.habitId === habitId);
    const target = row?.querySelector<HTMLElement>("button") ?? newHabitRef.current;
    target?.focus();
  }

  function archive(view: HabitView, archived: boolean): void {
    const neighbour = neighbourOf(view.habit.id);
    run(
      () => archiveHabit({ id: view.habit.id, archived }),
      () => {
        focusRow(neighbour);
        announce(
          archived
            ? `${view.habit.name} archived. Its history is kept.`
            : `${view.habit.name} restored`,
        );
      },
    );
  }

  /** Runs the confirmed delete, and says where focus goes once the dialog is gone. */
  function confirmDelete(view: HabitView): () => void {
    const neighbour = neighbourOf(view.habit.id);
    setDeleting(null);
    run(
      () => deleteHabit({ id: view.habit.id }),
      () => {
        setOpenHabitId(null);
        announce(`${view.habit.name} deleted, with its history and its blocks`);
      },
    );
    return () => focusRow(neighbour);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Habits"
        description={HABITS_COPY.pageDescription}
        actions={
          <>
            <SegmentedControl<Scope>
              label="Habit scope"
              value={scope}
              onValueChange={setScope}
              options={SCOPES.map((item) => ({ ...item }))}
            />
            <Button ref={newHabitRef} size="sm" onClick={openNewHabit}>
              <PlusIcon aria-hidden="true" />
              New habit
            </Button>
          </>
        }
      />

      <section className="flex flex-col">
        {habits.length === 0 ? (
          <EmptyState
            icon={RepeatIcon}
            title={
              scope === "active" ? HABITS_COPY.emptyActiveTitle : HABITS_COPY.emptyArchivedTitle
            }
            description={
              scope === "active" ? HABITS_COPY.emptyActiveBody : HABITS_COPY.emptyArchivedBody
            }
            action={
              scope === "active" ? (
                <Button size="sm" onClick={openNewHabit}>
                  <PlusIcon aria-hidden="true" />
                  New habit
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul ref={listRef} className="flex flex-col divide-y">
            {habits.map((view) => (
              <li key={view.habit.id} data-habit-id={view.habit.id}>
                <HabitRow
                  view={view}
                  page={page}
                  pending={busy || (completion.pending && pendingHabitId === view.habit.id)}
                  onToggleDay={toggleDay}
                  onOpen={(next) => setOpenHabitId(next.habit.id)}
                  onEdit={(next) => setEditing({ habit: next, id: next.habit.id })}
                  onAddToWeek={addToWeek}
                  onArchive={archive}
                  onDelete={setDeleting}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <HabitFormDialog
        open={editing !== null}
        habit={editing?.habit?.habit ?? null}
        weekStart={page.weekStart}
        pending={busy}
        onSubmit={submitForm}
        onClose={() => setEditing(null)}
      />

      <DeleteHabitDialog
        view={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />

      <HabitDetailSheet view={openHabit ?? null} page={page} onClose={() => setOpenHabitId(null)} />
    </PageContainer>
  );
}
