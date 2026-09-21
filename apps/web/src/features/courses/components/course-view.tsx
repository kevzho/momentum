"use client";

import * as React from "react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { ArrowLeftIcon, PencilIcon, PlusIcon } from "lucide-react";

import { formatLocalDate, nowInstant } from "@momentum/core/time";
import type { CourseItem, CourseItemKind, CourseWeek, LocalDate, Uuid } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { toast } from "@momentum/ui/components/toast";

import {
  createCourseItem,
  deleteCourse,
  deleteCourseItem,
  setCourseItemDone,
  setCourseWeek,
  updateCourse,
  updateCourseItem,
  updateSyllabus,
} from "@/features/courses/actions";
import { CourseFormDialog } from "@/features/courses/components/course-form-dialog";
import { AssignmentRow, CourseWeekRow } from "@/features/courses/components/course-week-row";
import { DeleteCourseDialog } from "@/features/courses/components/delete-course-dialog";
import { SyllabusPanel } from "@/features/courses/components/syllabus-panel";
import { COURSES_HREF } from "@/features/courses/navigation";
import type {
  CourseFormValues,
  CoursePageData,
  CourseSummary,
  CourseWeekPatch,
  CourseWeekView,
  NewCourseItemDraft,
} from "@/features/courses/types";
import { useQuickAdd } from "@/features/tasks/components/quick-add-context";
import { failure, type ActionResult } from "@/lib/actions/result";
import { useOptimisticAction } from "@/lib/actions/use-optimistic-action";
import { reportError } from "@/lib/report-error";

/**
 * One course: its header, syllabus, and every week of the term with its
 * topic, checklist, assignments and notes. Week text, checklist entries and
 * the syllabus notes are optimistic over one overlay of the weeks; editing
 * the course, deleting it and the PDF are round trips.
 */

/** Every write to the weeks' overlay, dispatched to its own action. */
type WeekMutation =
  | { kind: "text"; patch: CourseWeekPatch }
  | { kind: "add-item"; draft: NewCourseItemDraft }
  | { kind: "item-done"; item: CourseItem; done: boolean }
  | { kind: "item-plan"; item: CourseItem; plannedOn: LocalDate | null }
  | { kind: "item-kind"; item: CourseItem; itemKind: CourseItemKind }
  | { kind: "remove-item"; item: CourseItem };

