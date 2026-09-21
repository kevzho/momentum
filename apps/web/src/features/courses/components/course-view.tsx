"use client";

import * as React from "react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { ArrowLeftIcon, PencilIcon, PlusIcon } from "lucide-react";

import { formatLocalDate } from "@momentum/core/time";
import type { CourseWeek } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { toast } from "@momentum/ui/components/toast";

import { CommittedTextarea } from "@/components/committed-field";
import {
  deleteCourse,
  setCourseWeek,
  updateCourse,
  updateSyllabus,
} from "@/features/courses/actions";
import { CourseFormDialog } from "@/features/courses/components/course-form-dialog";
import { AssignmentRow, CourseWeekRow } from "@/features/courses/components/course-week-row";
import { DeleteCourseDialog } from "@/features/courses/components/delete-course-dialog";
import { COURSES_HREF } from "@/features/courses/navigation";
import type {
  CourseFormValues,
  CoursePageData,
  CourseSummary,
  CourseWeekPatch,
  CourseWeekView,
} from "@/features/courses/types";
import { useQuickAdd } from "@/features/tasks/components/quick-add-context";
import { failure, type ActionResult } from "@/lib/actions/result";
import { useOptimisticAction } from "@/lib/actions/use-optimistic-action";
import { reportError } from "@/lib/report-error";

/**
 * One course: its header, syllabus, and every week of the term with what is
 * written against it and what is due inside it. Week text and the syllabus
 * are optimistic; editing the course and deleting it are round trips.
 */
export function CourseView({ data }: { data: CoursePageData }) {
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CourseSummary | null>(null);

  const { summary } = data;
  const { course } = summary;

  const weeks = useOptimisticAction<readonly CourseWeekView[], CourseWeekPatch, CourseWeek>({
    serverState: data.weeks,
    action: setCourseWeek,
    optimistic: (state, patch) =>
      state.map((view) =>
        view.span.number === patch.weekNumber
          ? { ...view, week: overlay(view.week, patch, course.id, course.userId) }
          : view,
      ),
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
                  weeks.run({ courseId: course.id, weekNumber: view.span.number, ...patch })
                }
                onAddAssignment={addAssignment}
              />
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="course-syllabus-heading" className="flex flex-col gap-2">
            <h2
              id="course-syllabus-heading"
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              Syllabus
            </h2>
            <CommittedTextarea
              aria-label="Syllabus"
              placeholder="Grading, office hours, exam dates, policies — anything from the syllabus worth keeping to hand."
              rows={12}
              value={syllabus.state}
              onCommit={(next) => syllabus.run(next)}
            />
          </section>

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

/** The week row as it will read once the write lands; ids are placeholders until the refresh. */
function overlay(
  current: CourseWeek | null,
  patch: CourseWeekPatch,
  courseId: CourseWeek["courseId"],
  userId: CourseWeek["userId"],
): CourseWeek {
  return {
    id: current?.id ?? `pending:${patch.weekNumber}`,
    userId,
    courseId,
    weekNumber: patch.weekNumber,
    topic: patch.topic,
    materials: patch.materials,
    createdAt: current?.createdAt ?? ("1970-01-01T00:00:00.000Z" as CourseWeek["createdAt"]),
    updatedAt: current?.updatedAt ?? ("1970-01-01T00:00:00.000Z" as CourseWeek["updatedAt"]),
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