export function CourseView({ data }: { data: CoursePageData }) {
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CourseSummary | null>(null);

  const { summary } = data;
  const { course } = summary;

  const weeks = useOptimisticAction<readonly CourseWeekView[], WeekMutation, unknown>({
    serverState: data.weeks,
    action: (mutation) => runWeekMutation(mutation, course.id),
    optimistic: (state, mutation) => applyWeekMutation(state, mutation, course),
  });

  const syllabus = useOptimisticAction<string, string, unknown>({
    serverState: course.syllabus ?? "",
    action: (next) => updateSyllabus({ id: course.id, syllabus: next }),
    optimistic: (_state, next) => next,
  });

  // Quick Add seeded with the project and the week's last day, so a capture
  // lands in this course, due inside that week.
  function addAssignment(view: CourseWeekView | null): void {
    quickAdd.open({
      kind: "task",
      projectId: course.projectId,
      dueDate: view?.span.end ?? currentWeekEnd(data) ?? null,
      placeholder: "Problem set 3 due fri 2h",
    });
  }

  function saveCourse(values: CourseFormValues): void {
    startTransition(async () => {
      const result = await settle(() => updateCourse({ id: course.id, ...values }), "updateCourse");
      if (!result.ok) {
        toast.error(result.error.message, {
          action: { label: "Retry", onClick: () => saveCourse(values) },
        });
        return;
      }
      setEditing(false);
      toast.success("Course saved");
    });
  }

  function confirmDelete(target: CourseSummary): void {
    startTransition(async () => {
      const result = await settle(() => deleteCourse({ id: target.course.id }), "deleteCourse");
      if (!result.ok) {
        toast.error(result.error.message, {
          action: { label: "Retry", onClick: () => confirmDelete(target) },
        });
        return;
      }
      toast.success(`Deleted “${target.name}”. Its tasks are still in the project.`);
      router.push(COURSES_HREF);
    });
  }

  const meta = [
    course.code,
    course.instructor,
    course.location,
    `${formatLocalDate(course.termStart, "medium")} – ${formatLocalDate(course.termEnd, "medium")}`,
    summary.currentWeek === null ? null : `Week ${summary.currentWeek} of ${summary.weekCount}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ProjectDot color={summary.color} className="size-2.5 shrink-0" />
            <span className="truncate">{summary.name}</span>
          </span>
        }
        description={meta}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href={COURSES_HREF}>
                <ArrowLeftIcon aria-hidden="true" />
                Courses
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon aria-hidden="true" />
              Edit
            </Button>
            <Button size="sm" onClick={() => addAssignment(null)}>
              <PlusIcon aria-hidden="true" />
              Add assignment
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="course-weeks-heading" className="min-w-0">
          <h2
            id="course-weeks-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Weeks
          </h2>
          <div className="flex flex-col divide-y">
            {weeks.state.map((view) => (
              <CourseWeekRow
                key={view.span.number}
                view={view}
                today={data.today}
                pending={weeks.pending}
                onCommit={(patch) =>
                  weeks.run({
                    kind: "text",
                    patch: { courseId: course.id, weekNumber: view.span.number, ...patch },
                  })
                }
                onAddAssignment={addAssignment}
                onAddItem={(draft) => weeks.run({ kind: "add-item", draft })}
                onToggleItem={(item, done) => weeks.run({ kind: "item-done", item, done })}
                onPlanItem={(item, plannedOn) => weeks.run({ kind: "item-plan", item, plannedOn })}
                onItemKind={(item, itemKind) => weeks.run({ kind: "item-kind", item, itemKind })}
                onRemoveItem={(item) => weeks.run({ kind: "remove-item", item })}
              />
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <SyllabusPanel
            courseId={course.id}
            fileName={course.syllabusFileName}
            notes={syllabus.state}
            onNotes={(next) => syllabus.run(next)}
            onFileChanged={() => router.refresh()}
          />

          {data.unplaced.length === 0 ? null : (
            <section aria-labelledby="course-unplaced-heading" className="flex flex-col gap-2">
              <h2
                id="course-unplaced-heading"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Not in a week
              </h2>
              <p className="text-xs text-muted-foreground">
                Tasks in this project with no due date, or due outside the term.
              </p>
              <ul className="flex flex-col gap-0.5 text-sm">
                {data.unplaced.map((task) => (
                  <AssignmentRow key={task.id} task={task} today={data.today} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <CourseFormDialog
        open={editing}
        course={summary}
        today={data.today}
        weekStart={data.weekStart}
        pending={pending}
        onSubmit={saveCourse}
        onClose={() => {
          if (!pending) setEditing(false);
        }}
        onDelete={() => {
          setEditing(false);
          setDeleting(summary);
        }}
      />

      <DeleteCourseDialog
        course={deleting}
        pending={pending}
        onConfirm={confirmDelete}
        onClose={() => {
          if (!pending) setDeleting(null);
        }}
      />
    </PageContainer>
  );
}

function runWeekMutation(mutation: WeekMutation, courseId: Uuid): Promise<ActionResult<unknown>> {
  switch (mutation.kind) {
    case "text":
      return setCourseWeek(mutation.patch);
    case "add-item":
      return createCourseItem({ courseId, ...mutation.draft });
    case "item-done":
      return setCourseItemDone({ id: mutation.item.id, done: mutation.done });
    case "item-plan":
      return updateCourseItem({ id: mutation.item.id, plannedOn: mutation.plannedOn });
    case "item-kind":
      return updateCourseItem({ id: mutation.item.id, kind: mutation.itemKind });
    case "remove-item":
      return deleteCourseItem({ id: mutation.item.id });
  }
}

/** The weeks as they will read once the write lands. Pure; React discards it on failure. */
function applyWeekMutation(
  state: readonly CourseWeekView[],
  mutation: WeekMutation,
  course: CourseSummary["course"],
): readonly CourseWeekView[] {
  switch (mutation.kind) {
    case "text":
      return state.map((view) =>
        view.span.number === mutation.patch.weekNumber
          ? { ...view, week: overlayWeek(view.week, mutation.patch, course.id, course.userId) }
          : view,
      );
    case "add-item":
      return state.map((view) =>
        view.span.number === mutation.draft.weekNumber
          ? { ...view, items: [...view.items, overlayItem(mutation.draft, course, view.items)] }
          : view,
      );
    case "item-done":
      return patchItem(state, mutation.item.id, {
        completedAt: mutation.done ? nowInstant() : null,
      });
    case "item-plan":
      return patchItem(state, mutation.item.id, { plannedOn: mutation.plannedOn });
    case "item-kind":
      return patchItem(state, mutation.item.id, { kind: mutation.itemKind });
    case "remove-item":
      return state.map((view) => ({
        ...view,
        items: view.items.filter((item) => item.id !== mutation.item.id),
      }));
  }
}

function patchItem(
  state: readonly CourseWeekView[],
  id: Uuid,
  patch: Partial<CourseItem>,
): readonly CourseWeekView[] {
  return state.map((view) => ({
    ...view,
    items: view.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

/** A new entry as the row will read; stamps are the client's until the refresh replaces them. */
function overlayItem(
  draft: NewCourseItemDraft,
  course: CourseSummary["course"],
  siblings: readonly CourseItem[],
): CourseItem {
  const now = nowInstant();
  return {
    id: draft.id,
    userId: course.userId,
    courseId: course.id,
    weekNumber: draft.weekNumber,
    kind: draft.kind,
    title: draft.title,
    url: draft.url,
    plannedOn: draft.plannedOn,
    completedAt: null,
    sortOrder: (siblings.at(-1)?.sortOrder ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** The week row as it will read once the write lands; ids are placeholders until the refresh. */
function overlayWeek(
  current: CourseWeek | null,
  patch: CourseWeekPatch,
  courseId: CourseWeek["courseId"],
  userId: CourseWeek["userId"],
): CourseWeek {
  const now = nowInstant();
  return {
    id: current?.id ?? `pending:${patch.weekNumber}`,
    userId,
    courseId,
    weekNumber: patch.weekNumber,
    topic: patch.topic,
    materials: patch.materials,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
}

function currentWeekEnd(data: CoursePageData) {
  return data.weeks.find((view) => view.isCurrent)?.span.end ?? null;
}

/** A rejected call becomes a failed result, so it never reaches the route's error boundary. */
async function settle<T>(
  call: () => Promise<ActionResult<T>>,
  source: string,
): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch (thrown) {
    unstable_rethrow(thrown);
    reportError(thrown, { source });
    return failure("unavailable", "Momentum could not reach the server. Nothing was saved.");
  }
}
